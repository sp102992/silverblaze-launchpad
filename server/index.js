const config = require('./config');
const createApp = require('./app');
const { startDigestScheduler } = require('./digest');
const { startReminderScheduler } = require('./reminders');

const app = createApp();
app.listen(config.port, () => {
  console.log(`SilverBlaze portal server listening on ${config.appBaseUrl} (mock mode: ${config.mock})`);
});

// No-op unless DIGEST_ENABLED=true in .env — see server/digest.js.
startDigestScheduler();

// No-op unless REMINDERS_ENABLED=true in .env — see server/reminders.js.
startReminderScheduler();
