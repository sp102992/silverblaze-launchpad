// Public, no-login section form. The token in the URL is the only thing
// tying this page to a project + section — it carries no Smartsheet
// credentials. Each section is rendered with the same cards/tables/widgets
// as the manager dashboard (public/app.js + index.html) so a vendor filling
// this out sees the identical layout, not a generic label+input list.
const params = new URLSearchParams(window.location.search);
const TOKEN = params.get('token');
let SCHEMA = null;
let EXISTING = {};

window.addEventListener('load', boot);

async function boot() {
  if (!TOKEN) return showError('This link is missing its access token.');
  try {
    const r = await fetch('/api/customer/' + encodeURIComponent(TOKEN));
    const data = await r.json();
    if (!r.ok) return showError(data.error || 'This link could not be loaded.');
    SCHEMA = data;
    EXISTING = data.data || {};
    render(data);
  } catch (e) {
    showError('Could not reach the server: ' + e.message);
  }
}

function showError(msg) {
  document.getElementById('cx-loading').style.display = 'none';
  const box = document.getElementById('cx-error');
  box.style.display = 'block';
  box.innerHTML = `<div style="color:var(--red);font-size:14px;"><i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>${msg}</div>`;
}

// Applies autocomplete="off" to every input/select/textarea rendered into a
// section, not just the credential-like ones that already had it by hand.
// This is purely about the BROWSER's own remembered-values feature on this
// device (separate from EXISTING/__provided, which is real saved data from
// the server) — a field a customer has never touched should always start
// blank, not populated with something Chrome/Edge autofilled from an
// unrelated form it has seen before.
function disableAutofillOnAllFields(root) {
  root.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
  });
}

// ── SMALL VALUE/MARKUP HELPERS ───────────────────────────────────────────
function val(id) { const v = EXISTING[id]; return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function checked(id) { return EXISTING[id] ? 'checked' : ''; }
function req() { return ' <span class="req">*</span>'; }
function pw(id, label, isRequired) {
  // autocomplete="new-password" (rather than "off", which modern browsers
  // largely ignore for password fields) stops the browser from offering to
  // fill this with a saved login — these are the vendor's own infrastructure
  // credentials, not a login to this site, and a browser-suggested
  // autofill here would be actively wrong. The field is masked (type=
  // password) with pw-toggle.js's click-to-reveal eye icon, same as every
  // other password field, but — same as every other field on this page —
  // it's pre-filled with the real saved value via value="${val(id)}" so a
  // returning customer/manager sees exactly what's on file, not a blank box.
  return `<div class="f"><label class="flbl">${label}${isRequired ? req() : ''}</label><input type="password" id="${id}" value="${val(id)}" autocomplete="new-password" placeholder="Enter value"/></div>`;
}

// ── PER-SECTION TEMPLATES — mirror the manager dashboard's markup exactly ──
const SECTION_BUILDERS = {
  business_info: (data) => `
    <div class="card" style="margin-top:0;" data-slot="business_info:poc">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-address-book"></i></div>Point of Contact</div>
      <div class="card-note">This should be the primary point of contact whom the Silverblaze team can reach out to for additional information related to this project.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Name${req()}</label><input id="biz_poc_name" value="${val('biz_poc_name')}" placeholder="Full name"/></div>
        <div class="f"><label class="flbl">Email${req()}</label><input id="biz_poc_email" value="${val('biz_poc_email')}" oninput="lv(this,'email')" placeholder="contact@utility.com"/><span id="h_biz_poc_email" class="fhint"></span></div>
      </div>
    </div>
    <div class="card" data-slot="business_info:contact">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-building"></i></div>Contact details</div>
      <div class="card-note">The following information will be used in the portal to configure the header, footer, and email-related settings — please provide the utility information that should be displayed on the portal.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Business name${req()}</label><input id="biz_name" value="${val('biz_name')}" placeholder="Clearwater Utility Corp"/></div>
        <div class="f"><label class="flbl">Phone number${req()}</label><input id="biz_phone" value="${val('biz_phone')}" placeholder="+1-800-555-0100"/></div>
        <div class="f sp2"><label class="flbl">Business address${req()}</label><input id="biz_address" value="${val('biz_address')}" placeholder="Street, City, Province / State, Postal Code"/></div>
        <div class="f"><label class="flbl">Fax <span class="optl">(optional)</span></label><input id="biz_fax" value="${val('biz_fax')}" placeholder="If applicable"/></div>
        <div class="f"><label class="flbl">Website URL${req()}</label><input id="biz_url" value="${val('biz_url')}" oninput="lv(this,'url')" placeholder="https://utility.com"/><span id="h_biz_url" class="fhint"></span></div>
        <div class="f"><label class="flbl">Customer service email${req()}</label><input id="biz_cs" value="${val('biz_cs')}" oninput="lv(this,'email')" placeholder="cs@utility.com"/><span id="h_biz_cs" class="fhint"></span></div>
        <div class="f"><label class="flbl">Support email${req()}</label><input id="biz_sup" value="${val('biz_sup')}" oninput="lv(this,'email')" placeholder="support@utility.com"/><span id="h_biz_sup" class="fhint"></span></div>
        <div class="f sp2"><label class="flbl">General inquiry email</label><input id="biz_gen" value="${val('biz_gen')}" oninput="lv(this,'email')" placeholder="info@utility.com"/><span id="h_biz_gen" class="fhint"></span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-link"></i></div>Navigation links <span style="font-size:11px;font-weight:400;color:var(--ink4);margin-left:6px;">max 5 recommended</span></div>
      <table class="et"><thead><tr><th style="width:120px;">Label</th><th>URL</th></tr></thead><tbody>
        ${[1, 2, 3, 4, 5].map((i) => `<tr><td class="et-l">Link ${i}</td><td style="display:flex;gap:5px;"><input id="nav${i}l" value="${val('nav' + i + 'l')}" placeholder="Label" style="width:140px;"/><input id="nav${i}u" value="${val('nav' + i + 'u')}" placeholder="https://..."/></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:12px;"><div class="card-ico"><i class="fas fa-clock"></i></div>Business hours</div>
      <table class="ht"><tbody>
        ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
          const id = 'hrs_' + day.slice(0, 3).toLowerCase();
          return `<tr><td>${day}</td><td><input id="${id}" value="${val(id)}" placeholder="${day === 'Saturday' || day === 'Sunday' ? 'Closed' : '8:00 AM – 5:00 PM'}"/></td></tr>`;
        }).join('')}
      </tbody></table>
    </div>
    ${data.emailInstructions ? `<div class="card">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-envelope-open-text"></i></div>Please email us these assets</div>
      ${data.emailInstructions.map((i) => `<div class="email-note"><i class="fas fa-paperclip"></i><div><b>${i.label}</b> — ${i.detail}</div></div>`).join('')}
    </div>` : ''}
    <div class="card" data-slot="business_info:colors">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-palette"></i></div>Brand colours</div>
      <div class="fg">
        <div class="f"><label class="flbl">Primary colour HEX${req()}</label>
          <div style="display:flex;gap:8px;align-items:center;"><input id="brand_hex1" value="${val('brand_hex1')}" placeholder="#0055A4" style="flex:1;"/><input type="color" id="brand_pick1" value="${EXISTING.brand_hex1 || '#0055A4'}" oninput="document.getElementById('brand_hex1').value=this.value" style="width:36px;height:36px;padding:2px;cursor:pointer;border:1.5px solid var(--bdr2);border-radius:var(--r8);"/></div>
        </div>
        <div class="f"><label class="flbl">Secondary / accent colour HEX <span class="optl">(if applicable)</span></label>
          <div style="display:flex;gap:8px;align-items:center;"><input id="brand_hex2" value="${val('brand_hex2')}" placeholder="#00A3E0" style="flex:1;"/><input type="color" id="brand_pick2" value="${EXISTING.brand_hex2 || '#534AB7'}" oninput="document.getElementById('brand_hex2').value=this.value" style="width:36px;height:36px;padding:2px;cursor:pointer;border:1.5px solid var(--bdr2);border-radius:var(--r8);"/></div>
        </div>
        <div class="f sp2"><label class="flbl">Additional colour HEX codes</label><input id="brand_other" value="${val('brand_other')}" placeholder="#333333, #F5F5F5 — comma separated"/></div>
      </div>
    </div>`,

  cis_integration: (data) => `
    <div class="card" style="margin-top:0;" data-slot="cis_integration:poc">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-address-book"></i></div>Point of Contact</div>
      <div class="card-note">This should be the primary point of contact whom the Silverblaze team can reach out to for additional information related to this project.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Name</label><input id="cis_poc_name" value="${val('cis_poc_name')}" placeholder="Full name"/></div>
        <div class="f"><label class="flbl">Email</label><input id="cis_poc_email" value="${val('cis_poc_email')}" oninput="lv(this,'email')" placeholder="contact@cis-vendor.com"/><span id="h_cis_poc_email" class="fhint"></span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-plug"></i></div>API endpoints</div>
      <div class="card-note">The following information will be used to connect the portal to your CIS system for customer account lookups and billing data — please provide the endpoint and credential details for each environment you have available.</div>
      <table class="et"><thead><tr><th style="width:110px;">Environment</th><th>API endpoint URL</th><th style="width:130px;">Username</th><th style="width:150px;">Password / token</th></tr></thead><tbody>
        <tr><td class="et-l">Development</td><td><input id="cis_dev_url" value="${val('cis_dev_url')}" placeholder="https://dev.cis.../api"/></td><td><input id="cis_dev_user" value="${val('cis_dev_user')}" placeholder="username"/></td><td><input id="cis_dev_pass" type="password" value="${val('cis_dev_pass')}" placeholder="••••••"/></td></tr>
        <tr><td class="et-l">UAT</td><td><input id="cis_uat_url" value="${val('cis_uat_url')}" placeholder="https://uat.cis.../api"/></td><td><input id="cis_uat_user" value="${val('cis_uat_user')}" placeholder="username"/></td><td><input id="cis_uat_pass" type="password" value="${val('cis_uat_pass')}" placeholder="••••••"/></td></tr>
        <tr><td class="et-l">Production</td><td><input id="cis_prod_url" value="${val('cis_prod_url')}" placeholder="https://cis.../api"/></td><td><input id="cis_prod_user" value="${val('cis_prod_user')}" placeholder="username"/></td><td><input id="cis_prod_pass" type="password" value="${val('cis_prod_pass')}" placeholder="••••••"/></td></tr>
      </tbody></table>
    </div>
    <div class="card" data-slot="cis_integration:services">
      <div class="card-title" style="margin-bottom:12px;"><div class="card-ico"><i class="fas fa-bolt"></i></div>Utility service types</div>
      <div class="cbg">
        <label class="cbi"><input type="checkbox" id="cis_elec" ${checked('cis_elec')}/> Electricity</label>
        <label class="cbi"><input type="checkbox" id="cis_water" ${checked('cis_water')}/> Water</label>
        <label class="cbi"><input type="checkbox" id="cis_gas" ${checked('cis_gas')}/> Gas</label>
        <label class="cbi"><input type="checkbox" id="cis_other_c" ${checked('cis_other_c')}/> Other</label>
      </div>
      <div class="f" style="margin-top:12px;"><label class="flbl">Other description</label><input id="cis_other_desc" value="${val('cis_other_desc')}" placeholder="Describe if Other selected"/></div>
    </div>
    <div class="card" data-slot="cis_integration:test_accounts">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-user-check"></i></div>Test accounts</div>
      <table class="et"><thead><tr><th>Service type</th><th>Account number</th><th>Notes</th></tr></thead><tbody>
        ${[1, 2, 3].map((i) => `<tr><td><input id="cis_t${i}t" value="${val('cis_t' + i + 't')}" placeholder="e.g. Electricity"/></td><td><input id="cis_t${i}a" value="${val('cis_t' + i + 'a')}" placeholder="Account number"/></td><td><input id="cis_t${i}n" value="${val('cis_t' + i + 'n')}" placeholder="Notes"/></td></tr>`).join('')}
      </tbody></table>
      <div class="fg" style="margin-top:12px;">
        <div class="f sp2"><label class="flbl">Other Service Type Account <span class="optl">(optional)</span></label><input id="cis_t4a" value="${val('cis_t4a')}" placeholder="Account number for a service type not listed above"/></div>
      </div>
    </div>
    <div class="card" data-slot="cis_integration:account_codes">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-tags"></i></div>Account type codes</div>
      <table class="et"><thead><tr><th>Type</th><th>Code</th><th>Description</th></tr></thead><tbody>
        <tr><td class="et-l">Metered</td><td><input id="cis_m_code" value="${val('cis_m_code')}" placeholder="M"/></td><td><input id="cis_m_desc" value="${val('cis_m_desc')}" placeholder="Description"/></td></tr>
        <tr><td class="et-l">Non-metered</td><td><input id="cis_nm_code" value="${val('cis_nm_code')}" placeholder="NM"/></td><td><input id="cis_nm_desc" value="${val('cis_nm_desc')}" placeholder="Description"/></td></tr>
        <tr><td class="et-l">Other</td><td><input id="cis_o_code" value="${val('cis_o_code')}" placeholder="Code"/></td><td><input id="cis_o_desc" value="${val('cis_o_desc')}" placeholder="Description"/></td></tr>
      </tbody></table>
    </div>
    ${data.hostingType === 'SILVERBLAZE_AZURE' ? `<div class="card">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-shield-halved"></i></div>Vendor IP whitelisting <span class="tag-opt"><i class="fas fa-cloud"></i> Silverblaze Azure Hosted</span></div>
      <div class="card-note">This environment is Silverblaze Azure Hosted, so your team and Silverblaze each need to whitelist the other's IP addresses.</div>
      <div class="fg">
        <div class="f sp2"><label class="flbl">Silverblaze IP(s) for your team to whitelist</label><input id="cis_veip_sb_ips" value="${val('cis_veip_sb_ips')}" placeholder="Comma-separated if more than one"/></div>
        <div class="f sp2"><label class="flbl">Your IP(s) for Silverblaze to whitelist</label><input id="cis_veip_vendor_ips" value="${val('cis_veip_vendor_ips')}" placeholder="Comma-separated if more than one"/></div>
      </div>
    </div>` : ''}`,

  payment_vendor: (data) => `
    <div class="card" style="margin-top:0;" data-slot="payment_vendor:poc">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-address-card"></i></div>Point of Contact</div>
      <div class="card-note">This should be the primary point of contact whom the Silverblaze team can reach out to for additional information related to this project.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Contact person</label><input id="pay_contact" value="${val('pay_contact')}" autocomplete="off" placeholder="Full name"/></div>
        <div class="f"><label class="flbl">Contact email</label><input id="pay_email" value="${val('pay_email')}" autocomplete="off" oninput="lv(this,'email')" placeholder="contact@provider.com"/><span id="h_pay_email" class="fhint"></span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-credit-card"></i></div>Payment vendor type</div>
      <div class="card-note">The following information will be used to configure how customers make payments through the portal — please select your payment vendor and provide the corresponding integration details below.</div>
      <div class="fg fg1">
        <div class="f"><label class="flbl">Select vendor${req()}</label>
          <select id="pay_vendor_type" onchange="togglePayVendor(this.value)">
            <option value="">Select…</option>
            ${(data.vendorTypes || []).map((v) => `<option value="${v}" ${EXISTING.pay_vendor_type === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="card pay-vendor-block" id="pay-block-Paymentus" style="display:none;">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-building-columns"></i></div>Paymentus details</div>
      <div class="fg">
        <div class="f"><label class="flbl">TLA${req()}</label><input id="pay_tla" value="${val('pay_tla')}" placeholder="3-letter Paymentus vendor identifier"/></div>
        <div class="f sp2"><label class="flbl">Additional comments</label><textarea id="pay_paymentus_comment" placeholder="Anything else Paymentus-specific">${val('pay_paymentus_comment')}</textarea></div>
      </div>
    </div>
    <div class="card pay-vendor-block" id="pay-block-InvoiceCloud" style="display:none;">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-cloud"></i></div>Invoice Cloud details</div>
      <div class="fg">
        ${pw('pay_ic_biller_guid', 'Biller GUID', true)}
        ${pw('pay_ic_webservice_key', 'Web Service Key', true)}
        ${pw('pay_ic_integration_guid', 'Integration GUID', true)}
      </div>
      <div class="sep">Test accounts <span style="font-size:11px;font-weight:400;color:var(--ink4);">minimum 5, different services — Invoice Cloud only</span></div>
      <table class="et"><thead><tr><th>Service type</th><th>Account number</th><th>Notes</th></tr></thead><tbody>
        ${[1, 2, 3, 4, 5].map((i) => `<tr><td><input id="pay_t${i}t" value="${val('pay_t' + i + 't')}" placeholder="${i <= 3 ? 'e.g. service ' + i : 'Service type'}"/></td><td><input id="pay_t${i}a" value="${val('pay_t' + i + 'a')}" placeholder="Account number"/></td><td><input id="pay_t${i}n" value="${val('pay_t' + i + 'n')}" placeholder="Notes"/></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="card pay-vendor-block" id="pay-block-Other" style="display:none;">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-comment-dots"></i></div>Other vendor details</div>
      <div class="fg fg1">
        <div class="f"><label class="flbl">Describe your payment vendor / integration</label><textarea id="pay_other_comment" placeholder="Add everything relevant here — endpoints, credentials, contacts, anything else we should know">${val('pay_other_comment')}</textarea></div>
      </div>
    </div>
    <div class="card" data-slot="payment_vendor:onetime">
      <div class="card-title" style="margin-bottom:6px;"><div class="card-ico"><i class="fas fa-link"></i></div>One-time payment</div>
      <div class="fg fg1"><div class="f"><label class="flbl">One-time payment URL</label><input id="pay_onetime_url" value="${val('pay_onetime_url')}" oninput="lv(this,'url')" placeholder="https://..."/><span id="h_pay_onetime_url" class="fhint"></span></div></div>
    </div>
    <div class="card" data-slot="payment_vendor:comments">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-comment"></i></div>Additional comments</div>
      <div class="fg fg1"><div class="f"><textarea id="pay_general_comment" placeholder="Anything else about this payment vendor integration">${val('pay_general_comment')}</textarea></div></div>
    </div>
    ${data.hostingType === 'SILVERBLAZE_AZURE' ? `<div class="card">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-shield-halved"></i></div>Vendor IP whitelisting <span class="tag-opt"><i class="fas fa-cloud"></i> Silverblaze Azure Hosted</span></div>
      <div class="card-note">This environment is Silverblaze Azure Hosted, so your team and Silverblaze each need to whitelist the other's IP addresses.</div>
      <div class="fg">
        <div class="f sp2"><label class="flbl">Silverblaze IP(s) for your team to whitelist</label><input id="pay_veip_sb_ips" value="${val('pay_veip_sb_ips')}" placeholder="Comma-separated if more than one"/></div>
        <div class="f sp2"><label class="flbl">Your IP(s) for Silverblaze to whitelist</label><input id="pay_veip_vendor_ips" value="${val('pay_veip_vendor_ips')}" placeholder="Comma-separated if more than one"/></div>
      </div>
    </div>` : ''}`,

  smtp_config: (data) => `
    <div class="card" style="margin-top:0;" data-slot="smtp_config:poc">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-address-book"></i></div>Point of Contact</div>
      <div class="card-note">This should be the primary point of contact whom the Silverblaze team can reach out to for additional information related to this project.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Name</label><input id="smtp_poc_name" value="${val('smtp_poc_name')}" placeholder="Full name"/></div>
        <div class="f"><label class="flbl">Email</label><input id="smtp_poc_email" value="${val('smtp_poc_email')}" oninput="lv(this,'email')" placeholder="contact@utility.com"/><span id="h_smtp_poc_email" class="fhint"></span></div>
      </div>
    </div>
    <div class="card" data-slot="smtp_config:server">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-envelope"></i></div>Server settings</div>
      <div class="card-note">The following information will be used to configure the portal's outgoing email delivery — e.g. registration confirmations, password resets, and other automated notifications.</div>
      <div class="fg">
        <div class="f"><label class="flbl">SMTP host${req()}</label><input id="smtp_host" value="${val('smtp_host')}" autocomplete="off" placeholder="smtp.sendgrid.net"/></div>
        <div class="f"><label class="flbl">Port${req()}</label><input id="smtp_port" type="number" value="${val('smtp_port')}" autocomplete="off" placeholder="587"/></div>
        <div class="f"><label class="flbl">Connection security${req()}</label><select id="smtp_sec"><option value="">Select…</option>${['SSL', 'TLS', 'STARTTLS', 'None'].map((o) => `<option ${EXISTING.smtp_sec === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="f"><label class="flbl">Requires auth</label><select id="smtp_auth"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.smtp_auth === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      </div>
      <div class="sep">Authentication details</div>
      <div class="fg">
        <div class="f"><label class="flbl">Username${req()}</label><input id="smtp_user" value="${val('smtp_user')}" autocomplete="off" placeholder="noreply@domain.com"/></div>
        ${pw('smtp_pass', 'Password', true)}
      </div>
      <div class="sep">Sender details</div>
      <div class="fg">
        <div class="f"><label class="flbl">From email${req()}</label><input id="smtp_from" value="${val('smtp_from')}" autocomplete="off" oninput="lv(this,'email')" placeholder="noreply@domain.com"/><span id="h_smtp_from" class="fhint"></span></div>
        <div class="f"><label class="flbl">From display name${req()}</label><input id="smtp_from_name" value="${val('smtp_from_name')}" autocomplete="off" placeholder="Your Company Name"/></div>
      </div>
    </div>
    ${data.hostingType === 'SILVERBLAZE_AZURE' ? `<div class="card">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-shield-halved"></i></div>Vendor IP whitelisting <span class="tag-opt"><i class="fas fa-cloud"></i> Silverblaze Azure Hosted</span></div>
      <div class="card-note">This environment is Silverblaze Azure Hosted.</div>
      <div class="fg">
        <div class="f sp2"><label class="flbl">Silverblaze IPs That Need to Be Whitelisted</label><input id="smtp_veip_sb_ips" value="${val('smtp_veip_sb_ips')}" placeholder="Comma-separated if more than one"/></div>
      </div>
    </div>` : ''}`,

  ansible_inventory: (data) => `
    ${data.hostingType === 'SILVERBLAZE_AZURE' ? `<div class="section-na-banner" style="margin-top:0;"><i class="fas fa-circle-info"></i><div>Not applicable — this environment is <b>Silverblaze Azure Hosted</b>, so Ansible Inventory isn't required. Fields below are disabled.</div></div>` : ''}
    <div class="card ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'section-disabled' : ''}" style="margin-top:${data.hostingType === 'SILVERBLAZE_AZURE' ? '0' : '0'};" id="ansible-cx-content" data-slot="ansible_inventory:server">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-server"></i></div>Server</div>
      <div class="card-note">The following information will be used to configure server access and installation settings for hosting the portal.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Public IP${req()}</label><input id="ans_ip" value="${val('ans_ip')}" oninput="lv(this,'ip')" placeholder="203.0.113.10" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/><span id="h_ans_ip" class="fhint"></span><span class="fnote">Must be whitelisted by SilverBlaze.</span></div>
        <div class="f"><label class="flbl">Host URL${req()}</label><input id="ans_host" value="${val('ans_host')}" oninput="lv(this,'url')" placeholder="https://portal.utility.com" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/><span id="h_ans_host" class="fhint"></span></div>
      </div>
      <div class="sep">Portal database</div>
      <div class="fg fg3">
        <div class="f"><label class="flbl">SQL instance${req()}</label><input id="ans_sql" value="${val('ans_sql')}" placeholder="SERVER\\INSTANCE" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/></div>
        <div class="f"><label class="flbl">DB name${req()}</label><input id="ans_pdb" value="${val('ans_pdb')}" placeholder="PortalDB" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/></div>
        <div class="f"><label class="flbl">DB username${req()}</label><input id="ans_puser" value="${val('ans_puser')}" autocomplete="off" placeholder="db_user" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/></div>
        <div class="f sp3">${pw('ans_ppass', 'DB password', true)}</div>
      </div>
      <div class="sep">SmartForms database <span class="optl" style="font-weight:400;margin-left:6px;">Apollo forms only</span></div>
      <div class="fg fg3">
        <div class="f"><label class="flbl">DB name</label><input id="ans_fdb" value="${val('ans_fdb')}" placeholder="SmartFormsDB" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/></div>
        <div class="f"><label class="flbl">DB username</label><input id="ans_fuser" value="${val('ans_fuser')}" autocomplete="off" placeholder="forms_db_user" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/></div>
        ${pw('ans_fpass', 'DB password', false)}
      </div>
      <div class="sep">Installation Drives</div>
      <div class="card-note"><i class="fas fa-circle-info"></i> Please provide the drive information below as confirmed and agreed upon by the hosting team. The information provided in these fields will be considered the hosting team's written confirmation of the drive preferences for the Silverblaze installation.</div>
      <div class="fg">
        <div class="f"><label class="flbl">Preferred Installation Drive${req()}</label><input id="ans_install_drive" value="${val('ans_install_drive')}" placeholder="C:, D:, E:, etc." ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/><span class="fnote">Drive letter confirmed by the hosting team for the Silverblaze portal installation.</span></div>
        <div class="f"><label class="flbl">Temporary Storage Drive${req()}</label><input id="ans_temp_drive" value="${val('ans_temp_drive')}" placeholder="C:, D:, E:, etc." ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/><span class="fnote">Drive letter confirmed by the hosting team for temporary storage during the installation process.</span></div>
      </div>
      <div class="sep">Silverblaze IP whitelisting</div>
      <div class="fg">
        <div class="f sp2"><label class="flbl">Silverblaze IP(s) needing whitelisting by client/vendor</label><input id="ans_sb_whitelist_ips" value="${val('ans_sb_whitelist_ips')}" placeholder="Comma-separated if more than one" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}/><span class="fnote">Provided by the Silverblaze team — your team is responsible for whitelisting these.</span></div>
      </div>
      <div class="sep">Additional comments</div>
      <div class="fg fg1"><div class="f"><textarea id="ans_notes" placeholder="Anything else about this server/hosting setup" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'disabled' : ''}>${val('ans_notes')}</textarea></div></div>
    </div>`,

  smart_meter: (data) => `
    <div class="tgl-row">
      <label class="tgl-sw"><input type="checkbox" id="sm_on" ${checked('sm_on')} onchange="toggleSM(this.checked)"/><span class="tgl-track"></span></label>
      <div><div class="tgl-main">Are you offering smart meter integration?</div><div class="tgl-sub">Toggle on to reveal all fields.</div></div>
    </div>
    <div id="sm-fields" style="display:none;">
      <div class="card" data-slot="smart_meter:poc">
        <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-address-book"></i></div>Point of Contact</div>
        <div class="card-note">This should be the primary point of contact whom the Silverblaze team can reach out to for additional information related to this project.</div>
        <div class="fg">
          <div class="f"><label class="flbl">Name</label><input id="sm_poc_name" value="${val('sm_poc_name')}" placeholder="Full name"/></div>
          <div class="f"><label class="flbl">Email</label><input id="sm_poc_email" value="${val('sm_poc_email')}" oninput="lv(this,'email')" placeholder="contact@provider.com"/><span id="h_sm_poc_email" class="fhint"></span></div>
        </div>
      </div>
      <div class="card" data-slot="smart_meter:provider">
        <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-tachometer-alt"></i></div>Provider details</div>
        <div class="card-note">The following information will be used to connect the portal to your smart meter data provider.</div>
        <div class="fg">
          <div class="f"><label class="flbl">Provider name${req()}</label><input id="sm_prov" value="${val('sm_prov')}" placeholder="Provider name"/></div>
          <div class="f"><label class="flbl">Contact person</label><input id="sm_contact" value="${val('sm_contact')}" placeholder="Full name"/></div>
          <div class="f"><label class="flbl">Contact email</label><input id="sm_cemail" value="${val('sm_cemail')}" oninput="lv(this,'email')" placeholder="contact@provider.com"/><span id="h_sm_cemail" class="fhint"></span></div>
          <div class="f"><label class="flbl">Contact phone</label><input id="sm_cphone" value="${val('sm_cphone')}" placeholder="+1-800-..."/></div>
          <div class="f"><label class="flbl">Technical support contact</label><input id="sm_tech" value="${val('sm_tech')}" placeholder="Name if different"/></div>
          <div class="f"><label class="flbl">Technical support email</label><input id="sm_temail" value="${val('sm_temail')}" oninput="lv(this,'email')" placeholder="tech@provider.com"/><span id="h_sm_temail" class="fhint"></span></div>
        </div>
      </div>
      <div class="card" data-slot="smart_meter:system">
        <div class="card-title" style="margin-bottom:14px;"><div class="card-ico"><i class="fas fa-cogs"></i></div>System &amp; integration details</div>
        <div class="fg">
          <div class="f"><label class="flbl">Platform name</label><input id="sm_platform" value="${val('sm_platform')}" placeholder="e.g. Itron AMI"/></div>
          <div class="f"><label class="flbl">API available</label><select id="sm_api"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.sm_api === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">API base URL</label><input id="sm_api_url" value="${val('sm_api_url')}" oninput="lv(this,'url')" placeholder="https://api.smartmeter.com/v1"/><span id="h_sm_api_url" class="fhint"></span></div>
          <div class="f"><label class="flbl">Auth method</label><select id="sm_auth_m"><option value="">Select…</option>${['API Key', 'OAuth 2.0', 'Basic Auth', 'Other'].map((o) => `<option ${EXISTING.sm_auth_m === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">IP whitelisting required</label><select id="sm_wl"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.sm_wl === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">Whitelisted IPs</label><input id="sm_wl_ips" value="${val('sm_wl_ips')}" placeholder="IP addresses"/></div>
          <div class="f sp2"><label class="flbl">Available data types</label><input id="sm_data" value="${val('sm_data')}" placeholder="Usage, Consumption, Billing…"/></div>
          <div class="f"><label class="flbl">Data frequency</label><select id="sm_freq"><option value="">Select…</option>${['Real-time', 'Hourly', 'Daily', 'Weekly', 'Other'].map((o) => `<option ${EXISTING.sm_freq === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">Historical data available</label><select id="sm_hist"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.sm_hist === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">Historical duration</label><input id="sm_hist_dur" value="${val('sm_hist_dur')}" placeholder="e.g. 2 years"/></div>
          <div class="f"><label class="flbl">Supported meter types</label><input id="sm_meters" value="${val('sm_meters')}" placeholder="Electric, Gas, Water"/></div>
          <div class="f"><label class="flbl">Account linking identifier</label><input id="sm_link" value="${val('sm_link')}" placeholder="Account / Meter Number"/></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px;"><div class="card-ico"><i class="fas fa-file-export"></i></div>File-based integration <span style="font-size:11px;font-weight:400;color:var(--ink4);margin-left:6px;">if applicable</span></div>
        <div class="fg">
          <div class="f"><label class="flbl">Transfer method</label><select id="sm_ftm"><option value="">Select…</option>${['SFTP', 'FTP', 'Other'].map((o) => `<option ${EXISTING.sm_ftm === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">File format</label><select id="sm_ffmt"><option value="">Select…</option>${['CSV', 'XML', 'JSON', 'Other'].map((o) => `<option ${EXISTING.sm_ffmt === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">File naming convention</label><input id="sm_fname" value="${val('sm_fname')}" placeholder="usage_YYYYMMDD.csv"/></div>
          <div class="f"><label class="flbl">Delivery frequency</label><input id="sm_ffreq" value="${val('sm_ffreq')}" placeholder="Daily at 2:00 AM"/></div>
          <div class="f"><label class="flbl">Sample file provided</label><select id="sm_fsample"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.sm_fsample === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">Sample file URL</label><input id="sm_furl" value="${val('sm_furl')}" oninput="lv(this,'url')" placeholder="https://..."/><span id="h_sm_furl" class="fhint"></span></div>
        </div>
      </div>
      <div class="card"><div class="card-title" style="margin-bottom:12px;"><div class="card-ico"><i class="fas fa-comment-dots"></i></div>Additional notes</div><div class="f"><label class="flbl">Additional details</label><textarea id="sm_notes" placeholder="Any extra requirements…">${val('sm_notes')}</textarea></div></div>
      ${data.hostingType === 'SILVERBLAZE_AZURE' ? `<div class="card">
        <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-shield-halved"></i></div>Vendor IP whitelisting <span class="tag-opt"><i class="fas fa-cloud"></i> Silverblaze Azure Hosted</span></div>
        <div class="card-note">This environment is Silverblaze Azure Hosted.</div>
        <div class="fg">
          <div class="f sp2"><label class="flbl">Silverblaze IPs That Need to Be Whitelisted</label><input id="sm_veip_sb_ips" value="${val('sm_veip_sb_ips')}" placeholder="Comma-separated if more than one"/></div>
        </div>
      </div>` : ''}
    </div>
    <div id="sm-skip-msg" style="display:${EXISTING.sm_on ? 'none' : 'block'};">
      <div class="card" style="text-align:center;padding:32px 20px;">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--greenl);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-check" style="color:var(--green);font-size:20px;"></i></div>
        <div style="font-size:15px;font-weight:600;margin-bottom:4px;">Smart meter skipped</div>
        <div style="font-size:13px;color:var(--ink3);">Toggle on above if needed.</div>
      </div>
    </div>`,

  // Professional Services -> PM handoff info. Mirrors index.html's sec-14
  // exactly (minus the manager-only "Change it" hosting-gate link, which has
  // no equivalent on this public, token-based page).
  pm_info: (data) => `
    <div class="card" style="margin-top:0;" data-slot="pm_info:customer_hosting">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-user-tie"></i></div>Customer &amp; hosting</div>
      <div class="fg">
        <div class="f"><label class="flbl">Environment hosting type</label>
          <select id="env_hosting_type" disabled>
            <option value="">Not set</option>
            <option value="SILVERBLAZE_AZURE" ${data.hostingType === 'SILVERBLAZE_AZURE' ? 'selected' : ''}>Silverblaze Azure Hosted</option>
            <option value="CLIENT_BU_HOSTED" ${data.hostingType === 'CLIENT_BU_HOSTED' ? 'selected' : ''}>Client/BU Hosted Server</option>
          </select>
          <span class="fnote">Set by the project's Professional Services team.</span>
        </div>
        <div class="f"><label class="flbl">Business Unit vs Direct Customer</label>
          <select id="pm_customer_type" onchange="togglePmCustomerType(this.value)"><option value="">Select…</option>${['Business Unit', 'Direct Customer'].map((o) => `<option ${EXISTING.pm_customer_type === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>
        <div class="f" id="pm-bu-name-f" style="display:${EXISTING.pm_customer_type === 'Business Unit' ? 'flex' : 'none'};"><label class="flbl">Business Unit name</label><input id="pm_bu_name" value="${val('pm_bu_name')}" placeholder="Business Unit name"/></div>
      </div>
    </div>
    <div class="card" data-slot="pm_info:scope_effort">
      <div class="card-title" style="margin-bottom:10px;"><div class="card-ico"><i class="fas fa-file-signature"></i></div>Scope &amp; effort</div>
      <div class="fg">
        <div class="f sp2"><label class="flbl">Signed SOW link</label><input id="pm_sow_link" value="${val('pm_sow_link')}" oninput="lv(this,'url')" placeholder="https://..."/><span id="h_pm_sow_link" class="fhint"></span></div>
        <div class="f"><label class="flbl">Estimated effort (PS team hours)</label><input id="pm_effort_hours" type="number" value="${val('pm_effort_hours')}" placeholder="e.g. 240"/></div>
        <div class="f"><label class="flbl">Project kickoff date</label><input id="pm_kickoff_date" type="date" value="${val('pm_kickoff_date')}"/></div>
        <div class="f"><label class="flbl">Project UAT estimate</label><input id="pm_uat_estimate" type="date" value="${val('pm_uat_estimate')}"/></div>
        <div class="f"><label class="flbl">Project go-live estimate</label><input id="pm_golive_estimate" type="date" value="${val('pm_golive_estimate')}"/></div>
        <div class="f"><label class="flbl">Installation type</label><select id="pm_install_type"><option value="">Select…</option>${['Brand New', 'Upgrade'].map((o) => `<option ${EXISTING.pm_install_type === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="f"><label class="flbl">Portal history</label><select id="pm_portal_history"><option value="">Select…</option>${['SB Portal', 'Legacy Portal', 'No Portal'].map((o) => `<option ${EXISTING.pm_portal_history === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="f"><label class="flbl">Bill presentment</label><input id="pm_bill_presentment" value="${val('pm_bill_presentment')}" placeholder="Who provides the eBill?"/></div>
      </div>
      <div id="pm-bu-block" style="display:${EXISTING.pm_customer_type === 'Business Unit' ? 'block' : 'none'};">
        <div class="sep">Business Unit customer</div>
        <div class="fg"><div class="f"><label class="flbl">User migration required</label><select id="pm_user_migration"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.pm_user_migration === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      </div>
      <div id="pm-dc-block" style="display:${EXISTING.pm_customer_type === 'Direct Customer' ? 'block' : 'none'};">
        <div class="sep">Direct customer</div>
        <div class="fg">
          <div class="f"><label class="flbl">Integration type</label><select id="pm_integration_type"><option value="">Select…</option>${['Flat File', 'Custom API'].map((o) => `<option ${EXISTING.pm_integration_type === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="f"><label class="flbl">Data migration required</label><select id="pm_data_migration"><option value="">Select…</option>${['Yes', 'No'].map((o) => `<option ${EXISTING.pm_data_migration === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div>
      </div>
    </div>
    <div class="card" data-slot="pm_info:risk">
      <div class="card-title" style="margin-bottom:8px;"><div class="card-ico"><i class="fas fa-triangle-exclamation"></i></div>Risk log</div>
      <div class="fg fg1"><div class="f"><textarea id="pm_risk_log" placeholder="Known risks for this project">${val('pm_risk_log')}</textarea></div></div>
    </div>`,
};

// Manager-created custom fields (server/customFields.js) for this section —
// injected directly INTO the existing card they were placed into (via the
// field's `slot`), the same field-slot architecture app.js uses for the
// manager dashboard — never a separate bolted-on "Additional fields" card.
// Each field's stable id is used as the input id so collect()/toCells() pick
// it up with no special-casing needed.
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildCustomFieldEl(field, value) {
  const reqMark = field.required ? ' <span class="req">*</span>' : '';
  let html;
  if (field.type === 'dropdown') {
    const opts = (field.options || []).map((o) => `<option value="${escAttr(o)}" ${value === o ? 'selected' : ''}>${escAttr(o)}</option>`).join('');
    html = `<div class="f cf-injected" data-cf-id="${field.id}"><label class="flbl">${escAttr(field.label)}${reqMark}</label><select id="${field.id}"><option value="">Select…</option>${opts}</select></div>`;
  } else if (field.type === 'date') {
    html = `<div class="f cf-injected" data-cf-id="${field.id}"><label class="flbl">${escAttr(field.label)}${reqMark}</label><input type="date" id="${field.id}" value="${escAttr(value)}"/></div>`;
  } else {
    html = `<div class="f cf-injected" data-cf-id="${field.id}"><label class="flbl">${escAttr(field.label)}${reqMark}</label><input id="${field.id}" value="${escAttr(value)}" placeholder="${escAttr(field.label)}"/></div>`;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function injectCustomFields(sectionKey, fields) {
  (fields || []).forEach((f) => {
    let host = document.querySelector(`[data-slot="${sectionKey}:${f.slot}"] .fg`);
    if (!host) host = document.querySelector('#cx-fields .card .fg'); // fallback: legacy/unknown slot
    if (!host) return;
    host.appendChild(buildCustomFieldEl(f, val(f.id)));
  });
}

// Applies a Designer's PUBLISHED rename/hide overrides to this section's
// pre-existing (hardcoded) fields — same logic as the manager dashboard's
// applyFieldOverrides() in public/app.js, kept as its own copy here since
// this page has no shared script file with the manager dashboard. Hiding a
// field just sets display:none; findMissingRequired() below already skips
// anything with no visible layout box, so a hidden required field can't
// block submission.
function applyFieldOverrides(overrides) {
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
}

function render(data) {
  // "Silverblaze Launchpad" is now the small eyebrow label in
  // customer.html (static, never changes); the project name is the actual
  // highlighted/main title text a vendor sees.
  document.getElementById('cx-title').textContent = data.projectName;
  document.getElementById('cx-section-name').textContent = data.sectionLabel;
  if (data.alreadySubmitted) {
    document.getElementById('cx-desc').innerHTML =
      'A previous submission was found and has been loaded below — review and update if needed. <span class="already-badge"><i class="fas fa-check-circle"></i> Previously submitted</span>';
  }

  const build = SECTION_BUILDERS[data.sectionKey];
  const wrap = document.getElementById('cx-fields');
  wrap.innerHTML = build ? build(data) : '<div class="card-note">This section type is not recognized.</div>';
  injectCustomFields(data.sectionKey, data.customFields || []);
  applyFieldOverrides(data.fieldOverrides || {});
  // Belt-and-suspenders against the browser's own autofill/suggestion memory
  // (separate from the __provided secret-field logic above) — every field on
  // this page pulls its value from EXISTING (this token's actual saved data,
  // empty on a first-ever open), so anything a customer sees beyond that
  // should be their own in-progress typing, never the browser guessing from
  // unrelated previous forms it has seen on this device.
  disableAutofillOnAllFields(wrap);

  // Payment Vendor: show only the block for the previously-selected/chosen vendor.
  const vendorSelect = document.getElementById('pay_vendor_type');
  if (vendorSelect) togglePayVendor(vendorSelect.value);

  // Smart Meter: reveal the fields if it was previously turned on.
  const smToggle = document.getElementById('sm_on');
  if (smToggle) toggleSM(smToggle.checked);

  // Project Info (PM): reveal the Business Unit / Direct Customer sub-blocks
  // matching whatever was previously saved (build() already sets the initial
  // display via EXISTING.pm_customer_type, this just keeps the change handler
  // and initial state in sync using the same function the manager dashboard uses).
  const pmCustomerType = document.getElementById('pm_customer_type');
  if (pmCustomerType) togglePmCustomerType(pmCustomerType.value);

  document.getElementById('cx-loading').style.display = 'none';
  document.getElementById('cx-fields-wrap').style.display = 'block';
}

// Same show/hide behavior as the manager dashboard's togglePayVendor.
function togglePayVendor(value) {
  const blockId = 'pay-block-' + (value || '').replace(/\s+/g, '');
  document.querySelectorAll('.pay-vendor-block').forEach((block) => {
    block.style.display = block.id === blockId ? 'block' : 'none';
  });
}

// Same show/hide behavior as the manager dashboard's toggleSM.
function toggleSM(on) {
  const fields = document.getElementById('sm-fields');
  const skipMsg = document.getElementById('sm-skip-msg');
  if (fields) fields.style.display = on ? 'block' : 'none';
  if (skipMsg) skipMsg.style.display = on ? 'none' : 'block';
}

// Same show/hide behavior as the manager dashboard's togglePmCustomerType.
function togglePmCustomerType(value) {
  const buNameF = document.getElementById('pm-bu-name-f');
  const buBlock = document.getElementById('pm-bu-block');
  const dcBlock = document.getElementById('pm-dc-block');
  if (buNameF) buNameF.style.display = value === 'Business Unit' ? 'flex' : 'none';
  if (buBlock) buBlock.style.display = value === 'Business Unit' ? 'block' : 'none';
  if (dcBlock) dcBlock.style.display = value === 'Direct Customer' ? 'block' : 'none';
}

// Same inline URL/email/IP validation the manager dashboard uses.
function lv(el, type) {
  const v = el.value.trim();
  const h = document.getElementById('h_' + el.id);
  if (!h) return;
  let ok = true, msg = '', cls = 'fhint';
  if (type === 'url' && v) { if (!/^https?:\/\/.+\..+/.test(v)) { ok = false; msg = 'Must start with https://'; cls = 'ferr'; } else { msg = '✓ Valid URL'; cls = 'fok'; } }
  if (type === 'email' && v) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { ok = false; msg = 'Invalid email'; cls = 'ferr'; } else { msg = '✓ Valid email'; cls = 'fok'; } }
  if (type === 'ip' && v) { if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) { ok = false; msg = 'Enter a valid IP'; cls = 'ferr'; } else { msg = '✓ Valid IP'; cls = 'fok'; } }
  el.classList.toggle('err', !ok && v.length > 0);
  el.classList.toggle('ok', ok && v.length > 0);
  h.textContent = msg; h.className = cls;
}

// ── REQUIRED-FIELD VALIDATION (same convention as public/app.js) ─────────
function findMissingRequired(root) {
  const missing = [];
  root.querySelectorAll('.f').forEach((f) => {
    if (!f.querySelector('.req')) return;
    if (f.offsetParent === null) return; // hidden by a vendor/smart-meter toggle block
    const input = f.querySelector('input,select,textarea');
    if (!input) return;
    if (input.disabled) return; // hosting-inapplicable (e.g. Ansible under Silverblaze Azure Hosted)
    const empty = input.type === 'checkbox' ? false : !input.value.trim();
    input.classList.toggle('err', empty);
    if (empty) missing.push({ f, input });
  });
  return missing;
}

function collect() {
  const data = {};
  document.querySelectorAll('#cx-fields input,#cx-fields select,#cx-fields textarea').forEach((el) => {
    if (!el.id) return;
    if (el.type === 'checkbox') data[el.id] = el.checked;
    else if (el.value.trim() !== '') data[el.id] = el.value.trim();
  });
  return data;
}

async function submitCustomer() {
  const missing = findMissingRequired(document.getElementById('cx-fields'));
  if (missing.length) {
    toastCx(`Fill in ${missing.length} required field${missing.length > 1 ? 's' : ''} before submitting`);
    missing[0].f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    missing[0].input.focus();
    return;
  }
  const btn = document.getElementById('cx-submit');
  const statusEl = document.getElementById('cx-status');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Saving…';
  statusEl.innerHTML = '<div class="sstatus ss-saving"><span class="spin"></span> Saving to Smartsheet…</div>';
  try {
    const r = await fetch('/api/customer/' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: collect() }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Save failed');
    document.getElementById('cx-fields-wrap').style.display = 'none';
    document.querySelector('.cx-hdr').style.display = 'none';
    document.getElementById('cx-done').style.display = 'block';
    document.getElementById('done-ref').textContent = data.reference;
  } catch (e) {
    statusEl.innerHTML = `<div class="sstatus ss-error"><i class="fas fa-exclamation-triangle"></i> ${e.message}</div>`;
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
  }
}

// Tiny inline toast — this page has no #tc-driven toast() helper like the
// manager dashboard, so just flash the message in the status area.
function toastCx(msg) {
  const statusEl = document.getElementById('cx-status');
  statusEl.innerHTML = `<div class="sstatus ss-error"><i class="fas fa-triangle-exclamation"></i> ${msg}</div>`;
}
