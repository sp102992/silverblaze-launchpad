// ─────────────────────────────────────────────────────────────────────────
// FIELD SLOTS
//
// A "slot" is an existing card/field-group within an intake section that a
// manager-added custom field can be placed into — e.g. CIS Integration's
// "Test accounts" card, or Business Info's "Point of contact" card. This is
// what lets a manager-added field render ALONGSIDE a section's real fields
// instead of in a separate "Custom Fields" block bolted onto the bottom of
// the page (see server/customFields.js and public/app.js renderCustomFields).
//
// Each section's frontend markup (public/index.html) tags the matching card
// with `data-slot="<sectionKey>:<slotKey>"` so the renderer can find exactly
// which card's field grid to append into. Only cards with a plain `.fg`
// field grid are offered as slots — table-based groups (e.g. Business Info's
// Navigation Links, CIS's API endpoints table) aren't good drop targets for
// a single label+input field, so they're intentionally left out; the
// remaining slots still cover every section with the first slot only
// omitted if the section is a couple of grid-only cards.
// ─────────────────────────────────────────────────────────────────────────

const SECTION_SLOTS = {
  business_info: [
    { key: 'contact', label: 'Contact details' },
    { key: 'poc', label: 'Point of contact' },
    { key: 'colors', label: 'Brand colours' },
  ],
  cis_integration: [
    { key: 'poc', label: 'Point of contact' },
    { key: 'services', label: 'Utility service types' },
    { key: 'test_accounts', label: 'Test accounts' },
    { key: 'account_codes', label: 'Account type codes' },
  ],
  payment_vendor: [
    { key: 'poc', label: 'Point of contact' },
    { key: 'onetime', label: 'One-time payment' },
    { key: 'comments', label: 'Additional comments' },
  ],
  smtp_config: [
    { key: 'poc', label: 'Point of contact' },
    { key: 'server', label: 'Server settings' },
  ],
  ansible_inventory: [
    { key: 'server', label: 'Server' },
  ],
  smart_meter: [
    { key: 'poc', label: 'Point of contact' },
    { key: 'provider', label: 'Provider details' },
    { key: 'system', label: 'System & integration details' },
  ],
  pm_info: [
    { key: 'customer_hosting', label: 'Customer & hosting' },
    { key: 'scope_effort', label: 'Scope & effort' },
    { key: 'risk', label: 'Risk log' },
  ],
};

function slotsFor(sectionKey) {
  return SECTION_SLOTS[sectionKey] || [];
}

function defaultSlot(sectionKey) {
  const slots = slotsFor(sectionKey);
  return slots.length ? slots[0].key : 'default';
}

function isValidSlot(sectionKey, slot) {
  return slotsFor(sectionKey).some((s) => s.key === slot);
}

module.exports = { SECTION_SLOTS, slotsFor, defaultSlot, isValidSlot };
