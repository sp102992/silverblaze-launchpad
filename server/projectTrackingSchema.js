// ─────────────────────────────────────────────────────────────────────────
// PROJECT TRACKING — SOW / timeline summary, one row per client, same
// upsert-by-client-name pattern as the intake sections in sectionSchemas.js.
//
// Deliberately kept OUT of sectionSchemas.js / SECTION_KEYS: this is project
// management info, not utility-portal deployment configuration, so it must
// never show up in the generated .properties file (server/configBuilder.js
// only ever walks the original 7 intake sections).
//
// SOW is a reference link, not an uploaded file — same "point to where it
// lives, don't upload it" pattern already used for Branding's logo/favicon.
// ─────────────────────────────────────────────────────────────────────────

const SHEET_NAME = 'Project Tracking';

const PROJECT_PHASES = ['Discovery', 'Build', 'UAT', 'Launch', 'Support'];
const PROJECT_STATUSES = ['On Track', 'At Risk', 'Delayed'];
const CUSTOMER_TYPES = ['Business Unit', 'Direct Customer'];
const INSTALL_TYPES = ['Brand New', 'Upgrade'];
const PORTAL_HISTORY_OPTIONS = ['SB Portal', 'Legacy Portal', 'No Portal'];
const INTEGRATION_TYPES = ['Flat File', 'Custom API'];
const YES_NO = ['Yes', 'No'];

const FIELDS = [
  { id: 'pt_plan_url', title: 'Project Plan URL' },
  { id: 'pt_sow_link', title: 'SOW Document Link' },
  { id: 'pt_contract_date', title: 'Contract Signed Date' },
  { id: 'pt_kickoff_date', title: 'Kickoff Date' },
  { id: 'pt_golive_date', title: 'Target Go-Live Date' },
  { id: 'pt_phase', title: 'Current Phase' }, // Discovery / Build / UAT / Launch / Support
  { id: 'pt_status', title: 'Overall Status' }, // On Track / At Risk / Delayed
  { id: 'pt_pm_name', title: 'Assigned PM' },
  { id: 'pt_total_hours', title: 'Total Forecasted Hours' },

  // ── Customer profile ──────────────────────────────────────
  { id: 'pt_customer_type', title: 'Business Unit vs Direct Customer' }, // Business Unit / Direct Customer
  { id: 'pt_install_type', title: 'Installation Type' }, // Brand New / Upgrade
  { id: 'pt_portal_history', title: 'Portal History' }, // SB Portal / Legacy Portal / No Portal
  { id: 'pt_bill_presentment', title: 'Bill Presentment' }, // who provides the eBill

  // ── Business Unit customers only ──
  { id: 'pt_user_migration', title: 'User Migration Required' }, // Yes / No

  // ── Direct Customers only ──
  { id: 'pt_integration_type', title: 'Integration Type' }, // Flat File / Custom API
  { id: 'pt_data_migration', title: 'Data Migration Required' }, // Yes / No

  { id: 'pt_notes', title: 'Notes' },
];

const COMMON_COLUMNS = [
  { title: 'Client Name', type: 'TEXT_NUMBER', primary: true },
  { title: 'Status', type: 'TEXT_NUMBER' },
  { title: 'Submitted By', type: 'TEXT_NUMBER' },
  { title: 'Submitted At', type: 'TEXT_NUMBER' },
];

function columnDefs() {
  return COMMON_COLUMNS.map((c) => ({ title: c.title, type: c.type, primary: !!c.primary }))
    .concat(FIELDS.map((f) => ({ title: f.title, type: 'TEXT_NUMBER' })));
}

function toCells(formData) {
  const cells = {};
  FIELDS.forEach((f) => {
    const raw = formData[f.id];
    cells[f.title] = raw === undefined || raw === null ? '' : String(raw);
  });
  return cells;
}

function fromCells(cellMap) {
  const data = {};
  FIELDS.forEach((f) => { data[f.id] = cellMap[f.title] || ''; });
  return data;
}

module.exports = {
  SHEET_NAME,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  CUSTOMER_TYPES,
  INSTALL_TYPES,
  PORTAL_HISTORY_OPTIONS,
  INTEGRATION_TYPES,
  YES_NO,
  FIELDS,
  columnDefs,
  toCells,
  fromCells,
};
