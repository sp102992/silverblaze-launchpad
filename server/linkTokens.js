// Signed, expiring tokens used for customer share links.
// A section link encodes { projectName, sectionKey } — never a raw
// Smartsheet sheet ID or API token.
const jwt = require('jsonwebtoken');
const config = require('./config');

const DEFAULT_TTL = '30d';

function createLinkToken(payload) {
  return jwt.sign(payload, config.linkSecret, { expiresIn: DEFAULT_TTL });
}

function verifyLinkToken(token) {
  try {
    return jwt.verify(token, config.linkSecret);
  } catch (e) {
    return null;
  }
}

module.exports = { createLinkToken, verifyLinkToken };
