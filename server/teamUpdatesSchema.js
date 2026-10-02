// ─────────────────────────────────────────────────────────────────────────
// TEAM UPDATES / BLOCKERS — multi-row append-only feed, manager/team only.
// Deliberately NOT exposed on the customer share-link routes — only the
// logged-in dashboard (server/users.js) can post or resolve these, so this
// stays an internal channel, never visible or writable by vendors.
// ─────────────────────────────────────────────────────────────────────────

const SHEET_NAME = 'Team Updates';

const UPDATE_TYPES = ['Update', 'Blocker', 'Info'];

const COLUMNS = [
  { title: 'Posted At', type: 'TEXT_NUMBER', primary: true },
  { title: 'Author', type: 'TEXT_NUMBER' },
  { title: 'Type', type: 'TEXT_NUMBER' }, // Update / Blocker / Info
  { title: 'Section', type: 'TEXT_NUMBER' }, // optional tag, e.g. "Payment Vendor" or "General"
  { title: 'Comment', type: 'TEXT_NUMBER' },
  { title: 'Resolved', type: 'CHECKBOX' },
  { title: 'Resolved By', type: 'TEXT_NUMBER' },
  { title: 'Resolved At', type: 'TEXT_NUMBER' },
];

function columnDefs() {
  return COLUMNS.map((c) => ({ title: c.title, type: c.type, primary: !!c.primary }));
}

function toCells({ author, type, section, comment }) {
  return {
    'Posted At': new Date().toISOString(),
    Author: author || 'Team',
    Type: type || 'Update',
    Section: section || 'General',
    Comment: comment || '',
    Resolved: false,
    'Resolved By': '',
    'Resolved At': '',
  };
}

function resolveCells(resolvedBy) {
  return {
    Resolved: true,
    'Resolved By': resolvedBy || 'Team',
    'Resolved At': new Date().toISOString(),
  };
}

function fromRow(row) {
  return {
    rowId: row.rowId,
    postedAt: row['Posted At'] || '',
    author: row['Author'] || '',
    type: row['Type'] || 'Update',
    section: row['Section'] || 'General',
    comment: row['Comment'] || '',
    resolved: !!row['Resolved'],
    resolvedBy: row['Resolved By'] || '',
    resolvedAt: row['Resolved At'] || '',
  };
}

module.exports = { SHEET_NAME, UPDATE_TYPES, columnDefs, toCells, resolveCells, fromRow };
