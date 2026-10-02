// ─────────────────────────────────────────────────────────────────────────
// REMINDER NUDGES — automatically re-emails (and posts an internal webhook
// note for) any share-link section that was emailed to a third party but
// never submitted, instead of a PS team member having to remember to chase
// it manually.
//
// Only sections that went through the "Email link" send (server/email.js,
// wired in routes/projects.js's /share-links/:sectionKey/send-email route)
// are trackable here — that's the only place a recipient address exists.
// Bulk-generated copy/paste links (the plain "Generate / refresh links"
// button) have no known recipient, so there's nothing to remind.
//
// Same dependency-light scheduling pattern as server/digest.js: a
// once-a-minute setInterval tick, gated by a "once per calendar day, at
// config.reminders.hour" guard. Swap for node-cron later without touching
// runReminderSweep() itself if exact cron timing is ever needed.
// ─────────────────────────────────────────────────────────────────────────
const config = require('./config');
const projectStore = require('./projectStore');
const smartsheet = require('./smartsheetClient');
const { SECTIONS } = require('./sectionSchemas');
const { sendShareLinkEmail } = require('./email');
const { notify } = require('./notifications');

const DAY_MS = 24 * 60 * 60 * 1000;

// Exported (not just used by the scheduler) so it can be unit/integration
// tested directly without waiting on setInterval/the clock hour.
async function runReminderSweep() {
  if (!config.reminders.enabled) return { checked: 0, reminded: 0 };

  const projects = projectStore.listProjects();
  let checked = 0;
  let reminded = 0;

  for (const project of projects) {
    const shareLinks = project.shareLinks || {};
    const sectionKeys = Object.keys(shareLinks);
    if (!sectionKeys.length) continue;

    for (const sectionKey of sectionKeys) {
      const entry = shareLinks[sectionKey];
      if (!entry || !entry.recipientEmail) continue;
      checked++;

      try {
        const sheetId = project.sheets && project.sheets[sectionKey];
        const titleCells = sheetId ? await smartsheet.getRowDataByClient(sheetId, project.projectName) : null;
        const alreadySubmitted = !!titleCells;
        if (alreadySubmitted) continue; // nothing to nudge — already done

        const lastEvent = entry.lastRemindedAt || entry.issuedAt || 0;
        const dueAt = lastEvent + config.reminders.intervalDays * DAY_MS;
        if (Date.now() < dueAt) continue; // not due yet

        const label = (SECTIONS[sectionKey] && SECTIONS[sectionKey].label) || sectionKey;
        await sendShareLinkEmail(entry.recipientEmail, {
          projectName: project.projectName,
          sectionKey,
          label,
          url: entry.url,
          reminder: true,
        });
        notify(`⏰ Reminder sent for *${label}* on *${project.projectName}* (${entry.recipientEmail}) — still unsubmitted.`);

        // Read-then-merge against the freshest copy of the project record,
        // touching only this one section's entry, per projectStore's
        // shallow-merge contract (server/projectStore.js).
        const fresh = projectStore.getProject(project.projectName);
        if (fresh) {
          const freshLinks = { ...(fresh.shareLinks || {}) };
          if (freshLinks[sectionKey]) {
            freshLinks[sectionKey] = { ...freshLinks[sectionKey], lastRemindedAt: Date.now() };
            projectStore.saveProject(project.projectName, { shareLinks: freshLinks });
          }
        }
        reminded++;
      } catch (e) {
        // One project/section's Smartsheet hiccup should never stop the
        // rest of the sweep — same defensive shape as digest.js.
        console.error(`[reminders] sweep failed for ${project.projectName}/${sectionKey}:`, e.message);
      }
    }
  }
  return { checked, reminded };
}

let lastRunDateKey = null;

function startReminderScheduler() {
  if (!config.reminders.enabled) return;
  setInterval(async () => {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    if (now.getHours() === config.reminders.hour && dateKey !== lastRunDateKey) {
      lastRunDateKey = dateKey;
      try {
        const { checked, reminded } = await runReminderSweep();
        console.log(`[reminders] sweep complete — checked ${checked} link(s), sent ${reminded} reminder(s).`);
      } catch (e) {
        console.error('[reminders] sweep failed:', e.message);
      }
    }
  }, 60 * 1000);
}

module.exports = { runReminderSweep, startReminderScheduler };
