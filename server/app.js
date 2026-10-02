const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const config = require('./config');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const customerRoutes = require('./routes/customer');
const trackingRoutes = require('./routes/tracking');
const customFieldsRoutes = require('./routes/customFields');

function createApp() {
  const app = express();

  // Required for secure cookies to work correctly behind a reverse proxy /
  // load balancer that terminates HTTPS (Azure App Service, Nginx, an ALB,
  // etc.) — without this, Express sees the proxy's plain-HTTP connection and
  // refuses to set the "secure" session cookie once NODE_ENV=production,
  // which silently breaks login. Safe to leave on even locally/without a
  // proxy.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(
    session({
      // Default in-memory session store — perfectly fine for a short-lived,
      // single-instance internal tool. If you ever run this long-term with
      // many people, swap this for a persistent store; not needed here.
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 8, // 8h manager session
      },
    })
  );

  app.use('/auth', authRoutes);
  // trackingRoutes mounted BEFORE projectRoutes: it owns the literal path
  // /api/projects/portfolio, which would otherwise be swallowed by
  // projects.js's generic GET /:projectName handler (Express matches the
  // first router whose pattern fits, and /:projectName matches any single
  // path segment — including "portfolio").
  app.use('/api/projects', trackingRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/customer', customerRoutes);
  app.use('/api/custom-fields', customFieldsRoutes);

  app.get('/healthz', (req, res) => res.json({ ok: true, mock: config.mock }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = createApp;
