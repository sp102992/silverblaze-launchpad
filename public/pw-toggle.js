// ── PASSWORD VISIBILITY TOGGLE (site-wide) ──────────────────────────────
// Shared by index.html (manager dashboard: login, CIS/Payment/SMTP/Ansible
// passwords, Manage Fields custom fields, etc.) and customer.html (vendor
// share-link forms). Wraps every `type="password"` input on the page with
// a `.pw-wrap` + `.pw-toggle` eye-icon button (CSS already defined in
// styles.css) so it's masked by default and only reveals on explicit click.
//
// A MutationObserver keeps watching after the initial scan, so password
// fields that get rendered later — a dynamic custom field, a re-rendered
// share-link section, a newly-opened admin panel — are enhanced
// automatically. No render call site anywhere else needs to remember to
// call this; it is the single place this behavior lives, matching the
// "reusable component, not a one-off per screen" requirement.
//
// This only ever changes the input's `type` attribute in the DOM. It does
// not read, store, log, or transmit the value anywhere.
(function () {
  function enhance(input) {
    if (input.dataset.pwEnhanced) return;
    if (input.closest('.pw-wrap')) { input.dataset.pwEnhanced = '1'; return; }
    input.dataset.pwEnhanced = '1';
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = '<i class="fas fa-eye"></i>';
    btn.addEventListener('click', () => {
      const revealing = input.type === 'password';
      input.type = revealing ? 'text' : 'password';
      btn.innerHTML = revealing ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
      btn.setAttribute('aria-label', revealing ? 'Hide password' : 'Show password');
    });
    wrap.appendChild(btn);
  }
  function scan(root) {
    (root || document).querySelectorAll('input[type="password"]').forEach(enhance);
  }
  window.enhancePasswordFields = scan;

  document.addEventListener('DOMContentLoaded', () => scan());

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('input[type="password"]')) enhance(node);
        else if (node.querySelectorAll) scan(node);
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
