// ─────────────────────────────────────────────────────────────────────────
// BUILD CHECKLIST — fully manual. There is no predefined list of steps and
// nothing here is auto-generated from intake data; the manager/team adds
// every item themselves. Each item has three things: a title + description
// (what needs doing), a status, and a free-text comment — plus an Order
// column so drag-and-drop reordering in the UI can be saved back to
// Smartsheet (rows themselves aren't reorderable through this app's simple
// append/update model, so ordering is tracked as an explicit sortable field).
// ─────────────────────────────────────────────────────────────────────────

const SHEET_NAME = 'Build Checklist';

const CHECKLIST_STATUSES = ['Not Started', 'In Progress', 'Done', 'Blocked'];

const COLUMNS = [
  { title: 'Step Title', type: 'TEXT_NUMBER', primary: true },
  { title: 'Description', type: 'TEXT_NUMBER' },
  { title: 'Status', type: 'TEXT_NUMBER' },
  { title: 'Comment', type: 'TEXT_NUMBER' },
  { title: 'Order', type: 'TEXT_NUMBER' },
  { title: 'Added By', type: 'TEXT_NUMBER' },
  { title: 'Added At', type: 'TEXT_NUMBER' },
];

function columnDefs() {
  return COLUMNS.map((c) => ({ title: c.title, type: c.type, primary: !!c.primary }));
}

function toCellsForNewItem({ title, description, addedBy, order }) {
  return {
    'Step Title': title || '',
    Description: description || '',
    Status: 'Not Started',
    Comment: '',
    Order: order === undefined ? Date.now() : order,
    'Added By': addedBy || '',
    'Added At': new Date().toISOString(),
  };
}

function fromRow(row) {
  return {
    rowId: row.rowId,
    title: row['Step Title'] || '',
    description: row['Description'] || '',
    status: row['Status'] || 'Not Started',
    comment: row['Comment'] || '',
    order: row['Order'] !== undefined && row['Order'] !== '' ? Number(row['Order']) : 0,
    addedBy: row['Added By'] || '',
    addedAt: row['Added At'] || '',
  };
}

module.exports = { SHEET_NAME, CHECKLIST_STATUSES, columnDefs, toCellsForNewItem, fromRow };
