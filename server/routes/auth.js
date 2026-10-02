// Plain login against a hardcoded list of users (server/users.js) — no
// OAuth, no database. Each teammate gets their own username/password so
// their name shows up correctly on whatever they save.
const express = require('express');
const users = require('../users');
const config = require('../config');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  // Username is matched case-insensitively (so "Admin"/"admin"/"ADMIN" are
  // the same account) — password stays an exact, case-sensitive match.
  const uname = (username || '').trim().toLowerCase();
  const match = users.find((u) => u.username.toLowerCase() === uname && u.password === password);
  if (match) {
    req.session.loggedIn = true;
    req.session.username = match.username;
    req.session.displayName = match.displayName || match.username;
    // Defaults to 'team' if a user entry doesn't set role, or sets an
    // unrecognized one — the safer default, since 'manager' unlocks seeing
    // every project and 'designer' unlocks global template editing.
    const validRoles = ['manager', 'team', 'designer'];
    req.session.role = validRoles.includes(match.role) ? match.role : 'team';
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect username or password' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  // features is sent on every boot (signed in or not) so the frontend never
  // has to hard-code which sections are turned on — it just reads this once.
  if (!req.session.loggedIn) return res.json({ signedIn: false, features: config.features });
  res.json({ signedIn: true, username: req.session.username, displayName: req.session.displayName, role: req.session.role || 'team', features: config.features });
});

module.exports = router;
