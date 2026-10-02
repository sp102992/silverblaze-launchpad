// ─────────────────────────────────────────────────────────────────────────
// PROJECT TRACKING / WEEKLY FORECAST / TEAM UPDATES / BUILD CHECKLIST
//
// The "all in one tool" additions on top of the original intake form. All
// routes here require a logged-in manager session (requireAuth below) —
// none of this is ever reachable through a customer share-link, especially
// Team Updates, which is meant to stay an internal channel.
//
// Each project's extra sheets (Project Tracking, Weekly Forecast, Team
// Updates, Build Checklist) are created lazily, the same way the Final
// Configuration sheet already is — the first time a project actually uses
// one of these features, not upfront for every project.
// ─────────────────────────────────────────────────────────────────────────
const express = require('express');
const smartsheet = require('../smartsheetClient');
const projectStore = require('../projectStore');
const config = require('../config');
const { requireAuth } = require('../authMiddleware');
const projectTracking = require('../projectTrackingSchema');
const weeklyForecast = require('../weeklyForecastSchema');
const teamUpdates = require('../teamUpdatesSchema');
const checklist = require('../checklistSchema');
const health = require('../projectHealth');
const { canAccessProject, visibleProjects } = require('../permissions');
const users = require('../users');
const { loadAllSectionData } = require('./projects');
const { notify } = require('../notifications');

const router = express.Router();
router.use(requireAuth);

function whoAmI(req) {
  return req.session.displayName || req.session.username || 'Manager';
}

// Every :projectName-scoped route in this file goes through here — 404 if
// the project doesn't exist, 403 if it exists but this session's role/
// createdBy/assignedUsers doesn't grant access to it.
function getProjectOr404(req, res) {
  const project = projectStore.getProject(req.params.projectName);
  if (!project) { res.status(404).json({ error: 'Project not found. Retrieve or create it first.' }); return null; }
  if (!canAccessProject(req.session, project)) { res.status(403).json({ error: `You don't have access to "${project.projectName}".` }); return null; }
  return project;
}

// ── PORTFOLIO (All Projects) — rolls up every project's phase, status,
// completion %, open blockers, and a computed health signal. This is a
// read-only aggregation: nothing new is stored, it just reads the same
// sheets everything else already reads, once per project. NOTE: this route
// must be reached before projects.js's generic GET /:projectName handler —
// see the mount order in server/app.js.
//
// Manager-only, enforced here (not just by hiding the "All projects" nav
// item client-side) — a team member hitting this directly gets a 403, same
// pattern as requireDesigner() in routes/customFields.js. The Overview
// section is also config-gated off by default (SHOW_OVERVIEW_SECTION); this
// role check is independent of that flag and applies whenever it's on.
router.get('/portfolio', async (req, res) => {
  if (req.session.role !== 'manager') {
    return res.status(403).json({ error: 'Only a manager can view the All Projects overview.' });
  }
  try {
    // Every project — a manager sees the whole portfolio, not a filtered
    // subset (visibleProjects() would otherwise narrow this to created/
    // assigned projects the way it does for a team member's project list
    // elsewhere; that per-user filtering doesn't apply to a manager-only
    // view of everything).
    const projects = visibleProjects(req.session, projectStore.listProjects());
    const results = [];
    for (const project of projects) {
      const projectName = project.projectName;
      // One project with a problem (e.g. a Smartsheet sheet that was
      // renamed/deleted outside the portal) should never take down the
      // whole portfolio list — catch per-project and show a degraded card
      // instead of a 500 for everyone.
      try {
        const sectionsData = await loadAllSectionData(project, projectName);
        const pct = health.completionPct(sectionsData);

        let trackingData = {};
        if (project.trackingSheetId) {
          const cellMap = await smartsheet.getRowDataByClient(project.trackingSheetId, projectName);
          trackingData = cellMap ? projectTracking.fromCells(cellMap) : {};
        }

        let weeks = [];
        if (project.forecastSheetId) weeks = (await smartsheet.listRows(project.forecastSheetId)).map(weeklyForecast.fromRow);

        let unresolvedBlockers = 0;
        if (project.updatesSheetId) {
          const updates = (await smartsheet.listRows(project.updatesSheetId)).map(teamUpdates.fromRow);
          unresolvedBlockers = updates.filter((u) => u.type === 'Blocker' && !u.resolved).length;
        }

        const forecast = health.forecastProjection(trackingData, weeks);
        const { rag, reasons } = health.computeHealth({ trackingData, unresolvedBlockers, forecast });

        results.push({
          projectName,
          phase: trackingData.pt_phase || '',
          status: trackingData.pt_status || '',
          targetGoLive: trackingData.pt_golive_date || '',
          pmName: trackingData.pt_pm_name || '',
          completionPct: pct,
          unresolvedBlockers,
          projectedGoLive: forecast.projectedGoLive,
          rag,
          reasons,
        });
      } catch (perProjectErr) {
        console.error(`Portfolio: failed to load "${projectName}":`, perProjectErr);
        results.push({
          projectName,
          phase: '', status: '', targetGoLive: '', pmName: '',
          completionPct: 0,
          unresolvedBlockers: 0,
          projectedGoLive: null,
          rag: 'red',
          reasons: [`Could not load this project's data (${perProjectErr.message}). Open it directly to check its sections.`],
        });
      }
    }
    res.json({ projects: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

async function ensureLazySheet(project, projectName, storeKey, sheetName, columnDefs) {
  let sheetId = project[storeKey];
  if (!sheetId) {
    const sheet = await smartsheet.ensureSheetInWorkspace(project.workspaceId, sheetName, columnDefs);
    sheetId = sheet.id;
    project = projectStore.saveProject(projectName, { [storeKey]: sheetId });
  }
  return { sheetId, project };
}

// ── PROJECT TRACKING (SOW / timeline summary — one row per client) ───────
router.get('/:projectName/tracking', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'trackingSheetId', projectTracking.SHEET_NAME, projectTracking.columnDefs());
    const cellMap = await smartsheet.getRowDataByClient(sheetId, projectName);
    res.json({ found: !!cellMap, data: cellMap ? projectTracking.fromCells(cellMap) : {} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/tracking', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'trackingSheetId', projectTracking.SHEET_NAME, projectTracking.columnDefs());
    const cells = projectTracking.toCells(req.body.formData || {});
    cells['Status'] = 'complete';
    cells['Submitted By'] = whoAmI(req);
    cells['Submitted At'] = new Date().toISOString();
    await smartsheet.upsertRow(sheetId, projectName, cells);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── WEEKLY FORECAST (append per week, edit in place for actual hours) ────
router.get('/:projectName/forecast', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'forecastSheetId', weeklyForecast.SHEET_NAME, weeklyForecast.columnDefs());
    const rows = await smartsheet.listRows(sheetId);
    res.json({ weeks: rows.map(weeklyForecast.fromRow) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/forecast', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'forecastSheetId', weeklyForecast.SHEET_NAME, weeklyForecast.columnDefs());
    const cells = weeklyForecast.toCells(req.body || {});
    cells['Entered By'] = whoAmI(req);
    cells['Entered At'] = new Date().toISOString();
    const rowId = await smartsheet.appendRow(sheetId, cells);
    res.json({ ok: true, rowId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/forecast/:rowId', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  if (!project.forecastSheetId) return res.status(404).json({ error: 'No forecast entries yet for this project.' });
  try {
    const cells = weeklyForecast.toCells(req.body || {});
    await smartsheet.updateRow(project.forecastSheetId, req.params.rowId, cells);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── TEAM UPDATES / BLOCKERS (manager/team only — never on a share link) ──
router.get('/:projectName/updates', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'updatesSheetId', teamUpdates.SHEET_NAME, teamUpdates.columnDefs());
    const rows = await smartsheet.listRows(sheetId);
    const items = rows.map(teamUpdates.fromRow).sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
    res.json({ updates: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/updates', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'updatesSheetId', teamUpdates.SHEET_NAME, teamUpdates.columnDefs());
    const cells = teamUpdates.toCells({
      author: whoAmI(req),
      type: req.body.type,
      section: req.body.section,
      comment: req.body.comment,
    });
    const rowId = await smartsheet.appendRow(sheetId, cells);
    if (cells.Type === 'Blocker') {
      // Fire-and-forget — notify() swallows its own errors, so a webhook
      // outage can never turn a successful post into a failed response.
      notify(`🚧 New blocker flagged on *${projectName}* (${cells.Section || 'General'}) by ${cells.Author}: ${cells.Comment || '(no comment)'}`);
    }
    res.json({ ok: true, rowId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/updates/:rowId/resolve', async (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  if (!project.updatesSheetId) return res.status(404).json({ error: 'No updates yet for this project.' });
  try {
    await smartsheet.updateRow(project.updatesSheetId, req.params.rowId, teamUpdates.resolveCells(whoAmI(req)));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── BUILD CHECKLIST (fully manual — no auto-generated steps) ─────────────
// The manager/team adds every item themselves: a title + description, a
// status, and a comment. Nothing here is derived from intake data.
router.get('/:projectName/checklist', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'checklistSheetId', checklist.SHEET_NAME, checklist.columnDefs());
    const rows = await smartsheet.listRows(sheetId);
    const steps = rows.map(checklist.fromRow).sort((a, b) => a.order - b.order);
    res.json({ steps });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/checklist', async (req, res) => {
  const projectName = req.params.projectName;
  const project = getProjectOr404(req, res);
  if (!project) return;
  const { title, description } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'A step title is required.' });
  try {
    const { sheetId } = await ensureLazySheet(project, projectName, 'checklistSheetId', checklist.SHEET_NAME, checklist.columnDefs());
    const rowId = await smartsheet.appendRow(sheetId, checklist.toCellsForNewItem({ title: title.trim(), description, addedBy: whoAmI(req) }));
    res.json({ ok: true, rowId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Reorder — the drag-and-drop UI sends the full list of row ids in their new
// order; each row's Order column is rewritten to match its new position.
router.post('/:projectName/checklist/reorder', async (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  if (!project.checklistSheetId) return res.status(404).json({ error: 'No checklist items yet for this project.' });
  const orderedRowIds = Array.isArray(req.body.rowIds) ? req.body.rowIds : [];
  try {
    await Promise.all(orderedRowIds.map((rowId, i) => smartsheet.updateRow(project.checklistSheetId, rowId, { Order: i })));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:projectName/checklist/:rowId', async (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  if (!project.checklistSheetId) return res.status(404).json({ error: 'No checklist items yet for this project.' });
  try {
    const { status, comment, title, description } = req.body || {};
    const cells = {};
    if (status !== undefined) cells.Status = status;
    if (comment !== undefined) cells.Comment = comment;
    if (title !== undefined) cells['Step Title'] = title;
    if (description !== undefined) cells.Description = description;
    await smartsheet.updateRow(project.checklistSheetId, req.params.rowId, cells);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:projectName/checklist/:rowId', async (req, res) => {
  const project = getProjectOr404(req, res);
  if (!project) return;
  if (!project.checklistSheetId) return res.status(404).json({ error: 'No checklist items yet for this project.' });
  try {
    await smartsheet.deleteRow(project.checklistSheetId, req.params.rowId);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── TEAM ROSTER + ASSIGNMENT — who's on the team, and who's assigned to
// this project. Reading the roster is fine for anyone signed in (it's just
// usernames/display names/roles, never passwords); only a manager can
// change who's assigned.
router.get('/team-roster', (req, res) => {
  res.json({ users: users.map((u) => ({ username: u.username, displayName: u.displayName || u.username, role: u.role === 'manager' ? 'manager' : 'team' })) });
});

router.post('/:projectName/assign', (req, res) => {
  if (req.session.role !== 'manager') return res.status(403).json({ error: 'Only a manager can change who is assigned to a project.' });
  const project = getProjectOr404(req, res);
  if (!project) return;
  const assignedUsers = Array.isArray(req.body.assignedUsers) ? req.body.assignedUsers.filter((u) => typeof u === 'string') : [];
  const record = projectStore.saveProject(req.params.projectName, { assignedUsers });
  res.json({ ok: true, assignedUsers: record.assignedUsers });
});

module.exports = router;
