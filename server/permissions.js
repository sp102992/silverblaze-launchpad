// ─────────────────────────────────────────────────────────────────────────
// PROJECT VISIBILITY
//
// A manager (role: 'manager' in server/users.js) can see and open every
// project. Everyone else (role: 'team') can only see/open a project if they
// created it, or a manager has explicitly assigned them to it via the
// "Team access" card on the Project Tracking tab.
//
// A project created before this feature existed has no `createdBy` — those
// are only visible to managers until someone assigns them, since there's no
// way to know who "owns" them.
// ─────────────────────────────────────────────────────────────────────────

function canAccessProject(session, project) {
  if (!session || !project) return false;
  if (session.role === 'manager') return true;
  if (project.createdBy && project.createdBy === session.username) return true;
  if (Array.isArray(project.assignedUsers) && project.assignedUsers.includes(session.username)) return true;
  return false;
}

function visibleProjects(session, allProjects) {
  if (session && session.role === 'manager') return allProjects;
  return allProjects.filter((p) => canAccessProject(session, p));
}

module.exports = { canAccessProject, visibleProjects };
