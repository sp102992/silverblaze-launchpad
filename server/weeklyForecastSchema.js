// ─────────────────────────────────────────────────────────────────────────
// WEEKLY FORECAST — multi-row sheet, one row per week, entered manually by
// the PM. Unlike the intake sections, this is append + edit, not upsert:
// a new row per week, and the same row can later be edited to fill in
// Actual Hours once the week is over.
// ─────────────────────────────────────────────────────────────────────────

const SHEET_NAME = 'Weekly Forecast';

const COLUMNS = [
  { title: 'Week Start', type: 'TEXT_NUMBER', primary: true },
  { title: 'Week End', type: 'TEXT_NUMBER' },
  { title: 'Phase / Milestone', type: 'TEXT_NUMBER' },
  { title: 'Forecasted Hours', type: 'TEXT_NUMBER' },
  { title: 'Actual Hours', type: 'TEXT_NUMBER' },
  { title: 'Notes', type: 'TEXT_NUMBER' },
  { title: 'Entered By', type: 'TEXT_NUMBER' },
  { title: 'Entered At', type: 'TEXT_NUMBER' },
];

function columnDefs() {
  return COLUMNS.map((c) => ({ title: c.title, type: c.type, primary: !!c.primary }));
}

// Frontend field ids -> Smartsheet column titles.
const FIELD_TO_TITLE = {
  weekStart: 'Week Start',
  weekEnd: 'Week End',
  phase: 'Phase / Milestone',
  forecastedHours: 'Forecasted Hours',
  actualHours: 'Actual Hours',
  notes: 'Notes',
};

function toCells(formData) {
  const cells = {};
  Object.entries(FIELD_TO_TITLE).forEach(([id, title]) => {
    if (formData[id] !== undefined) cells[title] = formData[id] === null ? '' : String(formData[id]);
  });
  return cells;
}

function fromRow(row) {
  return {
    rowId: row.rowId,
    weekStart: row['Week Start'] || '',
    weekEnd: row['Week End'] || '',
    phase: row['Phase / Milestone'] || '',
    forecastedHours: row['Forecasted Hours'] || '',
    actualHours: row['Actual Hours'] || '',
    notes: row['Notes'] || '',
    enteredBy: row['Entered By'] || '',
    enteredAt: row['Entered At'] || '',
  };
}

module.exports = { SHEET_NAME, columnDefs, toCells, fromRow };
