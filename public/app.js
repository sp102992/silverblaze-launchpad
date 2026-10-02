// Manager dashboard logic. Every Smartsheet read/write goes through our own
// backend (fetch calls below) — no Smartsheet API token or Smartsheet
// sheet ID ever lives in this file or in localStorage.
// NOTE: Branding no longer has its own nav position — its fields render as
// an extra card at the bottom of Business Info (now "Business info &
// branding"), and its data saves into the SAME section key (business_info).
// SKEYS/SICONS/SNAMES therefore have 6 entries (not 7); every numeric
// section index below 3 is unchanged, everything from index 3 up is shifted
// down by one relative to earlier versions of this file.
const SNAMES = ['Business info & branding', 'CIS integration', 'Payment vendor', 'SMTP config', 'Ansible inventory', 'Smart meter'];
const SKEYS = ['business_info', 'cis_integration', 'payment_vendor', 'smtp_config', 'ansible_inventory', 'smart_meter'];
const SICONS = ['fa-building', 'fa-plug', 'fa-credit-card', 'fa-envelope', 'fa-server', 'fa-tachometer-alt'];
const secState = { 0: 'p', 1: 'p', 2: 'p', 3: 'p', 4: 'p', 5: 'sk' };
let smEnabled = false;
let currentProject = null; // { projectName, workspaceId, sheets: {...}, hostingType }
let currentUserRole = 'team'; // 'manager' sees every project; 'team' sees only created/assigned
// Config feature flags from server/config.js (server/routes/auth.js -> /auth/me).
// Defaults here match the server's own defaults so the UI never assumes a
// feature is on before /auth/me responds.
let FEATURES = { showProjectManagementSection: false, showConfigExport: false, showOverviewSection: false };
// ── DESIGNER: inline field editing state ──────────────────────────────────
// Designers no longer use a separate "Manage Fields" page — they add/edit/
// delete fields directly inside each vendor's real intake section (see
// renderDesignerSection() below). Each vendor has its OWN draft/published
// state and its OWN Publish button, so this tracks pending-ness per section
// rather than as one global flag.
let designerSectionPending = {}; // { business_info: true/false, ... }
let designerFieldsCache = {}; // { business_info: [field, ...], ... } — last fetched draft fields, so the edit modal can look a field up by id without a round trip
let designerOverridesCache = {}; // { business_info: { biz_name: {label,hidden}, ... }, ... } — last fetched DRAFT rename/hide overrides for that section's hardcoded fields
let currentDesignerSectionKey = null; // which vendor section is currently on screen, for the leave-page guard
function anyDesignerPending() {
  return Object.values(designerSectionPending).some(Boolean);
}

// Applies autocomplete="off" to every input/select/textarea already on the
// page that doesn't already declare its own autocomplete value — belt-and-
// suspenders against the BROWSER's own remembered-values feature (separate
// from real data loaded via fillSection()/loadIntoForm() below). Without
// this, a manager typing into, say, the CIS Point of Contact email on one
// project can come back on a different project and have the browser
// silently suggest/fill that old value in, which looks identical to real
// saved data unless you look closely. Every section in index.html is static
// markup present at page load (unlike the customer share-link page, which
// renders per-section from a template), so one pass here covers all of it.
function disableAutofillEverywhere() {
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
  });
}

// ── BOOT ──────────────────────────────────────────────────
window.addEventListener('load', async () => {
  disableAutofillEverywhere();
  const me = await getJSON('/auth/me');
  FEATURES = me.features || FEATURES;
  if (me.signedIn) {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('app-page').classList.add('active');
    document.getElementById('me-label').textContent = me.displayName || me.username || 'Manager';
    currentUserRole = me.role || 'team';
    document.getElementById('team-access-card').style.display = currentUserRole === 'manager' ? 'block' : 'none';
    applyVisibilityRules();
    // Overview is manager-only whenever it's config-enabled at all — a team
    // member always lands on the first vendor intake section, same as a
    // Designer does for a different reason (no per-project work at all).
    const showOverview = FEATURES.showOverviewSection && currentUserRole === 'manager';
    goTo(currentUserRole === 'designer' ? 0 : (showOverview ? 12 : 0));
    // A Manager/Team member with no project loaded yet (true on every fresh
    // sign-in — nothing persists currentProject across page loads) gets a
    // one-time prompt to Create vs Retrieve, instead of landing on a blank
    // intake form they might start typing into before realizing nothing is
    // actually saved anywhere yet. Designers skip this — they have no
    // per-project work — as does a manager who landed on Overview instead,
    // since they'll open a project from that dashboard.
    if (currentUserRole !== 'designer' && !showOverview) {
      openModal('project-gate-modal');
    }
  } else {
    document.getElementById('app-page').classList.remove('active');
    document.getElementById('login-page').classList.add('active');
  }
});

// Single pass that computes each tagged element's final visibility from
// EVERY rule that applies to it, rather than applying each attribute in its
// own separate pass. That distinction matters: an element can carry more
// than one of these attributes at once (e.g. a Project Management nav item
// is both data-feature-gated AND data-designer-hide-gated), and applying
// them as sequential passes means whichever pass runs last wins outright —
// which is exactly the bug this replaced: data-designer-hide's own pass
// used to unconditionally set display:'' for every non-Designer, silently
// re-showing a nav item that an earlier data-feature pass had just hidden
// because its config flag was off. Computing one combined AND of every
// applicable rule up front means the order elements are queried in can
// never matter.
function applyVisibilityRules() {
  const all = new Set();
  document.querySelectorAll('[data-feature],[data-designer-only],[data-designer-hide],[data-manager-only]').forEach((el) => all.add(el));
  all.forEach((el) => {
    let visible = true;
    if (el.hasAttribute('data-feature')) visible = visible && !!FEATURES[el.getAttribute('data-feature')];
    if (el.hasAttribute('data-designer-only')) visible = visible && currentUserRole === 'designer';
    if (el.hasAttribute('data-designer-hide')) visible = visible && currentUserRole !== 'designer';
    if (el.hasAttribute('data-manager-only')) visible = visible && currentUserRole === 'manager';
    el.style.display = visible ? '' : 'none';
  });
}

// Swaps the gate modal from its two-option choice screen to an inline
// "Project name + hosting type" form — asked right here in one step,
// instead of closing this modal and pointing at the project bar, then
// asking hosting type again in a second modal after creation.
function gateCreateProject() {
  document.getElementById('pg-choice').style.display = 'none';
  document.getElementById('pg-create-form').style.display = 'block';
  document.getElementById('pg-proj-name').value = '';
  document.getElementById('pg-hosting-type').value = '';
  setTimeout(() => document.getElementById('pg-proj-name').focus(), 50);
}
function gateBackToChoice() {
  document.getElementById('pg-create-form').style.display = 'none';
  document.getElementById('pg-choice').style.display = 'block';
}
function gateRetrieveProject() {
  closeModal('project-gate-modal');
  openRetrieveModal();
}
async function gateSubmitCreate() {
  const name = gv('pg-proj-name');
  const hostingType = gv('pg-hosting-type');
  if (!name) { toast('Enter a project name first', 'warn'); return; }
  if (!hostingType) { toast('Select a hosting type first', 'warn'); return; }
  const btn = document.getElementById('pg-create-btn');
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Creating…';
  // Keep the persistent project bar in sync — createProject() reads its
  // name from #proj_name, the same field the rest of the app already uses.
  document.getElementById('proj_name').value = name;
  onProjNameInput();
  await createProject(false, hostingType);
  btn.disabled = false; btn.innerHTML = orig;
  if (currentProject && currentProject.projectName === name) {
    closeModal('project-gate-modal');
    gateBackToChoice(); // reset the modal's internal state for next time
  }
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const err = document.getElementById('login-err');
  if (!username || !password) { err.textContent = 'Enter both username and password'; return; }
  try {
    await postJSON('/auth/login', { username, password });
    window.location.reload();
  } catch (e) {
    err.textContent = e.message || 'Incorrect username or password';
    document.getElementById('login-pass').value = '';
  }
}

async function doLogout() {
  if (anyDesignerPending()) {
    const ok = window.confirm('You have draft vendor-template changes that have not been published yet.\n\nThey will still be there as a draft next time you sign in, but will not go live until someone publishes them. Sign out anyway?');
    if (!ok) return;
  }
  await fetch('/auth/logout', { method: 'POST' });
  window.location.reload();
}

// Covers actually leaving the page (closing the tab, refreshing, typing a
// new URL) — the one case goTo()'s own guard above can't catch, since this
// is a single-page app and goTo() never changes the URL.
window.addEventListener('beforeunload', (e) => {
  if (!anyDesignerPending()) return;
  e.preventDefault();
  e.returnValue = '';
});

// ── FETCH HELPERS ─────────────────────────────────────────
async function getJSON(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Same pattern as postJSON below — surface the server's real error
    // message instead of letting callers crash on a missing field.
    const err = new Error(data.error || 'Request failed');
    Object.assign(err, data);
    throw err;
  }
  return data;
}
async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Attach the full response body (needsConfirm, suggestion, exactMatch,
    // etc.) to the thrown error so callers can branch on more than a message.
    const err = new Error(data.error || 'Request failed');
    Object.assign(err, data);
    throw err;
  }
  return data;
}

// ── PROJECT: CREATE vs RETRIEVE ────────────────────────────
function onProjNameInput() {
  document.getElementById('share-proj-note').textContent = gv('proj_name')
    ? `Project: ${gv('proj_name')}`
    : 'Create or retrieve a project above first.';
}

function loadIntoForm(name, project, loaded) {
  currentProject = project;
  currentProject.hostingType = loaded.hostingType || project.hostingType || null;
  lastLoadedSections = loaded.sections;
  SKEYS.forEach((key, i) => {
    fillSection(i, loaded.sections[key].data);
    if (loaded.sections[key].found) markDone(i, loaded.sections[key].status);
  });
  document.getElementById('load-status').textContent =
    'Ready — ' + SKEYS.filter((k) => loaded.sections[k].found).length + ' section(s) loaded';
  // Refreshes the Team Updates unread-blocker badge right away, without
  // requiring the manager to open that tab first.
  loadUpdates();
  if (loaded.sections.pm_info) fillPmInfo(loaded.sections.pm_info.data, loaded.sections.pm_info.found, loaded.sections.pm_info.status);
  // Requirement 8: ask the hosting question once per project. If it's
  // already answered, just apply the gating; if not, ask before anything
  // else so Ansible/vendor-IP visibility is correct from the first render.
  if (currentProject.hostingType) {
    applyHostingGating(currentProject.hostingType);
  } else {
    showHostingGate();
  }
}

// Only ever FINDS an existing project. Never creates anything — if there's
// no exact match, it tells you (and suggests a close name if one exists)
// instead of silently making a new Workspace out of a typo.
async function retrieveProject() {
  const name = gv('proj_name');
  if (!name) { toast('Enter a client/project name first', 'warn'); return; }
  const btn = document.getElementById('retrieve-btn');
  const status = document.getElementById('load-status');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Looking up…';
  status.textContent = '';
  try {
    const found = await postJSON('/api/projects/retrieve', { projectName: name });
    const loaded = await getJSON('/api/projects/' + encodeURIComponent(name));
    loadIntoForm(name, found.project, loaded);
    toast('Retrieved "' + name + '"', 'ok');
  } catch (e) {
    status.textContent = e.message;
    toast(e.message, 'err');
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-magnifying-glass"></i> Retrieve Existing Project';
}

// Only ever CREATES a new Workspace + 7 Sheets. Refuses if the exact name
// already exists, and warns (with a confirm step) if a similarly-spelled
// project already exists — the typo-guard. `presetHostingType`, when
// passed (only by gateSubmitCreate(), the project-gate modal's inline
// create form), saves the hosting type via the same endpoint chooseHosting()
// uses, BEFORE the project's data is loaded into the form — so loadIntoForm()
// sees a hosting type already set and applies its gating directly instead of
// popping open the separate hosting-gate modal right after this one closes.
async function createProject(confirmed, presetHostingType) {
  const name = gv('proj_name');
  if (!name) { toast('Enter a client/project name first', 'warn'); return; }
  const btn = document.getElementById('create-btn');
  const status = document.getElementById('load-status');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Creating…';
  status.textContent = '';
  try {
    const created = await postJSON('/api/projects/create', { projectName: name, confirm: !!confirmed });
    if (presetHostingType) {
      await postJSON(`/api/projects/${encodeURIComponent(name)}/hosting`, { hostingType: presetHostingType });
    }
    const loaded = await getJSON('/api/projects/' + encodeURIComponent(name));
    loadIntoForm(name, created.project, loaded);
    toast('Created "' + name + '"', 'ok');
  } catch (e) {
    // A 409 with needsConfirm means the server found a similarly-named
    // project and wants a human to decide before creating a duplicate.
    if (e.needsConfirm) {
      if (window.confirm(e.message)) {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-folder-plus"></i> Create New Project';
        return createProject(true, presetHostingType);
      }
      status.textContent = 'Cancelled — did not create a new project.';
    } else {
      status.textContent = e.message;
      toast(e.message, 'err');
    }
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-folder-plus"></i> Create New Project';
}

// ── FILL SECTION FROM BACKEND DATA ────────────────────────
// Resets EVERY field in this section (not just the ones present in `d`) on
// every load — critical when switching between projects. The previous
// version only ever wrote a value in when `d` had a non-empty one for that
// field id, which meant a field with no data for the newly-loaded project
// was simply left however it last was — including a real value someone had
// typed in for a DIFFERENT project a moment before. That looked exactly
// like "data is pre-populated that shouldn't be there," because it was: it
// was genuinely still sitting in the DOM from whatever was open previously,
// not anything the server sent for this project.
function fillSection(n, d) {
  d = d || {};
  const root = document.getElementById('sec-' + n);
  if (!root) return;
  root.querySelectorAll('input,select,textarea').forEach((el) => {
    if (!el.id) return;
    const val = d[el.id];
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val === undefined || val === null ? '' : val;
  });
  // Always called (not just when truthy) so switching to a project with no
  // vendor chosen yet correctly hides whichever vendor block a PREVIOUS
  // project had left visible, instead of leaving it stuck open.
  if (n === 2) togglePayVendor(d.pay_vendor_type || '');
  // Branding's two color pickers live on Business Info now (n === 0) —
  // sync their swatch to whatever hex was just filled in above, or back to
  // the default swatch color if this project has no color saved yet (same
  // "always reset, don't just conditionally set" reasoning as above).
  if (n === 0) {
    document.getElementById('brand_pick1').value = gv('brand_hex1') || '#0055A4';
    document.getElementById('brand_pick2').value = gv('brand_hex2') || '#534AB7';
  }
  // Always called (not just when on) so a project with Smart Meter off (or
  // never set) correctly collapses the fields block a PREVIOUS project may
  // have left open, instead of leaving it stuck visible.
  if (n === 5) toggleSM(!!d.sm_on);
}

// ── PAYMENT VENDOR: SHOW ONLY THE FIELDS FOR THE CHOSEN VENDOR ────────────
// "Invoice Cloud" -> pay-block-InvoiceCloud, "Paymentus" -> pay-block-Paymentus,
// "Other" -> pay-block-Other. Point of Contact / test accounts / one-time
// payment URL / general comments stay visible regardless of vendor.
function togglePayVendor(value) {
  const blockId = 'pay-block-' + (value || '').replace(/\s+/g, '');
  document.querySelectorAll('.pay-vendor-block').forEach((block) => {
    block.style.display = block.id === blockId ? 'block' : 'none';
  });
}

// ── HOSTING GATE (requirement 8) ───────────────────────────
// Asked once per project, right after it's created/opened. The choice
// (SILVERBLAZE_AZURE vs CLIENT_BU_HOSTED) is saved on the project record
// server-side (server/sectionSchemas.js HOSTING_TYPES / /hosting endpoint)
// and drives Ansible Inventory's requiredness plus the vendor-IP
// whitelisting fields on CIS Integration / Payment Vendor — centralized
// here rather than scattered per-field checks.
function showHostingGate() {
  openModal('hosting-modal');
}
function reopenHostingGate() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  showHostingGate();
}
async function chooseHosting(hostingType) {
  if (!currentProject) return;
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/hosting`, { hostingType });
    currentProject.hostingType = hostingType;
    closeModal('hosting-modal');
    applyHostingGating(hostingType);
    toast('Hosting type set to ' + (hostingType === 'SILVERBLAZE_AZURE' ? 'Silverblaze Azure Hosted' : 'Client/BU Hosted Server'), 'ok');
  } catch (e) {
    toast('Could not save hosting type: ' + e.message, 'err');
  }
}
// Applies the visual/requiredness consequences of the hosting choice.
// Client/BU Hosted must leave every existing behavior untouched (8.3) —
// this function is the single place that branches on hostingType so no
// other code needs its own hostingType check.
function applyHostingGating(hostingType) {
  const isAzure = hostingType === 'SILVERBLAZE_AZURE';
  const envSelect = document.getElementById('env_hosting_type');
  if (envSelect) envSelect.value = hostingType || '';
  // Ansible Inventory: grayed out / disabled / marked N/A under Silverblaze
  // Azure Hosted; completely unchanged under Client/BU Hosted.
  const ansContent = document.getElementById('ansible-content');
  const ansBanner = document.getElementById('ansible-na-banner');
  if (ansContent) ansContent.classList.toggle('section-disabled', isAzure);
  if (ansBanner) ansBanner.style.display = isAzure ? 'flex' : 'none';
  document.querySelectorAll('#sec-4 input,#sec-4 select,#sec-4 textarea').forEach((el) => { el.disabled = isAzure; });
  // Silverblaze IP whitelisting cards on CIS Integration / Payment Vendor /
  // Smart Meter / SMTP Configuration: only relevant (and only shown, never
  // required) under Silverblaze Azure Hosted — hidden completely, with zero
  // validation impact, under Client/BU Hosted.
  ['cis-veip-card', 'pay-veip-card', 'sm-veip-card', 'smtp-veip-card'].forEach((id) => {
    const card = document.getElementById(id);
    if (card) card.style.display = isAzure ? 'block' : 'none';
  });
}

// ── POINT OF CONTACT REUSE (requirement 6) ────────────────────────────────
// Business Info's Point of Contact is the canonical source — every other
// section's own POC card can copy it in one click instead of the PS team
// member re-typing the same name/email into every section.
function copyPocFrom(targetPrefix) {
  const name = gv('biz_poc_name');
  const email = gv('biz_poc_email');
  if (!name && !email) { toast('Fill in Business Info\'s Point of Contact first', 'warn'); return; }
  const nameEl = document.getElementById(targetPrefix === 'pay' ? 'pay_contact' : targetPrefix + '_poc_name');
  const emailEl = document.getElementById(targetPrefix === 'pay' ? 'pay_email' : targetPrefix + '_poc_email');
  if (nameEl) nameEl.value = name;
  if (emailEl) emailEl.value = email;
  toast('Copied from Business Info', 'ok');
}

// ── COLLECT SECTION → FLAT { fieldId: value } ─────────────
function collectSec(n) {
  const root = document.getElementById('sec-' + n);
  const data = {};
  root.querySelectorAll('input,select,textarea').forEach((el) => {
    if (!el.id) return;
    data[el.id] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });
  return data;
}

// ── REQUIRED-FIELD VALIDATION ───────────────────────────────
// Scans a container for every `.f` field group that carries a `<span
// class="req">` marker, skips anything currently hidden (e.g. a Payment
// Vendor block for a vendor type that isn't selected), and flags any that
// are empty. Shared logic/markup convention with the customer share-link
// page (public/customer.js), so validation behaves the same everywhere.
function findMissingRequired(root) {
  const missing = [];
  root.querySelectorAll('.f').forEach((f) => {
    if (!f.querySelector('.req')) return;
    if (f.offsetParent === null) return; // hidden by a showIf/toggle block
    const input = f.querySelector('input,select,textarea');
    if (!input) return;
    if (input.disabled) return; // hosting-inapplicable (e.g. Ansible under Silverblaze Azure Hosted)
    const empty = input.type === 'checkbox' ? false : !input.value.trim();
    input.classList.toggle('err', empty);
    if (empty) missing.push({ f, input });
  });
  return missing;
}

// ── SAVE SECTION ───────────────────────────────────────────
async function saveSec(n) {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  const root = document.getElementById('sec-' + n);
  const missing = findMissingRequired(root);
  if (missing.length) {
    toast(`Fill in ${missing.length} required field${missing.length > 1 ? 's' : ''} before saving`, 'warn');
    missing[0].f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    missing[0].input.focus();
    return;
  }
  const formData = collectSec(n);
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/sections/${SKEYS[n]}`, {
      formData,
      status: 'complete',
    });
    markDone(n, 'complete');
    // Keep the cached section data current — otherwise a later lazy
    // re-render of this section's custom fields (e.g. right after a
    // manager adds a second custom field) would fall back to the
    // pre-save snapshot and appear to "lose" what was just saved.
    if (lastLoadedSections && lastLoadedSections[SKEYS[n]]) {
      lastLoadedSections[SKEYS[n]].data = Object.assign({}, lastLoadedSections[SKEYS[n]].data, formData);
      lastLoadedSections[SKEYS[n]].found = true;
      lastLoadedSections[SKEYS[n]].status = 'complete';
    }
    toast(SNAMES[n] + ' saved to Smartsheet', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }
}

// ── NAVIGATION / STATUS ────────────────────────────────────
function goTo(n) {
  // Designer unsaved-changes protection: leaving a vendor section that still
  // has unpublished draft field changes should never happen silently — the
  // draft itself is safely on disk either way, but it's easy to forget it
  // isn't LIVE yet. Only fires when actually switching to a DIFFERENT
  // section. See also the beforeunload guard and doLogout() above.
  if (currentUserRole === 'designer' && currentDesignerSectionKey && SKEYS[n] !== currentDesignerSectionKey && designerSectionPending[currentDesignerSectionKey]) {
    const fromName = SNAMES[SKEYS.indexOf(currentDesignerSectionKey)] || currentDesignerSectionKey;
    const ok = window.confirm(`You have draft changes on ${fromName} that have not been published yet.\n\nThey are safely saved as a draft, but will not go live until you click Publish. Leave this section anyway?`);
    if (!ok) return;
  }
  document.querySelectorAll('.view').forEach((v, i) => v.classList.toggle('active', i === n));
  // Match on the button's own id (nav-N) rather than its position in the
  // sidebar — Tools sits above Project management in the DOM now, so the
  // nav buttons are no longer in the same order as the sec-N view indices.
  document.querySelectorAll('.nb[id^="nav-"]').forEach((b) => b.classList.toggle('active', b.id === 'nav-' + n));
  updatePct();
  if (n >= 0 && n <= 5) {
    // A Designer edits DRAFT fields inline, directly inside the real
    // section; every other role fills in the real, PUBLISHED fields.
    if (currentUserRole === 'designer') renderDesignerSection(SKEYS[n]);
    else { renderCustomFields(SKEYS[n]); applyFieldOverrides(SKEYS[n]); }
  }
  if (n === 6) loadTracking();
  if (n === 7) loadForecast();
  if (n === 8) loadUpdates();
  if (n === 9) loadChecklist();
  if (n === 10) genLinks();
  if (n === 11) refreshReview();
  if (n === 12) loadPortfolio();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function updatePct() {
  const keys = [0, 1, 2, 3, 4].concat(smEnabled ? [5] : []);
  const done = keys.filter((k) => secState[k] === 'complete').length;
  const pct = Math.round((done / keys.length) * 100);
  document.getElementById('pct-fill').style.width = pct + '%';
  document.getElementById('pct-txt').textContent = pct + '%';
}
function markDone(n, status) {
  secState[n] = status || 'complete';
  const st = document.getElementById('st-' + n);
  const nb = document.getElementById('nbb-' + n);
  const nv = document.getElementById('nav-' + n);
  const isDone = secState[n] === 'complete' || secState[n] === 'submitted';
  if (st) { st.className = 'sbadge ' + (isDone ? 'sb-comp' : 'sb-pend'); st.textContent = isDone ? '✓ Complete' : 'Not started'; }
  if (nb && n < 5) { nb.className = 'nb-badge ' + (isDone ? 'nbb-ok' : 'nbb-p'); nb.textContent = isDone ? '✓' : (n + 1); }
  if (nv) nv.classList.toggle('done', isDone);
  updatePct();
}
function toggleSM(on) {
  smEnabled = on;
  document.getElementById('sm-fields').style.display = on ? 'block' : 'none';
  document.getElementById('sm-skip-msg').style.display = on ? 'none' : 'block';
  const nb = document.getElementById('nbb-5');
  if (!on) { secState[5] = 'sk'; if (nb) { nb.className = 'nb-badge nbb-sk'; nb.textContent = 'Skipped'; } }
  else { secState[5] = 'p'; if (nb) { nb.className = 'nb-badge nbb-opt'; nb.textContent = 'Optional'; } }
  updatePct();
}
function clearSec(n) {
  document.querySelectorAll(`#sec-${n} input,#sec-${n} select,#sec-${n} textarea`).forEach((el) => {
    if (el.type === 'checkbox') el.checked = false; else el.value = '';
    el.classList.remove('ok', 'err');
  });
  document.querySelectorAll(`#sec-${n} [id^="h_"]`).forEach((h) => { h.textContent = ''; h.className = 'fhint'; });
}

// ── VALIDATION ──────────────────────────────────────────────
function lv(el, type) {
  const v = el.value.trim(); const h = document.getElementById('h_' + el.id);
  if (!h) return;
  let ok = true, msg = '', cls = 'fhint';
  if (type === 'url' && v) { if (!/^https?:\/\/.+\..+/.test(v)) { ok = false; msg = 'Must start with https://'; cls = 'ferr'; } else { msg = '✓ Valid URL'; cls = 'fok'; } }
  if (type === 'email' && v) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { ok = false; msg = 'Invalid email'; cls = 'ferr'; } else { msg = '✓ Valid email'; cls = 'fok'; } }
  if (type === 'ip' && v) { if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) { ok = false; msg = 'Enter a valid IP'; cls = 'ferr'; } else { msg = '✓ Valid IP'; cls = 'fok'; } }
  el.classList.toggle('err', !ok && v.length > 0);
  el.classList.toggle('ok', ok && v.length > 0);
  h.textContent = msg; h.className = cls;
}
function gv(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
// Same escaping convention as public/customer.js's escAttr — anything built
// from server data (project names, usernames, etc.) and dropped into
// innerHTML must go through this first.
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── GENERIC MODAL HELPER ────────────────────────────────────
// Every modal in the app (hosting gate, retrieve-project picker, and any
// future one) is a `.modal-overlay` > `.modal-box` pair. These two
// functions are the single place that shows/hides any of them, so new
// modals reuse this instead of hand-rolling their own display toggle.
// Backdrop-click-to-close is opt-in per modal (via the overlay's own
// onclick="if(event.target===this)closeModal('id')") so a deliberately
// blocking modal (like the hosting gate) can omit it.
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
// Escape closes whichever modal(s) are currently open.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay').forEach((el) => {
    if (el.style.display === 'flex') el.style.display = 'none';
  });
});

// ── RETRIEVE PROJECT MODAL ──────────────────────────────────
// Replaces manually typing a project name to retrieve. Lists every project
// this user can see — managers see all of them, team members see only
// projects they created or were assigned to. That filtering happens on the
// server (server/permissions.js visibleProjects, consumed by GET
// /api/projects) — this modal only ever renders what the API already
// decided to send back, it never does its own hiding/filtering for security.
let retrieveProjectsCache = [];
async function openRetrieveModal() {
  openModal('retrieve-modal');
  const search = document.getElementById('pp-search-input');
  if (search) search.value = '';
  const list = document.getElementById('pp-list');
  list.innerHTML = '<div class="pp-empty"><span class="spin"></span><div class="pp-empty-title">Loading projects…</div></div>';
  try {
    const { projects } = await getJSON('/api/projects');
    retrieveProjectsCache = projects || [];
    renderRetrieveList(retrieveProjectsCache);
    if (search) search.focus();
  } catch (e) {
    list.innerHTML = `<div class="pp-empty"><div class="pp-empty-title">Couldn't load projects</div><div class="pp-empty-desc">${escHtml(e.message)}</div></div>`;
  }
}
function closeRetrieveModal() {
  closeModal('retrieve-modal');
}
function filterRetrieveList() {
  const q = (document.getElementById('pp-search-input').value || '').trim().toLowerCase();
  const filtered = q ? retrieveProjectsCache.filter((p) => (p.projectName || '').toLowerCase().includes(q)) : retrieveProjectsCache;
  renderRetrieveList(filtered);
}
function hostingLabel(hostingType) {
  if (hostingType === 'SILVERBLAZE_AZURE') return 'Silverblaze Azure Hosted';
  if (hostingType === 'CLIENT_BU_HOSTED') return 'Client/BU Hosted';
  return 'Hosting not set';
}
function renderRetrieveList(projects) {
  const list = document.getElementById('pp-list');
  if (!projects.length) {
    const noneAtAll = retrieveProjectsCache.length === 0;
    list.innerHTML = `<div class="pp-empty">
      <i class="fas fa-folder-open"></i>
      <div class="pp-empty-title">${noneAtAll ? 'No projects yet' : 'No matches'}</div>
      <div class="pp-empty-desc">${noneAtAll ? 'You don’t have access to any projects yet. Create one above, or ask a manager to assign you to one.' : 'Try a different search.'}</div>
    </div>`;
    return;
  }
  list.innerHTML = projects.map((p) => {
    const updated = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—';
    const meta = [hostingLabel(p.hostingType), 'Updated ' + updated, p.createdBy ? 'Created by ' + escHtml(p.createdBy) : null].filter(Boolean).join(' · ');
    return `<div class="pp-row" onclick="selectRetrieveProject('${escHtml(p.projectName)}')">
      <div class="pp-row-ico"><i class="fas fa-folder"></i></div>
      <div class="pp-row-main">
        <div class="pp-row-name">${escHtml(p.projectName)}</div>
        <div class="pp-row-meta">${meta}</div>
      </div>
      <button class="btn btn-sec btn-sm" onclick="event.stopPropagation();selectRetrieveProject('${escHtml(p.projectName)}')"><i class="fas fa-arrow-right"></i> Open</button>
    </div>`;
  }).join('');
}
async function selectRetrieveProject(name) {
  closeRetrieveModal();
  const nameInput = document.getElementById('proj_name');
  if (nameInput) nameInput.value = name;
  onProjNameInput();
  await retrieveProject();
}

// ── SHARE LINKS ─────────────────────────────────────────────
// Keyed by sectionKey rather than array position — the share-links response
// includes all 6 vendor sections PLUS pm_info (7 items), but SICONS only
// has 6 entries (one per vendor nav item). Indexing into SICONS by array
// position broke for whichever item landed at index 6+ (silently rendering
// no icon at all) the moment a 7th section was added. Keying by sectionKey
// instead means this never breaks again regardless of how many sections
// share-links ends up covering, or what order the server returns them in.
const SECTION_ICON_BY_KEY = {
  business_info: 'fa-building',
  cis_integration: 'fa-plug',
  payment_vendor: 'fa-credit-card',
  smtp_config: 'fa-envelope',
  ansible_inventory: 'fa-server',
  smart_meter: 'fa-tachometer-alt',
  pm_info: 'fa-user-tie', // matches the sidebar nav's own icon for this section
};
let LINK_SECTION_KEYS = [];
async function genLinks() {
  const body = document.getElementById('link-body');
  if (!currentProject) { body.innerHTML = ''; return; }
  body.innerHTML = '<div class="pp-empty"><span class="spin"></span><div class="pp-empty-title">Generating links…</div></div>';
  try {
    const { links } = await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/share-links`);
    LINK_SECTION_KEYS = links.map((l) => l.sectionKey);
    if (!links.length) {
      body.innerHTML = '<div class="pp-empty"><i class="fas fa-link"></i><div class="pp-empty-title">No links yet</div><div class="pp-empty-desc">Click "Generate / refresh links" above.</div></div>';
      return;
    }
    body.innerHTML = links.map((l, i) => `
      <div class="sl-item" title="${escHtml(l.url)}">
        <div class="sl-item-label">
          <span class="sec-pill" style="background:var(--sur3);color:var(--ink2);"><i class="fas ${SECTION_ICON_BY_KEY[l.sectionKey] || 'fa-file'}" style="font-size:10px;color:var(--brand);"></i> ${escHtml(l.label)}</span>
          <span class="sl-item-owner">${escHtml(l.owner)}</span>
        </div>
        <div class="sl-item-actions">
          <button class="cp-btn" id="cpb-${i}" onclick="copyLink('${escHtml(l.url)}',${i})"><i class="fas fa-copy"></i> Copy</button>
          <button class="cp-btn" onclick="window.open('${escHtml(l.url)}','_blank')"><i class="fas fa-arrow-up-right-from-square"></i> Open</button>
        </div>
        <div class="sl-input-wrap"><i class="fas fa-envelope"></i><input type="email" id="email-${i}" placeholder="name@company.com"/></div>
        <button class="btn btn-primary sl-send-btn" id="sendb-${i}" onclick="sendLinkEmail(${i})"><i class="fas fa-paper-plane"></i> Send</button>
        <div class="sl-msg" id="sendmsg-${i}"></div>
      </div>`).join('');
  } catch (e) {
    body.innerHTML = '';
    toast('Could not generate links: ' + e.message, 'err');
  }
}
function copyLink(url, idx) {
  navigator.clipboard.writeText(url).then(() => {
    const b = document.getElementById('cpb-' + idx);
    if (b) { b.classList.add('copied'); b.innerHTML = '<i class="fas fa-check"></i> Copied'; setTimeout(() => { b.classList.remove('copied'); b.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000); }
  });
}
async function sendLinkEmail(idx) {
  const emailEl = document.getElementById('email-' + idx);
  const msgEl = document.getElementById('sendmsg-' + idx);
  const to = (emailEl.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { msgEl.textContent = 'Enter a valid email.'; msgEl.style.color = 'var(--red)'; return; }
  const sectionKey = LINK_SECTION_KEYS[idx];
  const btn = document.getElementById('sendb-' + idx);
  btn.disabled = true;
  msgEl.textContent = 'Sending…'; msgEl.style.color = 'var(--ink4)';
  try {
    const result = await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/share-links/${sectionKey}/send-email`, { to });
    if (result.delivered) { msgEl.textContent = '✓ Sent to ' + to; msgEl.style.color = 'var(--green)'; toast('Link emailed to ' + to, 'ok'); }
    else { msgEl.textContent = result.note || 'Not configured — link generated but not emailed.'; msgEl.style.color = 'var(--amber)'; }
  } catch (e) {
    msgEl.textContent = 'Failed: ' + e.message; msgEl.style.color = 'var(--red)';
  } finally {
    btn.disabled = false;
  }
}

// ── FINAL REVIEW ─────────────────────────────────────────────
// Section completion intentionally covers Project Info (PM) alongside the
// 7 core intake sections (see "additional changes" spec item 3) — added as
// its own display-only list rather than folded into SKEYS, so it can't
// disturb the positional-index math SKEYS drives elsewhere (goTo(), the
// sidebar progress %, fillSection/collectSec).
const REVIEW_SECTIONS = SKEYS.map((key, i) => ({ key, name: SNAMES[i], icon: SICONS[i] }))
  .concat([{ key: 'pm_info', name: 'Project info (PM)', icon: 'fa-user-tie' }]);

async function refreshReview() {
  if (!currentProject) { document.getElementById('rg').innerHTML = '<div class="card-note">Create or load a project first.</div>'; return; }
  const loaded = await getJSON('/api/projects/' + encodeURIComponent(currentProject.projectName));
  SKEYS.forEach((key, i) => { if (loaded.sections[key].found) markDone(i, loaded.sections[key].status); });
  if (loaded.sections.pm_info) {
    const st = document.getElementById('st-13');
    const isDone = loaded.sections.pm_info.found && (loaded.sections.pm_info.status === 'complete' || loaded.sections.pm_info.status === 'submitted');
    if (st) { st.className = 'sbadge ' + (isDone ? 'sb-comp' : 'sb-pend'); st.textContent = isDone ? '✓ Complete' : 'Not started'; }
  }
  document.getElementById('rg').innerHTML = REVIEW_SECTIONS.map(({ key, name, icon }) => {
    const found = loaded.sections[key] && loaded.sections[key].found;
    return `<div class="rc ${found ? 'complete' : ''}">
      <div class="rc-icon"><i class="fas ${icon}"></i></div>
      <div class="rc-name">${name}</div>
      <span class="sbadge ${found ? 'sb-comp' : 'sb-pend'}" style="font-size:10px;">${found ? '✓ Complete' : 'Pending'}</span>
    </div>`;
  }).join('');
}

// ── FINAL REVIEW: CONFIG EXPORT ───────────────────────────────────────────
// The parameter names in the generated file come from server/configKeyMap.js
// (the one file you edit to match your real utility-portal codebase) — this
// front-end code never hardcodes a property key.
let lastConfigText = '';
let lastConfigFilename = 'config.properties';

async function genConfig() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  try {
    const { configText, filename } = await postJSON(
      `/api/projects/${encodeURIComponent(currentProject.projectName)}/config/generate`
    );
    lastConfigText = configText;
    lastConfigFilename = filename;
    document.getElementById('cfg-filename').textContent = filename;
    document.getElementById('cfg-pre').textContent = configText;
    document.getElementById('cfg-area').style.display = 'block';
  } catch (e) {
    toast('Could not generate config: ' + e.message, 'err');
  }
}

async function saveConfigToSmartsheet() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  const area = document.getElementById('save-area');
  try {
    const { configText, filename } = await postJSON(
      `/api/projects/${encodeURIComponent(currentProject.projectName)}/config/save`
    ).then(async (r) => {
      // /config/save returns configText but not filename — reuse the last
      // generated filename, or fall back to a sensible default.
      return { configText: r.configText, filename: lastConfigFilename };
    });
    lastConfigText = configText;
    document.getElementById('cfg-filename').textContent = filename;
    document.getElementById('cfg-pre').textContent = configText;
    document.getElementById('cfg-area').style.display = 'block';
    area.textContent = 'Saved to the "Final Configuration" sheet in this project\'s Smartsheet Workspace.';
    toast('Config saved to Smartsheet', 'ok');
  } catch (e) {
    toast('Could not save config: ' + e.message, 'err');
  }
}

function dlConfig() {
  if (!lastConfigText) { toast('Generate the config first', 'warn'); return; }
  const blob = new Blob([lastConfigText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = lastConfigFilename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function cpConfig() {
  if (!lastConfigText) { toast('Generate the config first', 'warn'); return; }
  navigator.clipboard.writeText(lastConfigText).then(() => toast('Config copied to clipboard', 'ok'));
}

// ── PROJECT TRACKING (SOW / timeline summary) ─────────────────────────────
const PT_FIELDS = [
  'pt_plan_url', 'pt_sow_link', 'pt_contract_date', 'pt_kickoff_date', 'pt_golive_date',
  'pt_phase', 'pt_status', 'pt_pm_name', 'pt_total_hours',
  'pt_customer_type', 'pt_install_type', 'pt_portal_history', 'pt_bill_presentment',
  'pt_user_migration', 'pt_integration_type', 'pt_data_migration',
  'pt_notes',
];

// Show only the customer-profile fields relevant to Business Unit vs Direct
// Customer — mirrors the togglePayVendor pattern used on Payment Vendor.
function toggleCustomerType(value) {
  const buBlock = document.getElementById('pt-block-BusinessUnit');
  const dcBlock = document.getElementById('pt-block-DirectCustomer');
  if (buBlock) buBlock.style.display = value === 'Business Unit' ? 'block' : 'none';
  if (dcBlock) dcBlock.style.display = value === 'Direct Customer' ? 'block' : 'none';
}

async function loadTracking() {
  if (!currentProject) return;
  try {
    const { data } = await getJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/tracking`);
    PT_FIELDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el && data[id]) el.value = data[id];
    });
    toggleCustomerType(data.pt_customer_type || '');
  } catch (e) {
    toast('Could not load project tracking: ' + e.message, 'err');
  }
  if (currentUserRole === 'manager') loadTeamRoster();
}

// ── TEAM ACCESS (manager-only) — who besides the creator can see this project
async function loadTeamRoster() {
  const list = document.getElementById('team-roster-list');
  if (!currentProject || !list) return;
  try {
    const [{ users }, project] = await Promise.all([
      getJSON('/api/projects/team-roster'),
      getJSON('/api/projects/' + encodeURIComponent(currentProject.projectName)).then((r) => r.project),
    ]);
    const assigned = new Set(project.assignedUsers || []);
    list.innerHTML = users.map((u) => `
      <label class="cbi" style="display:block;margin-bottom:6px;">
        <input type="checkbox" class="team-roster-cb" value="${u.username}" ${assigned.has(u.username) ? 'checked' : ''}/>
        ${u.displayName} <span style="color:var(--ink4);font-size:11px;">(${u.username}${u.role === 'manager' ? ' · manager, always has access' : ''})</span>
      </label>`).join('') || '<div class="card-note">No teammates in server/users.js yet.</div>';
  } catch (e) {
    toast('Could not load team roster: ' + e.message, 'err');
  }
}

async function saveAssignment() {
  if (!currentProject) return;
  const assignedUsers = Array.from(document.querySelectorAll('.team-roster-cb:checked')).map((el) => el.value);
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/assign`, { assignedUsers });
    toast('Team access updated', 'ok');
  } catch (e) {
    toast('Could not save assignment: ' + e.message, 'err');
  }
}

async function saveTracking() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  const formData = {};
  PT_FIELDS.forEach((id) => { formData[id] = gv(id); });
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/tracking`, { formData });
    toast('Project tracking saved to Smartsheet', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }
}

// ── PROJECT INFORMATION FOR PM (new intake section, requirement 4) ───────
// Uses the same generic /sections/:sectionKey endpoint every other intake
// section uses (server/sectionSchemas.js already has a full 'pm_info'
// entry) — it's just never added to SKEYS, so it stays completely outside
// the positional index math that drives goTo()/completion % for sections
// 0-6, avoiding any renumbering risk to the existing 7 sections.
function togglePmCustomerType(value) {
  document.getElementById('pm-bu-name-f').style.display = value === 'Business Unit' ? 'flex' : 'none';
  document.getElementById('pm-bu-block').style.display = value === 'Business Unit' ? 'block' : 'none';
  document.getElementById('pm-dc-block').style.display = value === 'Direct Customer' ? 'block' : 'none';
}

function fillPmInfo(data, found, status) {
  const root = document.getElementById('sec-13');
  if (!root) return;
  data = data || {};
  root.querySelectorAll('input,select,textarea').forEach((el) => {
    if (el.id === 'env_hosting_type') return; // driven by the hosting gate, not by section data
    if (!el.id) return;
    const v = data[el.id];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v === undefined || v === null ? '' : v;
  });
  togglePmCustomerType(gv('pm_customer_type'));
  const st = document.getElementById('st-13');
  if (st) { const isDone = found && (status === 'complete' || status === 'submitted'); st.className = 'sbadge ' + (isDone ? 'sb-comp' : 'sb-pend'); st.textContent = isDone ? '✓ Complete' : 'Not started'; }
  renderCustomFields('pm_info');
}

async function savePmInfo() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  const root = document.getElementById('sec-13');
  const missing = findMissingRequired(root);
  if (missing.length) {
    toast(`Fill in ${missing.length} required field${missing.length > 1 ? 's' : ''} before saving`, 'warn');
    missing[0].f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    missing[0].input.focus();
    return;
  }
  const formData = {};
  root.querySelectorAll('input,select,textarea').forEach((el) => {
    if (!el.id || el.id === 'env_hosting_type') return;
    formData[el.id] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/sections/pm_info`, { formData, status: 'complete' });
    const st = document.getElementById('st-13');
    if (st) { st.className = 'sbadge sb-comp'; st.textContent = '✓ Complete'; }
    if (lastLoadedSections && lastLoadedSections.pm_info) {
      lastLoadedSections.pm_info.data = Object.assign({}, lastLoadedSections.pm_info.data, formData);
      lastLoadedSections.pm_info.found = true;
      lastLoadedSections.pm_info.status = 'complete';
    }
    toast('Project information for PM saved to Smartsheet', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }
}

// ── WEEKLY FORECAST (PM enters manually, one row per week) ────────────────
async function loadForecast() {
  if (!currentProject) { document.getElementById('fc-body').innerHTML = ''; return; }
  try {
    const { weeks } = await getJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/forecast`);
    document.getElementById('fc-body').innerHTML = weeks.map((w) => `
      <tr>
        <td>${w.weekStart || '—'} ${w.weekEnd ? '→ ' + w.weekEnd : ''}</td>
        <td>${w.phase || ''}</td>
        <td>${w.forecastedHours || ''}</td>
        <td><input value="${(w.actualHours || '').toString().replace(/"/g, '&quot;')}" id="fc-actual-${w.rowId}" style="width:80px;"/></td>
        <td>${w.notes || ''}</td>
        <td><button class="cp-btn" onclick="saveForecastRow('${w.rowId}')"><i class="fas fa-check"></i> Save</button></td>
      </tr>`).join('') || '<tr><td colspan="6" style="color:var(--ink4);text-align:center;">No weeks entered yet.</td></tr>';
  } catch (e) {
    toast('Could not load forecast: ' + e.message, 'err');
  }
}

async function addForecastWeek() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/forecast`, {
      weekStart: gv('fc_week_start'),
      weekEnd: gv('fc_week_end'),
      phase: gv('fc_phase'),
      forecastedHours: gv('fc_forecasted'),
      notes: gv('fc_notes'),
    });
    ['fc_week_start', 'fc_week_end', 'fc_phase', 'fc_forecasted', 'fc_notes'].forEach((id) => { document.getElementById(id).value = ''; });
    toast('Week added', 'ok');
    loadForecast();
  } catch (e) {
    toast('Could not add week: ' + e.message, 'err');
  }
}

async function saveForecastRow(rowId) {
  if (!currentProject) return;
  const actual = gv('fc-actual-' + rowId);
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/forecast/${rowId}`, { actualHours: actual });
    toast('Actual hours saved', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }
}
// ── TEAM UPDATES / BLOCKERS (manager/team only) ───────────────────────────
async function loadUpdates() {
  if (!currentProject) { document.getElementById('updates-feed').innerHTML = ''; return; }
  try {
    const { updates } = await getJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/updates`);
    const unresolvedBlockers = updates.filter((u) => u.type === 'Blocker' && !u.resolved).length;
    const badge = document.getElementById('nbb-updates');
    if (badge) {
      badge.style.display = unresolvedBlockers > 0 ? 'inline-flex' : 'none';
      badge.textContent = unresolvedBlockers > 0 ? unresolvedBlockers : '!';
    }
    const feed = document.getElementById('updates-feed');
    if (!feed) return;
    feed.innerHTML = updates.map((u) => `
      <div class="card" style="margin-bottom:10px;border-left:3px solid ${u.type === 'Blocker' && !u.resolved ? 'var(--red,#d33)' : 'var(--brand,#0055A4)'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <span class="sbadge ${u.type === 'Blocker' ? 'sb-pend' : 'sb-comp'}" style="font-size:10px;">${u.type}</span>
            <span style="font-size:12px;color:var(--ink4);margin-left:8px;">${u.section} · ${u.author} · ${new Date(u.postedAt).toLocaleString()}</span>
          </div>
          ${u.type === 'Blocker' && !u.resolved ? `<button class="cp-btn" onclick="resolveUpdate('${u.rowId}')"><i class="fas fa-check"></i> Resolve</button>` : (u.resolved ? '<span class="sbadge sb-comp" style="font-size:10px;">Resolved</span>' : '')}
        </div>
        <div style="margin-top:8px;font-size:13px;">${u.comment}</div>
      </div>`).join('') || '<div class="card-note">No updates posted yet.</div>';
  } catch (e) {
    toast('Could not load updates: ' + e.message, 'err');
  }
}

async function postUpdate() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  const comment = gv('up_comment');
  if (!comment) { toast('Enter a comment first', 'warn'); return; }
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/updates`, {
      type: gv('up_type'),
      section: gv('up_section'),
      comment,
    });
    document.getElementById('up_comment').value = '';
    toast('Posted', 'ok');
    loadUpdates();
  } catch (e) {
    toast('Could not post update: ' + e.message, 'err');
  }
}

async function resolveUpdate(rowId) {
  if (!currentProject) return;
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/updates/${rowId}/resolve`);
    toast('Marked resolved', 'ok');
    loadUpdates();
  } catch (e) {
    toast('Could not resolve: ' + e.message, 'err');
  }
}

// ── BUILD CHECKLIST (fully manual — server/checklistSchema.js) ───────────
const CL_STATUSES = ['Not Started', 'In Progress', 'Done', 'Blocked'];
const CL_STATUS_CLASS = { 'Not Started': 'sb-pend', 'In Progress': 'sb-inprog', 'Done': 'sb-comp', 'Blocked': 'sb-blocked' };
let clDragRowId = null;

async function loadChecklist() {
  const body = document.getElementById('checklist-body');
  if (!currentProject) { body.innerHTML = ''; return; }
  try {
    const { steps } = await getJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/checklist`);
    body.innerHTML = steps.map((s) => `
      <tr draggable="true" data-row-id="${s.rowId}" ondragstart="clDragStart(event,'${s.rowId}')" ondragover="clDragOver(event)" ondrop="clDrop(event,'${s.rowId}')" ondragend="clDragEnd(event)">
        <td class="cl-drag-handle"><i class="fas fa-grip-vertical"></i></td>
        <td>
          <input class="cl-edit-title" id="cl-title-${s.rowId}" value="${(s.title || '').replace(/"/g, '&quot;')}" onchange="updateChecklistRow('${s.rowId}')" style="font-weight:600;border:none;background:transparent;padding:2px 0;width:100%;"/>
          <textarea id="cl-desc-${s.rowId}" onchange="updateChecklistRow('${s.rowId}')" placeholder="Add a description" style="font-size:12px;color:var(--ink4);border:none;background:transparent;padding:2px 0;width:100%;resize:vertical;min-height:20px;">${s.description || ''}</textarea>
        </td>
        <td>
          <select id="cl-status-${s.rowId}" class="cl-status-select ${CL_STATUS_CLASS[s.status] || 'sb-pend'}" onchange="updateChecklistRow('${s.rowId}')">
            ${CL_STATUSES.map((o) => `<option ${o === s.status ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </td>
        <td><input id="cl-comment-${s.rowId}" value="${(s.comment || '').replace(/"/g, '&quot;')}" onchange="updateChecklistRow('${s.rowId}')" placeholder="Optional comment"/></td>
        <td><button class="cl-del-btn" title="Delete step" onclick="deleteChecklistItem('${s.rowId}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="color:var(--ink4);text-align:center;">No checklist items yet — add the first one above.</td></tr>';
    // Recolor each status select whenever its value changes.
    document.querySelectorAll('.cl-status-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        sel.className = 'cl-status-select ' + (CL_STATUS_CLASS[sel.value] || 'sb-pend');
      });
    });
  } catch (e) {
    toast('Could not load checklist: ' + e.message, 'err');
  }
}

async function addChecklistItem() {
  if (!currentProject) { toast('Create or load a project first', 'warn'); return; }
  const title = gv('cl_new_title');
  if (!title) { toast('Enter a step title first', 'warn'); return; }
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/checklist`, {
      title, description: gv('cl_new_desc'),
    });
    document.getElementById('cl_new_title').value = '';
    document.getElementById('cl_new_desc').value = '';
    toast('Step added', 'ok');
    loadChecklist();
  } catch (e) {
    toast('Could not add step: ' + e.message, 'err');
  }
}

async function updateChecklistRow(rowId) {
  if (!currentProject) return;
  const status = gv('cl-status-' + rowId);
  const comment = gv('cl-comment-' + rowId);
  const title = gv('cl-title-' + rowId);
  const description = gv('cl-desc-' + rowId);
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/checklist/${rowId}`, { status, comment, title, description });
    toast('Checklist updated', 'ok');
  } catch (e) {
    toast('Update failed: ' + e.message, 'err');
  }
}

async function deleteChecklistItem(rowId) {
  if (!currentProject) return;
  if (!window.confirm('Delete this checklist step? This cannot be undone.')) return;
  try {
    const r = await fetch(`/api/projects/${encodeURIComponent(currentProject.projectName)}/checklist/${rowId}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Delete failed'); }
    toast('Step deleted', 'ok');
    loadChecklist();
  } catch (e) {
    toast('Could not delete step: ' + e.message, 'err');
  }
}

// ── DRAG-AND-DROP REORDER ──────────────────────────────────
function clDragStart(ev, rowId) {
  clDragRowId = rowId;
  ev.dataTransfer.effectAllowed = 'move';
  ev.currentTarget.classList.add('cl-dragging');
}
function clDragOver(ev) {
  ev.preventDefault();
  document.querySelectorAll('#checklist-body tr.cl-drag-over').forEach((r) => r.classList.remove('cl-drag-over'));
  ev.currentTarget.classList.add('cl-drag-over');
}
function clDragEnd(ev) {
  ev.currentTarget.classList.remove('cl-dragging');
  document.querySelectorAll('#checklist-body tr.cl-drag-over').forEach((r) => r.classList.remove('cl-drag-over'));
}
async function clDrop(ev, targetRowId) {
  ev.preventDefault();
  document.querySelectorAll('#checklist-body tr.cl-drag-over').forEach((r) => r.classList.remove('cl-drag-over'));
  if (!clDragRowId || clDragRowId === targetRowId) return;
  const body = document.getElementById('checklist-body');
  const rows = Array.from(body.querySelectorAll('tr[data-row-id]'));
  const draggedEl = rows.find((r) => r.dataset.rowId === clDragRowId);
  const targetEl = rows.find((r) => r.dataset.rowId === targetRowId);
  if (!draggedEl || !targetEl) return;
  targetEl.parentNode.insertBefore(draggedEl, targetEl);
  const rowIds = Array.from(body.querySelectorAll('tr[data-row-id]')).map((r) => r.dataset.rowId);
  try {
    await postJSON(`/api/projects/${encodeURIComponent(currentProject.projectName)}/checklist/reorder`, { rowIds });
  } catch (e) {
    toast('Could not save new order: ' + e.message, 'err');
    loadChecklist();
  }
}

// ── PORTFOLIO (All Projects) ──────────────────────────────────────────────
const RAG_COLOR = { green: 'var(--green,#1a8a4a)', yellow: '#b8860b', red: 'var(--red,#c0392b)' };
const RAG_LABEL = { green: 'On track', yellow: 'Watch', red: 'At risk' };

async function loadPortfolio() {
  const body = document.getElementById('portfolio-body');
  if (!body) return;
  body.innerHTML = '<div class="card-note">Loading…</div>';
  try {
    const data = await getJSON('/api/projects/portfolio');
    const projects = data.projects || [];
    if (!projects.length) { body.innerHTML = '<div class="card-note">No projects yet — create one from any intake section.</div>'; return; }
    body.innerHTML = projects.map((p) => `
      <div class="card" style="margin-bottom:10px;border-left:4px solid ${RAG_COLOR[p.rag] || '#999'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;font-size:15px;">${p.projectName}</div>
            <div style="font-size:12px;color:var(--ink4);margin-top:2px;">
              ${p.phase || 'Phase not set'} · ${p.pmName || 'No PM assigned'}${p.targetGoLive ? ' · Target go-live ' + p.targetGoLive : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="sbadge" style="font-size:11px;background:${RAG_COLOR[p.rag]}22;color:${RAG_COLOR[p.rag]};">${RAG_LABEL[p.rag] || p.rag}</span>
            <button class="btn btn-sec btn-sm" onclick="openFromPortfolio('${p.projectName.replace(/'/g, "\\'")}')"><i class="fas fa-arrow-right"></i> Open</button>
          </div>
        </div>
        <div style="display:flex;gap:24px;margin-top:12px;flex-wrap:wrap;">
          <div>
            <div class="pct-lbl" style="min-width:160px;"><span>Intake completion</span><span>${p.completionPct}%</span></div>
            <div class="pct-track"><div class="pct-fill" style="width:${p.completionPct}%"></div></div>
          </div>
          <div style="font-size:12px;color:var(--ink4);">
            ${p.unresolvedBlockers > 0 ? `<i class="fas fa-triangle-exclamation" style="color:${RAG_COLOR.red};"></i> ${p.unresolvedBlockers} open blocker${p.unresolvedBlockers > 1 ? 's' : ''}` : '<i class="fas fa-check" style="color:var(--green,#1a8a4a);"></i> No open blockers'}
            ${p.projectedGoLive ? `<br/>Projected pace: ~${p.projectedGoLive}` : ''}
          </div>
        </div>
        ${p.reasons && p.reasons.length ? `<div style="font-size:11px;color:var(--ink4);margin-top:8px;">${p.reasons.join(' · ')}</div>` : ''}
      </div>`).join('');
  } catch (e) {
    body.innerHTML = '';
    toast('Could not load portfolio: ' + e.message, 'err');
  }
}

async function openFromPortfolio(name) {
  document.getElementById('proj_name').value = name;
  await retrieveProject();
  goTo(6); // land on Project Tracking for an existing project, not Business Info
}

// ── DYNAMIC CUSTOM FIELDS (manager-created, requirements 7-14) ────────────
// The most recently loaded project's section data — cached so that when a
// section's custom-field inputs render lazily (on first visit to that
// section, after fillSection() already ran once) we still have the right
// values to pre-fill them with.
let lastLoadedSections = null;

function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

// Builds ONE manager-added field as a real DOM element using the exact same
// `.f` markup as every built-in field — required fields get the same `<span
// class="req">` marker, so the existing findMissingRequired()/collectSec()
// pick it up with zero special-casing (requirement 12).
function buildCustomFieldEl(field, value) {
  const v = value === undefined || value === null ? '' : String(value);
  const reqMark = field.required ? ' <span class="req">*</span>' : '';
  const wrap = document.createElement('div');
  let inner;
  if (field.type === 'dropdown') {
    const opts = (field.options || []).map((o) => `<option value="${escAttr(o)}" ${o === value ? 'selected' : ''}>${o}</option>`).join('');
    inner = `<label class="flbl">${field.label}${reqMark}</label><select id="${field.id}"><option value="">Select…</option>${opts}</select>`;
  } else if (field.type === 'date') {
    inner = `<label class="flbl">${field.label}${reqMark}</label><input type="date" id="${field.id}" value="${escAttr(v)}"/>`;
  } else {
    inner = `<label class="flbl">${field.label}${reqMark}</label><input id="${field.id}" value="${escAttr(v)}" placeholder="${field.label}"/>`;
  }
  wrap.innerHTML = `<div class="f cf-injected" data-section="${field.sectionKey}" data-cf-id="${field.id}">${inner}</div>`;
  return wrap.firstElementChild;
}

// Injects a section's active custom fields directly into the EXISTING card
// each one is assigned to (via data-slot="<sectionKey>:<slot>" on that
// card's outer .card, matching server/fieldSlots.js) — never a separate
// "Custom Fields" block. Removes any previously-injected fields for this
// section first, so revisiting a section (or a rename/reorder/add/delete
// elsewhere) never leaves stale duplicates behind.
async function renderCustomFields(sectionKey) {
  document.querySelectorAll(`.cf-injected[data-section="${sectionKey}"]`).forEach((el) => el.remove());
  try {
    const { fields } = await getJSON('/api/custom-fields/section/' + encodeURIComponent(sectionKey));
    const data = (lastLoadedSections && lastLoadedSections[sectionKey] && lastLoadedSections[sectionKey].data) || {};
    fields.forEach((field) => {
      const container = document.querySelector(`[data-slot="${sectionKey}:${field.slot}"] .fg`);
      if (!container) return; // slot no longer exists in the markup — skip rather than crash
      container.appendChild(buildCustomFieldEl(field, data[field.id]));
    });
  } catch (e) {
    // Non-fatal — the section's built-in fields still work fine on their own.
  }
}

// Applies a Designer's PUBLISHED rename/hide overrides to this section's
// real, fillable form (manager dashboard here; public/customer.js has its
// own copy of the same logic for the share-link page). Hiding a field just
// sets display:none on its wrapper — findMissingRequired() already skips
// anything with no visible layout box, so a hidden required field is
// automatically excluded from validation with no extra code. Renaming only
// ever touches the label's own leading text node, never the `<span
// class="req">`/`<span class="optl">` markers that can follow it, so a
// required-asterisk or "(optional)" tag next to a renamed field is
// untouched.
async function applyFieldOverrides(sectionKey) {
  try {
    const { overrides } = await getJSON('/api/custom-fields/overrides/section/' + encodeURIComponent(sectionKey));
    Object.entries(overrides || {}).forEach(([fieldId, ov]) => {
      const input = document.getElementById(fieldId);
      const f = input && input.closest('.f');
      if (!f) return;
      f.style.display = ov.hidden ? 'none' : '';
      if (ov.label) {
        const label = f.querySelector(':scope > .flbl');
        if (label && label.firstChild && label.firstChild.nodeType === Node.TEXT_NODE) label.firstChild.textContent = ov.label;
      }
    });
  } catch (e) {
    // Non-fatal — the section's built-in fields still render with their default labels/visibility.
  }
}

// ── DESIGNER: inline field editing, directly inside each vendor section ──
// Replaces the old separate "Manage Fields" admin page. A Designer never
// leaves the real intake section to add/edit/delete a field — every active
// slot (card) in that section gets a small "Add field" affordance, every
// existing draft field renders as a compact chip with edit/delete icons
// right there in context, and one Publish button per vendor sits in that
// section's own header. See server/routes/customFields.js for the
// per-section draft/status/publish endpoints this talks to.

// Renders (or re-renders) sectionKey's fields in Designer mode: clears
// whatever was there before, fetches that section's DRAFT fields, injects a
// chip per active field into its slot, and makes sure every slot also has
// exactly one "Add field" button. Called by goTo() whenever a Designer
// lands on one of the 6 vendor sections.
async function renderDesignerSection(sectionKey) {
  currentDesignerSectionKey = sectionKey;
  document.querySelectorAll(`.cf-injected[data-section="${sectionKey}"]`).forEach((el) => el.remove());
  ensureAddFieldButtons(sectionKey);
  try {
    const { fields } = await getJSON('/api/custom-fields/section/' + encodeURIComponent(sectionKey) + '/draft');
    designerFieldsCache[sectionKey] = fields;
    fields.filter((f) => f.active !== false).forEach((field) => {
      const container = document.querySelector(`[data-slot="${sectionKey}:${field.slot}"] .fg`);
      if (!container) return;
      container.appendChild(buildDesignerFieldChip(field));
    });
  } catch (e) {
    toast('Could not load fields for this section: ' + e.message, 'err');
  }
  // Every pre-existing (hardcoded) field in this section also gets its own
  // Edit/Delete controls, not just Designer-added ones — the whole point
  // being a Designer never needs a separate tool to rename or hide a
  // built-in field either.
  try {
    const { overrides } = await getJSON('/api/custom-fields/overrides/section/' + encodeURIComponent(sectionKey) + '/draft');
    designerOverridesCache[sectionKey] = overrides || {};
  } catch (e) {
    designerOverridesCache[sectionKey] = {};
  }
  ensureHardcodedFieldControls(sectionKey, designerOverridesCache[sectionKey]);
  await loadDesignerSectionStatus(sectionKey);
}

// Injects a small Edit (rename) / Delete (hide) icon pair next to every
// pre-existing field's label within the section currently on screen — pure
// DOM manipulation, no changes to index.html's markup needed, so this
// automatically covers every field in every vendor section without having
// to hand-tag ~150 individual inputs. Custom (Designer-added) fields are
// skipped — they already get their own Edit/Delete via buildDesignerFieldChip
// above. Table-based fields (Navigation links, Business hours, API endpoint
// rows, test-account rows) are also skipped, same as they're excluded from
// server/fieldSlots.js's custom-field slots: a single row in a shared table
// isn't a good target for an independent rename/hide toggle. Safe to call
// repeatedly (e.g. every time the section re-renders after a save) — it
// only wires the Edit/Delete buttons once per field, then just refreshes
// the applied label/hidden state to match the latest draft overrides.
function ensureHardcodedFieldControls(sectionKey, overrides) {
  const view = document.querySelector('.view.active');
  if (!view) return;
  view.querySelectorAll('.card .fg > .f').forEach((f) => {
    if (f.classList.contains('cf-injected')) return; // Designer-added field — has its own chip controls
    const input = f.querySelector('input[id],select[id],textarea[id]');
    const label = f.querySelector(':scope > .flbl');
    if (!input || !label) return;
    const fieldId = input.id;
    if (!f.dataset.hcWired) {
      f.dataset.hcWired = '1';
      // Captured once, the very first time a Designer ever sees this field
      // in this browser session — always the true original wording, since
      // the label in the DOM hasn't had any override applied to it yet.
      label.dataset.origText = (label.firstChild && label.firstChild.nodeType === Node.TEXT_NODE) ? label.firstChild.textContent : label.textContent;
      const actions = document.createElement('span');
      actions.className = 'hc-actions';
      actions.innerHTML =
        '<button type="button" class="icon-btn brand hc-edit" title="Rename field"><i class="fas fa-pen"></i></button>' +
        '<button type="button" class="icon-btn danger hc-hide" title="Hide field"><i class="fas fa-eye-slash"></i></button>' +
        '<button type="button" class="icon-btn hc-restore" title="Unhide field" style="display:none;"><i class="fas fa-eye"></i></button>';
      label.after(actions);
      actions.querySelector('.hc-edit').onclick = () => openEditHardcodedField(sectionKey, fieldId, label.dataset.origText);
      actions.querySelector('.hc-hide').onclick = () => openHideFieldConfirm(sectionKey, fieldId, label.dataset.origText);
      actions.querySelector('.hc-restore').onclick = () => restoreHardcodedField(sectionKey, fieldId);
    }
    const ov = (overrides || {})[fieldId];
    const displayLabel = (ov && ov.label) || label.dataset.origText;
    if (label.firstChild && label.firstChild.nodeType === Node.TEXT_NODE) label.firstChild.textContent = displayLabel;
    f.classList.toggle('hc-hidden-draft', !!(ov && ov.hidden));
    const actions = f.querySelector('.hc-actions');
    if (actions) {
      actions.querySelector('.hc-edit').style.display = ov && ov.hidden ? 'none' : '';
      actions.querySelector('.hc-hide').style.display = ov && ov.hidden ? 'none' : '';
      actions.querySelector('.hc-restore').style.display = ov && ov.hidden ? '' : 'none';
    }
  });
}

// One "+ Add field" button per slot/card in this section — added once
// (guarded by a data attribute on the card) since renderDesignerSection can
// run more than once per page view (e.g. right after a save).
function ensureAddFieldButtons(sectionKey) {
  document.querySelectorAll(`[data-slot^="${sectionKey}:"]`).forEach((card) => {
    if (card.dataset.addFieldBtn) return;
    card.dataset.addFieldBtn = '1';
    const slot = card.getAttribute('data-slot').split(':')[1];
    const btn = document.createElement('button');
    btn.className = 'cp-btn designer-add-field-btn';
    btn.innerHTML = '<i class="fas fa-plus"></i> Add field';
    btn.onclick = () => openAddFieldModal(sectionKey, slot);
    card.appendChild(btn);
  });
}

// A field, shown to a Designer as a compact, clearly-not-a-real-input chip
// (label + type) with small Edit/Delete icon buttons — never rendered as an
// actual fillable input, so it can't be mistaken for a live form (there is
// no project loaded while signed in as a Designer anyway).
function buildDesignerFieldChip(field) {
  const wrap = document.createElement('div');
  wrap.className = 'f cf-injected designer-field-chip';
  wrap.setAttribute('data-section', field.sectionKey);
  wrap.setAttribute('data-cf-id', field.id);
  const typeLabel = field.type === 'dropdown' ? 'Dropdown' : field.type === 'date' ? 'Date' : 'Text';
  wrap.innerHTML = `
    <div class="dfc-row">
      <div class="dfc-main">
        <span class="dfc-label">${escHtml(field.label)}</span>
        <span class="dfc-meta">${typeLabel}${field.required ? ' · Required' : ''}</span>
      </div>
      <div class="dfc-actions">
        <button class="icon-btn brand" title="Edit field" data-cf-id="${field.id}" onclick="openEditFieldModal(this.dataset.cfId)"><i class="fas fa-pen"></i></button>
        <button class="icon-btn danger" title="Delete field" data-cf-id="${field.id}" data-field-label="${escHtml(field.label)}" onclick="openDeleteFieldConfirm(this.dataset.cfId, this.dataset.fieldLabel)"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  return wrap;
}

// Per-vendor draft badge + Publish button — lives in that section's own
// page header (id="cf-badge-<sectionKey>" / "cf-publish-<sectionKey>" in
// index.html), not in a separate admin page.
async function loadDesignerSectionStatus(sectionKey) {
  try {
    const status = await getJSON('/api/custom-fields/status/' + encodeURIComponent(sectionKey));
    designerSectionPending[sectionKey] = !!status.pending;
    const badge = document.getElementById('cf-badge-' + sectionKey);
    const meta = document.getElementById('cf-meta-' + sectionKey);
    if (badge) {
      badge.className = 'sbadge ' + (status.pending ? 'sb-draft' : 'sb-clean');
      badge.innerHTML = status.pending
        ? '<i class="fas fa-pen"></i> Draft changes — not published'
        : '<i class="fas fa-check"></i> Up to date';
    }
    if (meta) {
      meta.textContent = status.lastPublishedAt
        ? `Last published ${new Date(status.lastPublishedAt).toLocaleString()} by ${status.lastPublishedBy || 'unknown'}`
        : 'Never published yet';
    }
  } catch (e) {
    // Non-fatal — the fields themselves still rendered fine without this.
  }
}

// Publishes ONE vendor's draft — the single Publish button in that vendor's
// page header. Every other vendor's draft/published state is untouched.
async function publishSectionFields(sectionKey) {
  if (!designerSectionPending[sectionKey]) { toast('Nothing to publish here — no pending draft changes.', 'info'); return; }
  const name = SNAMES[SKEYS.indexOf(sectionKey)] || sectionKey;
  const ok = window.confirm(`Publish ${name} now?\n\nEvery added, renamed, retyped, and deleted field in this vendor's draft will become globally active on every project's forms immediately. This cannot be undone.`);
  if (!ok) return;
  const btn = document.getElementById('cf-publish-' + sectionKey);
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Publishing…'; }
  try {
    await postJSON('/api/custom-fields/publish/' + encodeURIComponent(sectionKey), {});
    toast(name + ' published — changes are now live for every project', 'ok');
    await loadDesignerSectionStatus(sectionKey);
  } catch (e) {
    toast('Could not publish: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

// ── ADD / EDIT FIELD MODAL ─────────────────────────────────────────────────
// One shared modal for both adding and editing a field. `fieldModalCtx`
// remembers which mode we're in and, for Add, which section+slot the field
// belongs to (implicit from which card's "Add field" button was clicked —
// there's no "place into" dropdown to fill in anymore, since the button is
// already sitting inside the right card).
let fieldModalCtx = null;

function toggleFmOptions(type) {
  document.getElementById('fm-options-f').style.display = type === 'dropdown' ? 'flex' : 'none';
}

// Shows/hides the type/options/required rows, which only make sense for a
// Designer-added custom field — a hardcoded field's type and requiredness
// are fixed by the real HTML input, so renaming one only ever shows the
// Field name row (see openEditHardcodedField below).
function setFieldModalKind(kind) {
  const isCustom = kind !== 'hc-edit';
  document.getElementById('fm-type-row').style.display = isCustom ? '' : 'none';
  document.getElementById('fm-required-row').style.display = isCustom ? '' : 'none';
  if (!isCustom) document.getElementById('fm-options-f').style.display = 'none';
}

function openAddFieldModal(sectionKey, slot) {
  fieldModalCtx = { mode: 'add', sectionKey, slot };
  setFieldModalKind('add');
  document.getElementById('fm-title').textContent = 'Add field';
  document.getElementById('fm-desc').textContent = "This field will appear inline on this vendor's intake form. It's saved as a draft until you Publish this vendor.";
  document.getElementById('fm-label').value = '';
  document.getElementById('fm-type').value = 'text';
  document.getElementById('fm-options').value = '';
  document.getElementById('fm-required').checked = false;
  toggleFmOptions('text');
  openModal('field-modal');
  setTimeout(() => document.getElementById('fm-label').focus(), 50);
}

function openEditFieldModal(fieldId) {
  const sectionKey = currentDesignerSectionKey;
  const field = (designerFieldsCache[sectionKey] || []).find((f) => f.id === fieldId);
  if (!field) { toast('Could not find that field — try refreshing.', 'err'); return; }
  fieldModalCtx = { mode: 'edit', fieldId, sectionKey };
  setFieldModalKind('edit');
  document.getElementById('fm-title').textContent = 'Edit field';
  document.getElementById('fm-desc').textContent = "This field will appear inline on this vendor's intake form. It's saved as a draft until you Publish this vendor.";
  document.getElementById('fm-label').value = field.label;
  document.getElementById('fm-type').value = field.type;
  document.getElementById('fm-options').value = (field.options || []).join(', ');
  document.getElementById('fm-required').checked = !!field.required;
  toggleFmOptions(field.type);
  openModal('field-modal');
  setTimeout(() => document.getElementById('fm-label').focus(), 50);
}

// Renaming a pre-existing (hardcoded) field — the same shared modal, but
// only its label is editable. Its type, required-ness, and Smartsheet
// column (keyed off fieldId, never the label) are all untouched by this.
function openEditHardcodedField(sectionKey, fieldId, origLabel) {
  const current = (designerOverridesCache[sectionKey] && designerOverridesCache[sectionKey][fieldId] && designerOverridesCache[sectionKey][fieldId].label) || origLabel;
  fieldModalCtx = { mode: 'hc-edit', sectionKey, fieldId, origLabel };
  setFieldModalKind('hc-edit');
  document.getElementById('fm-title').textContent = 'Rename field';
  document.getElementById('fm-desc').textContent = "Changes only this field's display label — its type, required-ness, and Smartsheet column are unaffected. Saved as a draft until you Publish this vendor.";
  document.getElementById('fm-label').value = current;
  openModal('field-modal');
  setTimeout(() => document.getElementById('fm-label').focus(), 50);
}

function closeFieldModal() {
  closeModal('field-modal');
  fieldModalCtx = null;
}

async function saveFieldModal() {
  if (!fieldModalCtx) return;
  const label = gv('fm-label');
  if (!label) { toast('Enter a field name first', 'warn'); return; }
  const btn = document.getElementById('fm-save-btn');
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Saving…';
  try {
    if (fieldModalCtx.mode === 'hc-edit') {
      const { sectionKey, fieldId, origLabel } = fieldModalCtx;
      // Typing the field's ORIGINAL wording back in clears the override
      // entirely rather than storing a no-op rename.
      const overrideLabel = label === origLabel ? '' : label;
      const r = await fetch(`/api/custom-fields/overrides/${encodeURIComponent(sectionKey)}/${encodeURIComponent(fieldId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: overrideLabel }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Update failed');
      toast('Field renamed (draft) — Publish to make it live', 'ok');
      closeFieldModal();
      await renderDesignerSection(sectionKey);
      return;
    }
    const type = gv('fm-type');
    const required = document.getElementById('fm-required').checked;
    const options = gv('fm-options').split(',').map((s) => s.trim()).filter(Boolean);
    if (fieldModalCtx.mode === 'add') {
      await postJSON('/api/custom-fields', { sectionKey: fieldModalCtx.sectionKey, slot: fieldModalCtx.slot, label, type, required, options });
      toast('Field added (draft) — Publish to make it live', 'ok');
    } else {
      const r = await fetch('/api/custom-fields/' + fieldModalCtx.fieldId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, type, required, options }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Update failed');
      toast('Field updated (draft) — Publish to make it live', 'ok');
    }
    const sectionKey = fieldModalCtx.sectionKey;
    closeFieldModal();
    await renderDesignerSection(sectionKey);
  } catch (e) {
    toast('Could not save field: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = orig;
  }
}

// ── DELETE / HIDE FIELD — styled confirmation modal (not a native window.confirm) ─
// Shared by two different actions: permanently deactivating a Designer-added
// custom field (kind: 'custom'), and hiding a pre-existing hardcoded field
// from the form (kind: 'hc') — both described accurately by the same
// "removed from the intake form, Smartsheet keeps the data" copy already in
// index.html's #delete-field-modal.
let deleteFieldCtx = null;
function openDeleteFieldConfirm(fieldId, label) {
  deleteFieldCtx = { fieldId, sectionKey: currentDesignerSectionKey, kind: 'custom' };
  document.getElementById('df-field-name').textContent = label || 'this field';
  openModal('delete-field-modal');
}
function openHideFieldConfirm(sectionKey, fieldId, label) {
  deleteFieldCtx = { fieldId, sectionKey, kind: 'hc' };
  document.getElementById('df-field-name').textContent = label || 'this field';
  openModal('delete-field-modal');
}
function closeDeleteFieldConfirm() {
  closeModal('delete-field-modal');
  deleteFieldCtx = null;
}
async function confirmDeleteField() {
  if (!deleteFieldCtx) return;
  const { fieldId, sectionKey, kind } = deleteFieldCtx;
  try {
    if (kind === 'hc') {
      const r = await fetch(`/api/custom-fields/overrides/${encodeURIComponent(sectionKey)}/${encodeURIComponent(fieldId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Update failed');
    } else {
      const r = await fetch('/api/custom-fields/' + fieldId, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Delete failed');
    }
    toast('Field removed from the intake form (draft) — Publish to make it live. Smartsheet data is kept either way.', 'ok');
    closeDeleteFieldConfirm();
    await renderDesignerSection(sectionKey);
  } catch (e) {
    toast('Could not remove field: ' + e.message, 'err');
  }
}

// Un-hides a hardcoded field that was previously marked hidden in the
// draft — a Designer can undo a hide without ever leaving the section.
async function restoreHardcodedField(sectionKey, fieldId) {
  try {
    const r = await fetch(`/api/custom-fields/overrides/${encodeURIComponent(sectionKey)}/${encodeURIComponent(fieldId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: false }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Update failed');
    toast('Field restored (draft) — Publish to make it live', 'ok');
    await renderDesignerSection(sectionKey);
  } catch (e) {
    toast('Could not restore field: ' + e.message, 'err');
  }
}

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, type) {
  const tc = document.getElementById('tc');
  const el = document.createElement('div');
  const cls = { ok: 'ts-ok', err: 'ts-err', info: 'ts-info', warn: 'ts-warn' };
  const ico = { ok: 'fa-check-circle', err: 'fa-times-circle', info: 'fa-info-circle', warn: 'fa-exclamation-triangle' };
  el.className = 'toast ' + (cls[type] || 'ts-info');
  el.innerHTML = `<i class="fas ${ico[type] || 'fa-info-circle'}"></i> ${msg}`;
  tc.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}
