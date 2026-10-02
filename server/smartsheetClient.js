// ─────────────────────────────────────────────────────────────────────────
// SMARTSHEET CLIENT — bare-bones version
//
// One shared personal API token (config.smartsheet.apiToken) is used for
// every call. No OAuth, no per-user tokens, no login flow with Smartsheet
// itself — you generate the token once (Smartsheet → Personal Settings →
// API Access) and paste it into .env.
//
// When config.mock is true, every function below returns realistic fake
// data from an in-memory store instead of calling api.smartsheet.com — lets
// you click through the whole app before you have a real token.
// ─────────────────────────────────────────────────────────────────────────

const fetch = require('node-fetch');
const config = require('./config');
const { columnDefsFor } = require('./sectionSchemas');

async function api(method, path, body) {
  if (!config.smartsheet.apiToken) {
    throw new Error('SMARTSHEET_API_TOKEN is not set in .env, and SMARTSHEET_MOCK is not true.');
  }
  const r = await fetch(config.smartsheet.apiBase + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + config.smartsheet.apiToken,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  if (!r.ok) {
    const err = new Error('Smartsheet API error ' + r.status + ': ' + text);
    err.status = r.status;
    throw err;
  }
  return json;
}

// ── in-memory mock backing store (only used when config.mock) ────────
const mockDb = { workspaces: {}, sheets: {}, nextId: 1 };
function mockId() { return 'mock-' + (mockDb.nextId++); }

// ── Workspaces ("one file per project") ───────────────────────────────
async function findWorkspaceByName(name) {
  if (config.mock) {
    return Object.values(mockDb.workspaces).find((w) => w.name === name) || null;
  }
  const list = await api('GET', '/workspaces?includeAll=true');
  return (list.data || []).find((w) => w.name === name) || null;
}

async function createWorkspace(name) {
  if (config.mock) {
    const ws = { id: mockId(), name };
    mockDb.workspaces[ws.id] = ws;
    return ws;
  }
  return api('POST', '/workspaces', { name });
}

async function ensureWorkspace(name) {
  const existing = await findWorkspaceByName(name);
  if (existing) return existing;
  return createWorkspace(name);
}

// ── Sheets ("one sheet per intake section, inside the project workspace") ──
async function findSheetInWorkspace(workspaceId, sheetName) {
  if (config.mock) {
    return Object.values(mockDb.sheets).find((s) => s.workspaceId === workspaceId && s.name === sheetName) || null;
  }
  const ws = await api('GET', `/workspaces/${workspaceId}?loadAll=true`);
  return (ws.sheets || []).find((s) => s.name === sheetName) || null;
}

async function createSheetInWorkspace(workspaceId, sheetName, columns) {
  if (config.mock) {
    const sheet = {
      id: mockId(),
      workspaceId,
      name: sheetName,
      columns: columns.map((c, i) => ({ id: 'col-' + i, title: c.title, type: c.type || 'TEXT_NUMBER', primary: !!c.primary })),
      rows: [],
    };
    mockDb.sheets[sheet.id] = sheet;
    return sheet;
  }
  return api('POST', `/workspaces/${workspaceId}/sheets`, {
    name: sheetName,
    columns: columns.map((c) => ({ title: c.title, type: c.type || 'TEXT_NUMBER', primary: !!c.primary })),
  });
}

async function ensureSheetInWorkspace(workspaceId, sheetName, columns) {
  const existing = await findSheetInWorkspace(workspaceId, sheetName);
  if (existing) return existing;
  return createSheetInWorkspace(workspaceId, sheetName, columns);
}

// Convenience: make sure a project has a workspace + all 7 section sheets.
// Returns { workspaceId, sheets: { sectionKey: sheetId } }
async function ensureProjectStructure(projectName, sectionKeysWithColumns) {
  const ws = await ensureWorkspace(projectName);
  const sheets = {};
  for (const { key, label } of sectionKeysWithColumns) {
    const sheet = await ensureSheetInWorkspace(ws.id, label, columnDefsFor(key));
    sheets[key] = sheet.id;
  }
  return { workspaceId: ws.id, sheets };
}

// ── Rows ────────────────────────────────────────────────────────────
async function getSheetWithColumns(sheetId) {
  if (config.mock) {
    const sheet = mockDb.sheets[sheetId];
    if (!sheet) throw new Error('mock sheet not found: ' + sheetId);
    return sheet;
  }
  return api('GET', `/sheets/${sheetId}`);
}

function colMapOf(sheet) {
  const map = {};
  (sheet.columns || []).forEach((c) => { map[c.title] = c.id; });
  return map;
}

function cellsToTitleMap(row, sheet) {
  const byId = {};
  (sheet.columns || []).forEach((c) => { byId[c.id] = c.title; });
  const out = {};
  (row.cells || []).forEach((cell) => {
    const title = byId[cell.columnId];
    if (title) out[title] = cell.value;
  });
  return out;
}

async function findRowByClient(sheetId, clientName) {
  const sheet = await getSheetWithColumns(sheetId);
  const colMap = colMapOf(sheet);
  const clientColId = colMap['Client Name'];
  const row = (sheet.rows || []).find((r) => {
    const cell = (r.cells || []).find((c) => c.columnId === clientColId);
    return cell && String(cell.value).toLowerCase() === clientName.toLowerCase();
  });
  return { sheet, row: row || null, colMap };
}

async function upsertRow(sheetId, clientName, titleCells) {
  const { sheet, row } = await findRowByClient(sheetId, clientName);
  const colMap = colMapOf(sheet);
  const allCells = { 'Client Name': clientName, ...titleCells };
  const cells = Object.entries(allCells)
    .filter(([title]) => colMap[title])
    .map(([title, value]) => ({ columnId: colMap[title], value: value === undefined || value === null ? '' : value }));

  if (config.mock) {
    const mockSheet = mockDb.sheets[sheetId];
    if (row) {
      // Merge by columnId rather than replacing row.cells wholesale — a
      // caller passing a partial cells object (e.g. just one field) must
      // not wipe out every other previously-saved cell on this row. This
      // mirrors what a real Smartsheet PUT actually does (only the cells
      // you send are touched; everything else on the row is left alone).
      const byColId = {};
      (row.cells || []).forEach((c) => { byColId[c.columnId] = c; });
      cells.forEach((c) => { byColId[c.columnId] = c; });
      row.cells = Object.values(byColId);
    } else {
      mockSheet.rows.push({ id: mockId(), cells });
    }
    return { ok: true };
  }

  if (row) {
    return api('PUT', `/sheets/${sheetId}/rows`, [{ id: row.id, cells }]);
  }
  return api('POST', `/sheets/${sheetId}/rows`, [{ toBottom: true, cells }]);
}

async function getRowDataByClient(sheetId, clientName) {
  const { sheet, row, colMap } = await findRowByClient(sheetId, clientName);
  if (!row) return null;
  return cellsToTitleMap(row, sheet);
}

// ── MULTI-ROW SHEETS (Weekly Forecast, Team Updates, Build Checklist) ──────
// Unlike the intake sections above (one row per client, upsert), these
// sheets accumulate many rows per project — a new row per week entered, per
// comment posted, per checklist step. appendRow always adds a new row;
// updateRow edits one existing row in place (e.g. marking a blocker
// resolved, or ticking off a checklist step) without touching the rest.

function cellsFor(colMap, titleValues) {
  return Object.entries(titleValues)
    .filter(([title]) => colMap[title])
    .map(([title, value]) => ({ columnId: colMap[title], value: value === undefined || value === null ? '' : value }));
}

async function appendRow(sheetId, titleValues) {
  const sheet = await getSheetWithColumns(sheetId);
  const colMap = colMapOf(sheet);
  const cells = cellsFor(colMap, titleValues);

  if (config.mock) {
    const mockSheet = mockDb.sheets[sheetId];
    const row = { id: mockId(), cells };
    mockSheet.rows.push(row);
    return row.id;
  }
  const res = await api('POST', `/sheets/${sheetId}/rows`, [{ toBottom: true, cells }]);
  const created = Array.isArray(res.result) ? res.result[0] : res.result;
  return created.id;
}

async function listRows(sheetId) {
  const sheet = await getSheetWithColumns(sheetId);
  return (sheet.rows || []).map((row) => ({ rowId: row.id, ...cellsToTitleMap(row, sheet) }));
}

async function updateRow(sheetId, rowId, titleValues) {
  const sheet = await getSheetWithColumns(sheetId);
  const colMap = colMapOf(sheet);
  const cells = cellsFor(colMap, titleValues);

  if (config.mock) {
    const mockSheet = mockDb.sheets[sheetId];
    const row = (mockSheet.rows || []).find((r) => String(r.id) === String(rowId));
    if (!row) throw new Error('Row not found: ' + rowId);
    const byColId = {};
    (row.cells || []).forEach((c) => { byColId[c.columnId] = c; });
    cells.forEach((c) => { byColId[c.columnId] = c; });
    row.cells = Object.values(byColId);
    return { ok: true };
  }
  return api('PUT', `/sheets/${sheetId}/rows`, [{ id: Number(rowId), cells }]);
}

// Add a column to an EXISTING sheet if it doesn't already have one with this
// exact title — idempotent, so calling this repeatedly (e.g. every time a
// section loads) never creates a duplicate column. This is what lets a
// manager-defined custom field (server/customFields.js) get a real column on
// every project's sheet for that section, including projects created before
// the field existed.
async function addColumnIfMissing(sheetId, columnTitle, type) {
  const sheet = await getSheetWithColumns(sheetId);
  const colMap = colMapOf(sheet);
  if (colMap[columnTitle]) return colMap[columnTitle];

  if (config.mock) {
    const mockSheet = mockDb.sheets[sheetId];
    const colId = 'col-custom-' + mockSheet.columns.length + '-' + mockId();
    mockSheet.columns.push({ id: colId, title: columnTitle, type: type || 'TEXT_NUMBER' });
    return colId;
  }
  const res = await api('POST', `/sheets/${sheetId}/columns`, { title: columnTitle, type: type || 'TEXT_NUMBER' });
  const created = Array.isArray(res.result) ? res.result[0] : res.result;
  return created.id;
}

// Backfills a hardcoded section's real columns onto an EXISTING sheet that
// was created before this app's schema — most importantly, secret fields
// (SMTP password, CIS/Payment/Ansible credentials) that used to be stored
// only as a "<Title> Provided" checkbox. ensureSheetInWorkspace() only sets
// column definitions the FIRST time a sheet is created; a project made
// before a schema change (like secret fields switching to storing their
// real value) is otherwise stuck on its original columns forever, so any
// new-shaped write silently has nowhere to land. This mirrors the same
// idempotent addColumnIfMissing() pattern customFields.js already uses for
// manager-defined fields — safe to call on every read/write.
async function ensureSectionColumns(sheetId, sectionKey) {
  const defs = columnDefsFor(sectionKey);
  for (const col of defs) {
    await addColumnIfMissing(sheetId, col.title, col.type);
  }
}

// Delete one row outright (used by Build Checklist's delete button — unlike
// updateRow, this actually removes the row rather than blanking its cells).
async function deleteRow(sheetId, rowId) {
  if (config.mock) {
    const mockSheet = mockDb.sheets[sheetId];
    if (!mockSheet) throw new Error('mock sheet not found: ' + sheetId);
    mockSheet.rows = (mockSheet.rows || []).filter((r) => String(r.id) !== String(rowId));
    return { ok: true };
  }
  return api('DELETE', `/sheets/${sheetId}/rows?ids=${encodeURIComponent(rowId)}`);
}

module.exports = {
  ensureWorkspace,
  ensureSheetInWorkspace,
  ensureProjectStructure,
  upsertRow,
  getRowDataByClient,
  findWorkspaceByName,
  appendRow,
  listRows,
  updateRow,
  deleteRow,
  addColumnIfMissing,
  ensureSectionColumns,
};
