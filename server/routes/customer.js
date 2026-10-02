// Public endpoints hit by the customer-facing single-section form. No login
// required — the link's signed token identifies the project + section, and
// the server uses the one shared Smartsheet API token (config.smartsheet.
// apiToken) to read and write. The customer never sees any credential.
const express = require('express');
const smartsheet = require('../smartsheetClient');
const projectStore = require('../projectStore');
const { SECTIONS, toCells, fromCells } = require('../sectionSchemas');
const { verifyLinkToken } = require('../linkTokens');
const customFields = require('../customFields');
const fieldOverrides = require('../fieldOverrides');
const { notify } = require('../notifications');

const router = express.Router();

function resolve(token) {
  const payload = verifyLinkToken(token);
  if (!payload) return { error: 'This link is invalid or has expired.' };
  const project = projectStore.getProject(payload.projectName);
  if (!project) return { error: 'This project no longer exists.' };
  if (!SECTIONS[payload.sectionKey]) return { error: 'Unknown section.' };
  return { payload, project };
}

router.get('/:token', async (req, res) => {
  const { payload, project, error } = resolve(req.params.token);
  if (error) return res.status(400).json({ error });
  try {
    const sheetId = project.sheets[payload.sectionKey];
    await customFields.ensureColumnsForSection(smartsheet, sheetId, payload.sectionKey);
    await smartsheet.ensureSectionColumns(sheetId, payload.sectionKey);
    const titleCells = await smartsheet.getRowDataByClient(sheetId, payload.projectName);
    res.json({
      projectName: payload.projectName,
      sectionKey: payload.sectionKey,
      sectionLabel: SECTIONS[payload.sectionKey].label,
      fields: SECTIONS[payload.sectionKey].fields,
      // Section-level metadata that isn't itself a field: the vendor-type
      // dropdown options (Payment Vendor) and the "email us this" asset
      // instructions (Branding).
      vendorTypes: SECTIONS[payload.sectionKey].vendorTypes || null,
      emailInstructions: SECTIONS[payload.sectionKey].emailInstructions || null,
      hostingType: project.hostingType || null,
      customFields: customFields.listForSection(payload.sectionKey),
      // Designer rename/hide overrides on this section's hardcoded fields —
      // same published-only data the manager dashboard reads, so a vendor
      // filling out their own link sees the identical labels/visibility.
      fieldOverrides: fieldOverrides.listForSection(payload.sectionKey, 'published'),
      data: titleCells ? fromCells(payload.sectionKey, titleCells) : {},
      alreadySubmitted: !!titleCells,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:token', async (req, res) => {
  const { payload, project, error } = resolve(req.params.token);
  if (error) return res.status(400).json({ error });
  try {
    const sheetId = project.sheets[payload.sectionKey];
    await customFields.ensureColumnsForSection(smartsheet, sheetId, payload.sectionKey);
    await smartsheet.ensureSectionColumns(sheetId, payload.sectionKey);
    const cells = toCells(payload.sectionKey, req.body.formData || {});
    cells['Status'] = 'submitted';
    cells['Submitted By'] = req.body.submitterName || 'Customer link';
    cells['Submitted At'] = new Date().toISOString();
    await smartsheet.upsertRow(sheetId, payload.projectName, cells);
    // Fire-and-forget — notify() swallows its own errors, so a webhook
    // outage can never turn a successful submission into a failed response.
    notify(`✅ *${SECTIONS[payload.sectionKey].label}* submitted for *${payload.projectName}* (via share link, by ${cells['Submitted By']}).`);
    res.json({ ok: true, reference: 'REF-' + req.params.token.slice(-8).toUpperCase() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
