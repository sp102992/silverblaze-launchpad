// ─────────────────────────────────────────────────────────────────────────
// CONFIG KEY MAP
//
// This is the ONLY file you should need to edit to make the generated
// .properties file match your real utility portal's codebase. The left-hand
// side (the keys, e.g. "biz_name") are this intake form's internal field
// IDs — do not change those, they're wired into the rest of the app. The
// right-hand side (the values, e.g. "portal.business.name") is the exact
// property name your production application actually expects — change
// THOSE to match your codebase, then regenerate the config from the
// Final Review page. Nothing else in the app needs to change.
//
// If a field id has no entry here, the generated file falls back to using
// the field id itself as the key (see server/configBuilder.js).
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  // ── Business Info ──────────────────────────────────────
  biz_name: 'portal.business.name',
  biz_phone: 'portal.business.phone',
  biz_address: 'portal.business.address',
  biz_fax: 'portal.business.fax',
  biz_url: 'portal.business.website',
  biz_cs: 'portal.business.email.cs',
  biz_sup: 'portal.business.email.support',
  biz_gen: 'portal.business.email.general',
  biz_poc_name: 'portal.business.pointOfContact.name',
  biz_poc_email: 'portal.business.pointOfContact.email',
  nav1l: 'portal.nav.link1.label', nav1u: 'portal.nav.link1.url',
  nav2l: 'portal.nav.link2.label', nav2u: 'portal.nav.link2.url',
  nav3l: 'portal.nav.link3.label', nav3u: 'portal.nav.link3.url',
  nav4l: 'portal.nav.link4.label', nav4u: 'portal.nav.link4.url',
  nav5l: 'portal.nav.link5.label', nav5u: 'portal.nav.link5.url',
  hrs_mon: 'portal.hours.monday',
  hrs_tue: 'portal.hours.tuesday',
  hrs_wed: 'portal.hours.wednesday',
  hrs_thu: 'portal.hours.thursday',
  hrs_fri: 'portal.hours.friday',
  hrs_sat: 'portal.hours.saturday',
  hrs_sun: 'portal.hours.sunday',

  // ── CIS Integration ─────────────────────────────────────
  cis_poc_name: 'cis.pointOfContact.name',
  cis_poc_email: 'cis.pointOfContact.email',
  cis_dev_url: 'cis.endpoint.dev',
  cis_dev_user: 'cis.username.dev',
  cis_dev_pass: 'cis.password.dev',
  cis_uat_url: 'cis.endpoint.uat',
  cis_uat_user: 'cis.username.uat',
  cis_uat_pass: 'cis.password.uat',
  cis_prod_url: 'cis.endpoint.prod',
  cis_prod_user: 'cis.username.prod',
  cis_prod_pass: 'cis.password.prod',
  cis_elec: 'cis.services.electricity',
  cis_water: 'cis.services.water',
  cis_gas: 'cis.services.gas',
  cis_other_c: 'cis.services.other',
  cis_other_desc: 'cis.services.other.description',
  cis_t1t: 'cis.testaccount.1.type', cis_t1a: 'cis.testaccount.1.number', cis_t1n: 'cis.testaccount.1.notes',
  cis_t2t: 'cis.testaccount.2.type', cis_t2a: 'cis.testaccount.2.number', cis_t2n: 'cis.testaccount.2.notes',
  cis_t3t: 'cis.testaccount.3.type', cis_t3a: 'cis.testaccount.3.number', cis_t3n: 'cis.testaccount.3.notes',
  cis_t4a: 'cis.testaccount.other.number',
  cis_m_code: 'cis.account.code.metered', cis_m_desc: 'cis.account.desc.metered',
  cis_nm_code: 'cis.account.code.nonmetered', cis_nm_desc: 'cis.account.desc.nonmetered',
  cis_o_code: 'cis.account.code.other', cis_o_desc: 'cis.account.desc.other',
  cis_veip_sb_ips: 'cis.vendorIp.silverblazeIps', cis_veip_vendor_ips: 'cis.vendorIp.vendorIps',

  // ── Payment Vendor ──────────────────────────────────────
  pay_contact: 'payment.contact.person',
  pay_email: 'payment.contact.email',
  pay_vendor_type: 'payment.vendor.type',
  pay_tla: 'payment.paymentus.tla',
  pay_paymentus_comment: 'payment.paymentus.comment',
  pay_ic_biller_guid: 'payment.invoicecloud.billerGuid',
  pay_ic_webservice_key: 'payment.invoicecloud.webServiceKey',
  pay_ic_integration_guid: 'payment.invoicecloud.integrationGuid',
  pay_other_comment: 'payment.other.comment',
  pay_onetime_url: 'payment.onetime.url',
  pay_t1t: 'payment.testaccount.1.type', pay_t1a: 'payment.testaccount.1.number', pay_t1n: 'payment.testaccount.1.notes',
  pay_t2t: 'payment.testaccount.2.type', pay_t2a: 'payment.testaccount.2.number', pay_t2n: 'payment.testaccount.2.notes',
  pay_t3t: 'payment.testaccount.3.type', pay_t3a: 'payment.testaccount.3.number', pay_t3n: 'payment.testaccount.3.notes',
  pay_t4t: 'payment.testaccount.4.type', pay_t4a: 'payment.testaccount.4.number', pay_t4n: 'payment.testaccount.4.notes',
  pay_t5t: 'payment.testaccount.5.type', pay_t5a: 'payment.testaccount.5.number', pay_t5n: 'payment.testaccount.5.notes',
  pay_general_comment: 'payment.general.comment',
  pay_veip_sb_ips: 'payment.vendorIp.silverblazeIps', pay_veip_vendor_ips: 'payment.vendorIp.vendorIps',

  // ── Branding ─────────────────────────────────────────────
  brand_hex1: 'branding.color.primary',
  brand_hex2: 'branding.color.secondary',
  brand_other: 'branding.color.additional',

  // ── SMTP Config ──────────────────────────────────────────
  smtp_poc_name: 'smtp.pointOfContact.name',
  smtp_poc_email: 'smtp.pointOfContact.email',
  smtp_host: 'smtp.host',
  smtp_port: 'smtp.port',
  smtp_sec: 'smtp.security',
  smtp_auth: 'smtp.requiresAuth',
  smtp_user: 'smtp.username',
  smtp_pass: 'smtp.password',
  smtp_from: 'smtp.from.address',
  smtp_from_name: 'smtp.from.name',
  smtp_veip_sb_ips: 'smtp.vendorIp.silverblazeIps',

  // ── Ansible Inventory ────────────────────────────────────
  ans_ip: 'ansible.server.publicIp',
  ans_host: 'ansible.server.hostUrl',
  ans_sql: 'ansible.db.sqlInstance',
  ans_pdb: 'ansible.db.portal.name',
  ans_puser: 'ansible.db.portal.username',
  ans_ppass: 'ansible.db.portal.password',
  ans_fdb: 'ansible.db.forms.name',
  ans_fuser: 'ansible.db.forms.username',
  ans_fpass: 'ansible.db.forms.password',
  ans_install_drive: 'ansible.install.drive',
  ans_temp_drive: 'ansible.install.tempDrive',
  ans_sb_whitelist_ips: 'ansible.silverblaze.whitelistIps',
  ans_notes: 'ansible.notes',

  // ── Project Information for PM ────────────────────────────
  env_hosting_type: 'project.hostingType',
  pm_customer_type: 'project.pm.customerType',
  pm_bu_name: 'project.pm.buName',
  pm_sow_link: 'project.pm.sowLink',
  pm_effort_hours: 'project.pm.effortHours',
  pm_kickoff_date: 'project.pm.kickoffDate',
  pm_uat_estimate: 'project.pm.uatEstimate',
  pm_golive_estimate: 'project.pm.goLiveEstimate',
  pm_install_type: 'project.pm.installType',
  pm_portal_history: 'project.pm.portalHistory',
  pm_user_migration: 'project.pm.userMigrationRequired',
  pm_integration_type: 'project.pm.integrationType',
  pm_data_migration: 'project.pm.dataMigrationRequired',
  pm_bill_presentment: 'project.pm.billPresentment',
  pm_risk_log: 'project.pm.riskLog',

  // ── Smart Meter ──────────────────────────────────────────
  sm_on: 'smartmeter.enabled',
  sm_prov: 'smartmeter.provider',
  sm_contact: 'smartmeter.contact.person',
  sm_cemail: 'smartmeter.contact.email',
  sm_cphone: 'smartmeter.contact.phone',
  sm_tech: 'smartmeter.techsupport.contact',
  sm_temail: 'smartmeter.techsupport.email',
  sm_platform: 'smartmeter.platform',
  sm_api: 'smartmeter.api.available',
  sm_api_url: 'smartmeter.api.url',
  sm_auth_m: 'smartmeter.auth.method',
  sm_wl: 'smartmeter.whitelisting.required',
  sm_wl_ips: 'smartmeter.whitelisting.ips',
  sm_data: 'smartmeter.data.types',
  sm_freq: 'smartmeter.data.frequency',
  sm_hist: 'smartmeter.historical.available',
  sm_hist_dur: 'smartmeter.historical.duration',
  sm_meters: 'smartmeter.meter.types',
  sm_link: 'smartmeter.account.linkId',
  sm_ftm: 'smartmeter.file.transferMethod',
  sm_ffmt: 'smartmeter.file.format',
  sm_fname: 'smartmeter.file.namingConvention',
  sm_ffreq: 'smartmeter.file.deliveryFrequency',
  sm_fsample: 'smartmeter.file.sampleProvided',
  sm_furl: 'smartmeter.file.sampleUrl',
  sm_notes: 'smartmeter.notes',
  sm_veip_sb_ips: 'smartmeter.vendorIp.silverblazeIps',
};
