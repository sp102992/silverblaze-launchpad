// Small helper used only to catch likely typos when creating a new project —
// e.g. "Provo Water Distrct" vs an existing "Provo Water District". Not used
// for anything security-sensitive, just a UX nicety.

function normalize(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Classic Levenshtein edit distance (insert/delete/substitute one character).
function editDistance(a, b) {
  a = normalize(a);
  b = normalize(b);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// Given a candidate name and a list of existing names, find the closest
// existing one that is NOT an exact match — used to warn "did you mean X?"
// Threshold scales a little with name length so short names aren't overly
// sensitive and long names still catch a couple of typos.
function findClosestMatch(candidate, existingNames) {
  const normCandidate = normalize(candidate);
  let best = null;
  let bestDist = Infinity;
  for (const name of existingNames) {
    const normName = normalize(name);
    if (normName === normCandidate) continue; // exact matches are handled separately
    const dist = editDistance(normCandidate, normName);
    const threshold = Math.max(2, Math.round(normCandidate.length * 0.2));
    if (dist <= threshold && dist < bestDist) {
      best = name;
      bestDist = dist;
    }
  }
  return best;
}

function isExactMatch(a, b) {
  return normalize(a) === normalize(b);
}

module.exports = { editDistance, findClosestMatch, isExactMatch, normalize };
