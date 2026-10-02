// ─────────────────────────────────────────────────────────────────────────
// PORTFOLIO HEALTH DIGEST — a once-a-day summary of every project's
// completion %, open blockers, and Green/Yellow/Red health, pushed via
// server/notifications instead of requiring someone to open the Portfolio
// (All Projects) view.
//
// Reuses the exact same computation the Portfolio dashboard already uses
// (server/projectHealth.js + routes/projects.js's loadAllSectionData) —
// this file only adds "run that once a day and push the result." Nothing
// new is computed here, and nothing new is stored.
//
// No new dependency for scheduling: a plain once-a-minute check is enough
// for "once a day at roughly this hour," consistent with the rest of this
// app's deliberately dependency-light approach (no OAuth libs, no database
// driver, etc.). If you need exact cron-style scheduling later, swap
// startDigestScheduler()'s setInterval for node-cron without touching
// buildDigestText() at all.
// ─────────────────────────────────────────────────────────────────────────
const config = require('./config');
const projectStore = require('./projectStore');
const smartsheet = require('./smartsheetClient');
const projectTracking = require('./projectTrackingSchema');
const weeklyForecast = require('./weeklyForecastSchema');
const teamUpdates = require('./teamUpdatesSchema');
const health = require('./projectHealth');
const { notify } = require('./notifications');
const { loadAllSectionData } = require('./routes/projects');

const RAG_ICON = { green: '🟢', yellow: '🟡', red: '🔴' };

async function buildDigestText() {
  const projects = projectStore.listProjects();
  if (!projects.length) return '📊 Portfolio digest: no projects yet.';

  const dateLabel = new Date().toISOString().slice(0, 10);
  const lines = [`📊 Portfolio health digest — ${dateLabel} (${projects.length} project${projects.length === 1 ? '' : 's'})`];

  for (const project of projects) {
    const projectName = project.projectName;
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

      const blockerNote = unresolvedBlockers ? `, ${unresolvedBlockers} open blocker${unresolvedBlockers > 1 ? 's' : ''}` : '';
      lines.push(`${RAG_ICON[rag] || '⚪'} ${projectName} — ${pct}% complete${blockerNote} — ${reasons[0]}`);
    } catch (e) {
      // One project's problem (e.g. a renamed/deleted Smartsheet sheet)
      // should never stop the rest of the digest from being sent.
      lines.push(`⚪ ${projectName} — could not load this project's data (${e.message})`);
    }
  }
  return lines.join('\n');
}

// Guards against sending the digest more than once on the same calendar day
// even though the check below runs every minute.
let lastRunDateKey = null;

function startDigestScheduler() {
  if (!config.notifications.digestEnabled) return;
  setInterval(async () => {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    if (now.getHours() === config.notifications.digestHour && dateKey !== lastRunDateKey) {
      lastRunDateKey = dateKey;
      try {
        const text = await buildDigestText();
        await notify(text);
      } catch (e) {
        console.error('[digest] failed to build/send:', e.message);
      }
    }
  }, 60 * 1000);
}

module.exports = { buildDigestText, startDigestScheduler };
