// ─────────────────────────────────────────────────────────────────────────
// EMAIL — sends a share-link (and, later, its reminder nudges) directly to
// the third-party POC by SMTP, instead of the manager having to copy/paste
// the link into their own mail client.
//
// Same graceful-no-op convention as server/notifications.js: if SMTP isn't
// configured (no SMTP_HOST in .env), every call logs to the console and
// returns { ok: false, reason: 'not_configured' } instead of throwing — a
// missing/misconfigured mail server should never break link generation.
// ─────────────────────────────────────────────────────────────────────────
const config = require('./config');

let _transporter = null;
let _nodemailer = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (_transporter) return _transporter;
  if (!_nodemailer) _nodemailer = require('nodemailer');
  _transporter = _nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return _transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[email] (set SMTP_HOST in .env to actually deliver this) to=${to} subject="${subject}"`);
    return { ok: false, reason: 'not_configured' };
  }
  try {
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromAddress}>`,
      to,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error('[email] failed to send:', e.message);
    return { ok: false, reason: e.message };
  }
}

// The one email shape this app actually needs: "here's your link, please
// fill in <section>". Used both for the initial manager-triggered send and
// for automated reminder nudges (server/reminders.js) — reminders just call
// this again with the same, already-issued URL.
async function sendShareLinkEmail(to, { projectName, sectionKey, label, url, reminder }) {
  const subject = reminder
    ? `Reminder: action needed — ${label} for ${projectName}`
    : `Action needed — ${label} for ${projectName}`;
  const intro = reminder
    ? `This is a friendly reminder that we're still waiting on this information.`
    : `We're setting up ${projectName} and need some information from you.`;
  const text = `${intro}\n\nSection: ${label}\n\nPlease complete it using this secure link (no login required):\n${url}\n\nThis link is unique to you — please don't forward it.`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#181A26;max-width:520px">
      <p>${intro}</p>
      <p><strong>Section:</strong> ${label}</p>
      <p style="margin:22px 0">
        <a href="${url}" style="background:#4A43C8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:600;display:inline-block">Complete ${label}</a>
      </p>
      <p style="color:#6E6F94;font-size:13px">Or copy this link: <a href="${url}">${url}</a></p>
      <p style="color:#9C9DBC;font-size:12px">No login required — this link is unique to you, please don't forward it.</p>
    </div>`;
  return sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendShareLinkEmail };
