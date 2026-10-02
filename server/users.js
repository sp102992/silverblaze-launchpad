// ─────────────────────────────────────────────────────────────────────────
// USERS — hardcoded list, edit directly to add/remove teammates.
//
// No database, no external identity provider — just a small static list of
// who's allowed to sign in. Each person gets their own username/password so
// "Submitted By" on saved sections and generated configs correctly shows
// which teammate did what.
//
// `role` controls project visibility AND, for 'designer', global template
// permissions:
//   'manager'  — sees every project in the All Projects portfolio, and can
//                assign teammates to a project (Project Tracking tab). Does
//                NOT have access to Manage Fields (see server/routes/
//                customFields.js) — that moved to the 'designer' role.
//   'team'     — sees only projects they created themselves, or that a
//                manager has explicitly assigned them to. Everything else
//                (creating projects, filling sections, share links) works
//                the same regardless of role.
//   'designer' — the ONLY role that can view/add/edit/delete/reorder the
//                custom fields on every vendor's intake template (Manage
//                Fields). Designer edits are drafts until explicitly
//                published (server/customFields.js) — nothing a Designer
//                does is globally live until they hit Publish. A designer
//                has no special project-visibility beyond a normal 'team'
//                member (falls into the same else-branch as 'team' in
//                server/permissions.js) since template management is
//                global/cross-project, not tied to any one project.
//
// To add someone: copy a line, change the values. To remove someone: delete
// their line. Restart the server for changes to take effect.
// ─────────────────────────────────────────────────────────────────────────

module.exports = [
  { username: 'admin', password: 'change-me', displayName: 'Admin', role: 'manager' },
  { username: 'designer', password: 'change-me', displayName: 'Designer', role: 'designer' },
  // { username: 'jsmith', password: 'a-real-password', displayName: 'Jane Smith', role: 'manager' },
  // { username: 'mchen', password: 'a-real-password', displayName: 'Mike Chen', role: 'team' },
  // { username: 'rpatel', password: 'a-real-password', displayName: 'Raj Patel', role: 'team' },
  // { username: 'tlee', password: 'a-real-password', displayName: 'Taylor Lee', role: 'designer' },
];
