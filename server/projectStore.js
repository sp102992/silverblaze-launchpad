// Registry mapping project (client) name -> its Smartsheet Workspace ID and
// per-section Sheet IDs. Just a small JSON file on disk — no database.
// Fine for a short-lived internal tool run by one person/team; if you ever
// need this running long-term with many concurrent users, revisit this.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'projects.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, '{}');
}

function readAll() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeAll(all) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(all, null, 2));
}

function keyFor(projectName) {
  return projectName.trim().toLowerCase();
}

function getProject(projectName) {
  const all = readAll();
  return all[keyFor(projectName)] || null;
}

function saveProject(projectName, record) {
  const all = readAll();
  const key = keyFor(projectName);
  all[key] = { ...(all[key] || {}), ...record, projectName, updatedAt: Date.now() };
  writeAll(all);
  return all[key];
}

function listProjects() {
  const all = readAll();
  return Object.values(all);
}

module.exports = { getProject, saveProject, listProjects };
