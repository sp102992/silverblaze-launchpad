// ─────────────────────────────────────────────────────────────────────────
// SECTION SCHEMAS
//
// Each section of the intake form becomes its OWN Smartsheet sheet
// (inside the client's project Workspace). The columns on that sheet are
// named after the actual piece of information the field carries — never
// generic labels like "data" or "value1" — so the sheet is readable on its
// own in Smartsheet without this app.
//
// `id`   — matches the frontend form field's element id.
// `title`— the real Smartsheet column name that gets created.
// `type` — checkbox fields become Smartsheet CHECKBOX columns; everything
//          else is TEXT_NUMBER.
// `secret` (optional) — marks a password/API-key-style field. The value IS
//          stored in Smartsheet like any other field (by request — managers
//          need to see submitted credentials once logged in), but the
//          frontend still renders it as a masked <input type="password">
//          with a click-to-reveal toggle, so it isn't shown in plaintext by
//          default on screen even though it's saved in full.
// `showIf` (optional) — { field, equals } — this field is only relevant/
//          shown when another field in the same section equals a given
//          value (e.g. Payment Vendor's vendor-specific fields). Purely a
//          rendering hint for the frontend — the Smartsheet column always
//          exists, it's just left blank when not applicable.
// ─────────────────────────────────────────────────────────────────────────

const customFields = require('./customFields');

// NOTE: "branding" used to be its own section/sheet. It's now folded
// directly into "business_info" (see SECTIONS.business_info.fields below) —
// one unified "Business Information & Branding" intake section/sheet, one
// nav item, one share link. There is no migration step for this: a
// brand-new project simply never gets a separate Branding sheet, and the
// combined sheet is titled the same as Business Info always was.
const SECTION_KEYS = [
  'business_info',
  'cis_integration',
  'payment_vendor',
  'smtp_config',
  'ansible_inventory',
  'smart_meter',
  'pm_info',
];

const SECTION_LABELS = {
  business_info: 'Business Information & Branding',
  cis_integration: 'CIS Integration',
  payment_vendor: 'Payment Vendor',
  smtp_config: 'SMTP Config',
  ansible_inventory: 'Ansible Inventory',
  smart_meter: 'Smart Meter',
  // Matches the sidebar nav's own label for this section exactly (see
  // public/index.html's nav-13) — this same string also drives the Share
  // Links tile label and the customer share-link page's section badge, so
  // all three now read consistently instead of the nav saying one thing
  // and everywhere else saying "Project Information for PM".
  pm_info: 'Project info (PM)',
};

// Hosting types drive which sections/fields are required — centralized here
// rather than scattered magic strings throughout the app (server or
// frontend). See server/config.js's `features` for the show/hide flags;
// this is the analogous single source of truth for hosting-driven behavior.
const HOSTING_TYPES = {
  SILVERBLAZE_AZURE: 'SILVERBLAZE_AZURE',
  CLIENT_BU_HOSTED: 'CLIENT_BU_HOSTED',
};

// Every section sheet gets these columns automatically — do not repeat them
// in a section's own field list.
const COMMON_COLUMNS = [
  { title: 'Client Name', type: 'TEXT_NUMBER', primary: true },
  { title: 'Status', type: 'TEXT_NUMBER' },
  { title: 'Submitted By', type: 'TEXT_NUMBER' },
  { title: 'Submitted At', type: 'TEXT_NUMBER' },
];

const PAYMENT_VENDOR_TYPES = ['Invoice Cloud', 'Paymentus', 'Other'];

const SECTIONS = {
  business_info: {
    label: 'Business Information & Branding',
    owner: 'Client / marketing team',
    fields: [
      { id: 'biz_name', title: 'Business Name', required: true },
      { id: 'biz_phone', title: 'Phone Number', required: true },
      { id: 'biz_address', title: 'Business Address', required: true },
      { id: 'biz_fax', title: 'Fax Number' },
      { id: 'biz_url', title: 'Website URL' },
      { id: 'biz_cs', title: 'Customer Service Email', required: true },
      { id: 'biz_sup', title: 'Support Email', required: true },
      { id: 'biz_gen', title: 'General Inquiry Email' },
      { id: 'biz_poc_name', title: 'Point of Contact Name' },
      { id: 'biz_poc_email', title: 'Point of Contact Email' },
      { id: 'nav1l', title: 'Nav Link 1 Label' }, { id: 'nav1u', title: 'Nav Link 1 URL' },
      { id: 'nav2l', title: 'Nav Link 2 Label' }, { id: 'nav2u', title: 'Nav Link 2 URL' },
      { id: 'nav3l', title: 'Nav Link 3 Label' }, { id: 'nav3u', title: 'Nav Link 3 URL' },
      { id: 'nav4l', title: 'Nav Link 4 Label' }, { id: 'nav4u', title: 'Nav Link 4 URL' },
      { id: 'nav5l', title: 'Nav Link 5 Label' }, { id: 'nav5u', title: 'Nav Link 5 URL' },
      { id: 'hrs_mon', title: 'Monday Hours' },
      { id: 'hrs_tue', title: 'Tuesday Hours' },
      { id: 'hrs_wed', title: 'Wednesday Hours' },
      { id: 'hrs_thu', title: 'Thursday Hours' },
      { id: 'hrs_fri', title: 'Friday Hours' },
      { id: 'hrs_sat', title: 'Saturday Hours' },
      { id: 'hrs_sun', title: 'Sunday Hours' },
      // ── Branding (formerly its own section/sheet — merged in here) ──
      { id: 'brand_hex1', title: 'Primary Color Hex', required: true },
      { id: 'brand_hex2', title: 'Secondary Color Hex' },
      { id: 'brand_other', title: 'Additional Color Hex Codes' },
    ],
    // Image assets are collected out-of-band by email, not through the form —
    // rendered as static instructional text by both the manager dashboard
    // and the customer-facing form, never as an input field.
    emailInstructions: [
      { label: 'Company Logo', detail: 'PNG or high-resolution JPG — please email this directly rather than pasting a link.' },
      { label: 'Favicon (Website Icon)', detail: '32×32 px, ICO format — please email this directly.' },
      { label: 'eBill / Invoice Sample', detail: 'PDF or image file that clearly displays the Account Number (shown to customers on the Sign-Up page as a reference) — please email this directly.' },
    ],
  },

  cis_integration: {
    label: 'CIS Integration',
    owner: 'CIS team',
    fields: [
      { id: 'cis_poc_name', title: 'Point of Contact Name' },
      { id: 'cis_poc_email', title: 'Point of Contact Email' },
      { id: 'cis_dev_url', title: 'Dev API Endpoint URL' },
      { id: 'cis_dev_user', title: 'Dev API Username' },
      { id: 'cis_dev_pass', title: 'Dev API Password', secret: true },
      { id: 'cis_uat_url', title: 'UAT API Endpoint URL' },
      { id: 'cis_uat_user', title: 'UAT API Username' },
      { id: 'cis_uat_pass', title: 'UAT API Password', secret: true },
      { id: 'cis_prod_url', title: 'Prod API Endpoint URL' },
      { id: 'cis_prod_user', title: 'Prod API Username' },
      { id: 'cis_prod_pass', title: 'Prod API Password', secret: true },
      { id: 'cis_elec', title: 'Electricity Service', type: 'CHECKBOX' },
      { id: 'cis_water', title: 'Water Service', type: 'CHECKBOX' },
      { id: 'cis_gas', title: 'Gas Service', type: 'CHECKBOX' },
      { id: 'cis_other_c', title: 'Other Service', type: 'CHECKBOX' },
      { id: 'cis_other_desc', title: 'Other Service Description' },
      { id: 'cis_t1t', title: 'Test Account 1 Type' }, { id: 'cis_t1a', title: 'Test Account 1 Number' }, { id: 'cis_t1n', title: 'Test Account 1 Notes' },
      { id: 'cis_t2t', title: 'Test Account 2 Type' }, { id: 'cis_t2a', title: 'Test Account 2 Number' }, { id: 'cis_t2n', title: 'Test Account 2 Notes' },
      { id: 'cis_t3t', title: 'Test Account 3 Type' }, { id: 'cis_t3a', title: 'Test Account 3 Number' }, { id: 'cis_t3n', title: 'Test Account 3 Notes' },
      // Other Service Type Account — the 4th test account slot, alongside
      // the existing Water/Gas/Electricity ones, for whichever "Other"
      // utility service type was described above.
      { id: 'cis_t4a', title: 'Other Service Type Account' },
      { id: 'cis_m_code', title: 'Metered Account Code' }, { id: 'cis_m_desc', title: 'Metered Account Description' },
      { id: 'cis_nm_code', title: 'Non-Metered Account Code' }, { id: 'cis_nm_desc', title: 'Non-Metered Account Description' },
      { id: 'cis_o_code', title: 'Other Account Code' }, { id: 'cis_o_desc', title: 'Other Account Description' },
      // ── Silverblaze-hosted only: vendor IP whitelisting (see hostingType) ──
      { id: 'cis_veip_sb_ips', title: 'Silverblaze IPs That Need to Be Whitelisted', hostingOnly: HOSTING_TYPES.SILVERBLAZE_AZURE },
      { id: 'cis_veip_vendor_ips', title: 'Vendor IPs Silverblaze Must Whitelist', hostingOnly: HOSTING_TYPES.SILVERBLAZE_AZURE },
    ],
  },

  payment_vendor: {
    label: 'Payment Vendor',
    owner: 'Payment vendor',
    // Options for the pay_vendor_type dropdown — shared with the frontend.
    vendorTypes: PAYMENT_VENDOR_TYPES,
    fields: [
      // ── Always shown: point of contact (default for every vendor type) ──
      { id: 'pay_contact', title: 'Contact Person' },
      { id: 'pay_email', title: 'Contact Email' },

      // ── Vendor selector ──
      { id: 'pay_vendor_type', title: 'Payment Vendor Type', required: true }, // Invoice Cloud / Paymentus / Other

      // ── Paymentus-specific ──
      { id: 'pay_tla', title: 'Paymentus TLA', required: true, showIf: { field: 'pay_vendor_type', equals: 'Paymentus' } },
      { id: 'pay_paymentus_comment', title: 'Paymentus Additional Comments', showIf: { field: 'pay_vendor_type', equals: 'Paymentus' } },

      // ── Invoice Cloud-specific ──
      { id: 'pay_ic_biller_guid', title: 'InvoiceCloud Biller GUID', required: true, showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_ic_webservice_key', title: 'InvoiceCloud Web Service Key', secret: true, required: true, showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_ic_integration_guid', title: 'InvoiceCloud Integration GUID', required: true, showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },

      // ── Other-specific: just a free-text catch-all ──
      { id: 'pay_other_comment', title: 'Other Payment Vendor Comments', showIf: { field: 'pay_vendor_type', equals: 'Other' } },

      // ── Always shown: one-time payment + general comment ──
      { id: 'pay_onetime_url', title: 'One-Time Payment URL' },

      // ── Test accounts: Invoice Cloud only, not needed for Paymentus/Other ──
      { id: 'pay_t1t', title: 'Test Account 1 Type', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t1a', title: 'Test Account 1 Number', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t1n', title: 'Test Account 1 Notes', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t2t', title: 'Test Account 2 Type', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t2a', title: 'Test Account 2 Number', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t2n', title: 'Test Account 2 Notes', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t3t', title: 'Test Account 3 Type', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t3a', title: 'Test Account 3 Number', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t3n', title: 'Test Account 3 Notes', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t4t', title: 'Test Account 4 Type', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t4a', title: 'Test Account 4 Number', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t4n', title: 'Test Account 4 Notes', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t5t', title: 'Test Account 5 Type', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t5a', title: 'Test Account 5 Number', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },
      { id: 'pay_t5n', title: 'Test Account 5 Notes', showIf: { field: 'pay_vendor_type', equals: 'Invoice Cloud' } },

      { id: 'pay_general_comment', title: 'Additional Comments' },

      // ── Silverblaze-hosted only: vendor IP whitelisting (see hostingType) ──
      { id: 'pay_veip_sb_ips', title: 'Silverblaze IPs That Need to Be Whitelisted', hostingOnly: HOSTING_TYPES.SILVERBLAZE_AZURE },
      { id: 'pay_veip_vendor_ips', title: 'Vendor IPs Silverblaze Must Whitelist', hostingOnly: HOSTING_TYPES.SILVERBLAZE_AZURE },
    ],
  },

  smtp_config: {
    label: 'SMTP Config',
    owner: 'Client IT team',
    fields: [
      // Point of Contact — same structure/behavior/placement (top of
      // section) as every other Intake section's Point of Contact.
      { id: 'smtp_poc_name', title: 'Point of Contact Name' },
      { id: 'smtp_poc_email', title: 'Point of Contact Email' },
      { id: 'smtp_host', title: 'SMTP Host', required: true },
      { id: 'smtp_port', title: 'SMTP Port', required: true },
      { id: 'smtp_sec', title: 'Connection Security', required: true },
      { id: 'smtp_auth', title: 'Requires Authentication' },
      { id: 'smtp_user', title: 'SMTP Username', required: true },
      { id: 'smtp_pass', title: 'SMTP Password', secret: true, required: true },
      { id: 'smtp_from', title: 'From Email Address', required: true },
      { id: 'smtp_from_name', title: 'From Display Name', required: true },
      // ── Silverblaze-hosted only: vendor IP whitelisting (see hostingType) ──
      { id: 'smtp_veip_sb_ips', title: 'Silverblaze IPs That Need to Be Whitelisted', hostingOnly: HOSTING_TYPES.SILVERBLAZE_AZURE },
    ],
  },

  ansible_inventory: {
    label: 'Ansible Inventory',
    owner: 'Client IT team',
    // Not applicable / not required when hostingType is Silverblaze Azure
    // Hosted — see server/config.js "hostingType" concept and index.html's
    // hosting-gate modal. Client/BU Hosted behavior is unchanged.
    hostingOnly: HOSTING_TYPES.CLIENT_BU_HOSTED,
    fields: [
      { id: 'ans_ip', title: 'Public IP Address', required: true },
      { id: 'ans_host', title: 'Host URL', required: true },
      { id: 'ans_sql', title: 'SQL Instance', required: true },
      { id: 'ans_pdb', title: 'Portal DB Name', required: true },
      { id: 'ans_puser', title: 'Portal DB Username', required: true },
      { id: 'ans_ppass', title: 'Portal DB Password', secret: true, required: true },
      { id: 'ans_fdb', title: 'SmartForms DB Name' },
      { id: 'ans_fuser', title: 'SmartForms DB Username' },
      { id: 'ans_fpass', title: 'SmartForms DB Password', secret: true },
      // Required: the value entered here IS the hosting team's written
      // confirmation of the drive preferences — no separate upload/document.
      { id: 'ans_install_drive', title: 'Preferred Installation Drive', required: true },
      { id: 'ans_temp_drive', title: 'Temporary Storage Drive', required: true },
      // Silverblaze's own IPs that the client/hosting/vendor team needs to
      // whitelist — distinct from ans_ip above (the client's server IP that
      // Silverblaze whitelists). Multiple IPs allowed, one per line/comma.
      { id: 'ans_sb_whitelist_ips', title: 'Silverblaze IPs To Be Whitelisted' },
      { id: 'ans_notes', title: 'Additional Comments' },
    ],
  },

  smart_meter: {
    label: 'Smart Meter',
    owner: 'Smart meter provider',
    optional: true,
    fields: [
      { id: 'sm_on', title: 'Smart Meter Enabled', type: 'CHECKBOX' },
      { id: 'sm_poc_name', title: 'Point of Contact Name' },
      { id: 'sm_poc_email', title: 'Point of Contact Email' },
      { id: 'sm_prov', title: 'Provider Name', required: true },
      { id: 'sm_contact', title: 'Contact Person' },
      { id: 'sm_cemail', title: 'Contact Email' },
      { id: 'sm_cphone', title: 'Contact Phone' },
      { id: 'sm_tech', title: 'Technical Support Contact' },
      { id: 'sm_temail', title: 'Technical Support Email' },
      { id: 'sm_platform', title: 'Platform Name' },
      { id: 'sm_api', title: 'API Available' },
      { id: 'sm_api_url', title: 'API Base URL' },
      { id: 'sm_auth_m', title: 'Auth Method' },
      { id: 'sm_wl', title: 'IP Whitelisting Required' },
      { id: 'sm_wl_ips', title: 'Whitelisted IPs' },
      { id: 'sm_data', title: 'Available Data Types' },
      { id: 'sm_freq', title: 'Data Frequency' },
      { id: 'sm_hist', title: 'Historical Data Available' },
      { id: 'sm_hist_dur', title: 'Historical Duration' },
      { id: 'sm_meters', title: 'Supported Meter Types' },
      { id: 'sm_link', title: 'Account Linking Identifier' },
      { id: 'sm_ftm', title: 'File Transfer Method' },
      { id: 'sm_ffmt', title: 'File Format' },
      { id: 'sm_fname', title: 'File Naming Convention' },
      { id: 'sm_ffreq', title: 'Delivery Frequency' },
      { id: 'sm_fsample', title: 'Sample File Provided' },
      { id: 'sm_furl', title: 'Sample File URL' },
      { id: 'sm_notes', title: 'Additional Notes' },
      // ── Silverblaze-hosted only: vendor IP whitelisting (see hostingType) ──
      { id: 'sm_veip_sb_ips', title: 'Silverblaze IPs That Need to Be Whitelisted', hostingOnly: HOSTING_TYPES.SILVERBLAZE_AZURE },
    ],
  },

  // Professional Services -> PM handoff info. Deliberately its OWN intake
  // section/sheet (not folded into Project Tracking) so it stays available
  // even while showProjectManagementSection is turned off — see
  // server/config.js `features`.
  pm_info: {
    label: 'Project info (PM)',
    owner: 'Professional Services team',
    installTypes: ['Brand New', 'Upgrade'],
    portalHistoryOptions: ['SB Portal', 'Legacy Portal', 'No Portal'],
    customerTypes: ['Business Unit', 'Direct Customer'],
    integrationTypes: ['Flat File', 'Custom API'],
    hostingTypeOptions: [HOSTING_TYPES.SILVERBLAZE_AZURE, HOSTING_TYPES.CLIENT_BU_HOSTED],
    fields: [
      // Where the environment is hosted — the same value that drives the
      // hosting-gate modal (see index.html/app.js chooseHosting()). Also
      // settable/editable here directly, so it's not a one-time-only choice.
      { id: 'env_hosting_type', title: 'Environment Hosting Type' },

      { id: 'pm_customer_type', title: 'Business Unit vs Direct Customer' },
      { id: 'pm_bu_name', title: 'Business Unit Name', showIf: { field: 'pm_customer_type', equals: 'Business Unit' } },
      { id: 'pm_sow_link', title: 'Signed SOW Link' },
      { id: 'pm_effort_hours', title: 'Estimated PS Effort Hours' },
      { id: 'pm_kickoff_date', title: 'Project Kickoff Date' },
      { id: 'pm_uat_estimate', title: 'Project UAT Estimate' },
      { id: 'pm_golive_estimate', title: 'Project Go-Live Estimate' },
      { id: 'pm_install_type', title: 'Installation Type' },
      { id: 'pm_portal_history', title: 'Portal History' },
      { id: 'pm_user_migration', title: 'User Migration Required', showIf: { field: 'pm_customer_type', equals: 'Business Unit' } },
      { id: 'pm_integration_type', title: 'Integration Type', showIf: { field: 'pm_customer_type', equals: 'Direct Customer' } },
      { id: 'pm_data_migration', title: 'Data Migration Required', showIf: { field: 'pm_customer_type', equals: 'Direct Customer' } },
      { id: 'pm_bill_presentment', title: 'Bill Presentment' },
      { id: 'pm_risk_log', title: 'Risk Log' },
    ],
  },
};

// Column definitions to send to Smartsheet's "create sheet" API for a
// section. Custom (manager-defined) fields are NOT included here — those
// get their column added lazily via customFields.ensureColumnsForSection()
// the first time the section is read/written, so a field created after a
// project already exists still gets added to that project's sheet.
function columnDefsFor(sectionKey) {
  const section = SECTIONS[sectionKey];
  const cols = COMMON_COLUMNS.map((c) => ({ title: c.title, type: c.type, primary: !!c.primary }));
  section.fields.forEach((f) => {
    // secret fields get a normal column too now — see the `secret` note
    // above. Only the frontend's masked-input treatment distinguishes them.
    cols.push({ title: f.title, type: f.type === 'CHECKBOX' ? 'CHECKBOX' : 'TEXT_NUMBER' });
  });
  return cols;
}

// Convert a flat { fieldId: value } object (as collected in the browser)
// into { columnTitle: value } cells ready for Smartsheet. Active custom
// fields for this section are merged in automatically, keyed by their
// stable "Custom: <id>" column.
function toCells(sectionKey, formData) {
  const section = SECTIONS[sectionKey];
  const cells = {};
  section.fields.forEach((f) => {
    const raw = formData[f.id];
    if (f.type === 'CHECKBOX') {
      cells[f.title] = !!raw;
    } else {
      cells[f.title] = raw === undefined || raw === null ? '' : String(raw);
    }
  });
  customFields.listForSection(sectionKey).forEach((f) => {
    const raw = formData[f.id];
    cells[customFields.columnTitleFor(f)] = raw === undefined || raw === null ? '' : String(raw);
  });
  return cells;
}

// Convert Smartsheet row cells ({ columnTitle: value }) back into the flat
// { fieldId: value } shape the frontend form understands, for pre-filling.
// Secret fields now round-trip their real value like any other field (see
// the `secret` note above) — `${fieldId}__provided` is still included
// alongside it purely so any UI that still checks that flag keeps working.
function fromCells(sectionKey, cellMap) {
  const section = SECTIONS[sectionKey];
  const data = {};
  section.fields.forEach((f) => {
    if (f.type === 'CHECKBOX') {
      data[f.id] = !!cellMap[f.title];
    } else {
      data[f.id] = cellMap[f.title] || '';
    }
    if (f.secret) data[`${f.id}__provided`] = !!cellMap[f.title];
  });
  customFields.listForSection(sectionKey).forEach((f) => {
    data[f.id] = cellMap[customFields.columnTitleFor(f)] || '';
  });
  return data;
}

module.exports = {
  SECTION_KEYS,
  SECTION_LABELS,
  SECTIONS,
  COMMON_COLUMNS,
  PAYMENT_VENDOR_TYPES,
  HOSTING_TYPES,
  columnDefsFor,
  toCells,
  fromCells,
};
