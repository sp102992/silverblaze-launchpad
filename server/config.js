require('dotenv').config();

function need(name, fallback) {
  return process.env[name] || fallback;
}

// Same truthy-string convention already used for SMARTSHEET_MOCK — a value
// is only "on" if it's literally the string "true" (case-insensitive);
// anything else (unset, "false", "0", etc.) is off.
function flag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

module.exports = {
  port: parseInt(need('PORT', '3000'), 10),
  appBaseUrl: need('APP_BASE_URL', 'http://localhost:3000'),
  sessionSecret: need('SESSION_SECRET', 'dev-only-change-me'),
  linkSecret: need('LINK_SECRET', 'dev-only-change-me-2'),
  mock: String(process.env.SMARTSHEET_MOCK || '').toLowerCase() === 'true',

  // Logins are a hardcoded list now, not a single env-var pair —
  // see server/users.js to add/remove teammates.

  // ── FEATURE FLAGS ────────────────────────────────────────────────────
  // Centralized, consistent with the rest of this file's env-driven
  // config — nothing below is hard-coded into the UI. Flip any of these in
  // .env and restart the server. All three default to false (hidden) per
  // the current rollout plan; set to "true" to bring a section back without
  // any code changes. The underlying routes/data for every one of these
  // stay fully functional either way — this only controls visibility.
  features: {
    showProjectManagementSection: flag('SHOW_PROJECT_MANAGEMENT', false),
    showConfigExport: flag('SHOW_CONFIG_EXPORT', false),
    showOverviewSection: flag('SHOW_OVERVIEW_SECTION', false),
  },

  smartsheet: {
    // One personal API token, generated once at Smartsheet → Personal
    // Settings → API Access → Generate new access token. No OAuth app to
    // register, no per-user tokens — every read/write uses this same token.
    apiToken: process.env.SMARTSHEET_API_TOKEN || '',
    apiBase: 'https://api.smartsheet.com/2.0',
  },

  // ── NOTIFICATIONS ────────────────────────────────────────────────────
  // See server/notifications.js and server/digest.js. Everything here is
  // optional — leave NOTIFY_WEBHOOK_URL blank and the app behaves exactly
  // as before (notifications just log to the console instead of delivering).
  notifications: {
    // A Slack or Microsoft Teams "Incoming Webhook" URL. Both accept the
    // same simple { text } POST body this app sends.
    webhookUrl: process.env.NOTIFY_WEBHOOK_URL || '',
    // Turns the once-a-day portfolio health digest on/off. Off by default —
    // submission/blocker notifications work regardless of this flag.
    digestEnabled: flag('DIGEST_ENABLED', false),
    // 24-hour local server hour to send the digest (0-23). Default 8am.
    digestHour: parseInt(need('DIGEST_HOUR', '8'), 10),
  },

  // ── EMAIL (SMTP) ─────────────────────────────────────────────────────
  // See server/email.js. Optional, same graceful-no-op convention as
  // notifications above — leave SMTP_HOST blank and "Send via Email"
  // simply reports itself as unconfigured instead of throwing.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(need('SMTP_PORT', '587'), 10),
    secure: flag('SMTP_SECURE', false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromAddress: need('SMTP_FROM', 'no-reply@example.com'),
    fromName: need('SMTP_FROM_NAME', 'Client Onboarding Portal'),
  },

  // ── REMINDERS ────────────────────────────────────────────────────────
  // See server/reminders.js. Off by default. When enabled, a background
  // scheduler (same setInterval + dedup-guard pattern as digest.js)
  // periodically re-emails/re-notifies any share-link section that was
  // issued but never submitted.
  reminders: {
    enabled: flag('REMINDERS_ENABLED', false),
    // How many days to wait after issuing (or last reminding) before
    // nudging again.
    intervalDays: parseInt(need('REMINDER_INTERVAL_DAYS', '3'), 10),
    // 24-hour local server hour the reminder sweep runs at. Default 9am.
    hour: parseInt(need('REMINDER_HOUR', '9'), 10),
  },
};
