// ─────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS — pushes portal events (section submissions, flagged
// blockers, the portfolio health digest) out to a webhook you configure,
// instead of requiring someone to keep checking the dashboard.
//
// Sends a plain { text: "..." } POST body, which both a Slack "Incoming
// Webhook" and a Microsoft Teams "Incoming Webhook" connector render
// correctly — no Slack SDK / Teams SDK needed, and no new dependency: this
// reuses node-fetch, already a dependency of this project.
//
// If NOTIFY_WEBHOOK_URL isn't set in .env, every call just logs to the
// console instead of throwing. Notifications are a nice-to-have — a
// misconfigured or unreachable webhook should never break a real save,
// submit, or blocker-flag action.
// ─────────────────────────────────────────────────────────────────────────
const fetch = require('node-fetch');
const config = require('./config');

async function notify(text) {
  if (!config.notifications.webhookUrl) {
    console.log('[notify] (set NOTIFY_WEBHOOK_URL in .env to actually deliver this) ' + text);
    return;
  }
  try {
    const res = await fetch(config.notifications.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error('[notify] webhook responded ' + res.status + ': ' + (await res.text()));
    }
  } catch (e) {
    console.error('[notify] failed to send:', e.message);
  }
}

module.exports = { notify };
