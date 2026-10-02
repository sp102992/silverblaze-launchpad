// Builds the downloadable/saveable .properties text for a project, pulling
// live data straight from Smartsheet (via the same shape routes/projects.js
// already returns from GET /:projectName) and mapping each field to its real
// property key via configKeyMap.js. Secret fields ARE now stored in
// Smartsheet and visible inside this app (see sectionSchemas.js), but this
// exported .properties file is a separate, more widely-shared distribution
// channel (downloaded, emailed, handed to a hosting/ops team) — so secrets
// are deliberately still written out here as a ${FIELD_ID} placeholder for
// your own secrets process to fill in, never the real value, to avoid
// plaintext credentials ending up in a file that leaves the app.
const { SECTION_KEYS, SECTIONS } = require('./sectionSchemas');
const configKeyMap = require('./configKeyMap');

function keyFor(fieldId) {
  return configKeyMap[fieldId] || fieldId;
}

function buildConfigText(projectName, sectionsData) {
  const lines = [];
  lines.push('# =====================================================');
  lines.push('# SILVERBLAZE PORTAL — IMPLEMENTATION CONFIGURATION');
  lines.push(`# Generated:  ${new Date().toISOString()}`);
  lines.push(`# Client:     ${projectName}`);
  lines.push('# =====================================================');

  SECTION_KEYS.forEach((sectionKey) => {
    const section = SECTIONS[sectionKey];
    const bucket = sectionsData[sectionKey] || {};
    const data = bucket.data || {};

    lines.push('');
    lines.push(`# ─── ${section.label.toUpperCase()} ${'─'.repeat(Math.max(1, 40 - section.label.length))}`);

    if (sectionKey === 'smart_meter' && !data.sm_on) {
      lines.push('# smart meter not enabled for this client — fields below left blank');
    }

    section.fields.forEach((f) => {
      const key = keyFor(f.id);
      if (f.secret) {
        const provided = !!data[`${f.id}__provided`];
        lines.push(`${key}=${provided ? '${' + f.id.toUpperCase() + '}' : ''}`);
      } else if (f.type === 'CHECKBOX') {
        lines.push(`${key}=${!!data[f.id]}`);
      } else {
        lines.push(`${key}=${data[f.id] || ''}`);
      }
    });
  });

  return lines.join('\n');
}

module.exports = { buildConfigText, keyFor };
