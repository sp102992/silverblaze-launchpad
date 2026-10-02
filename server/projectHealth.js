// ─────────────────────────────────────────────────────────────────────────
// PROJECT HEALTH — completion %, burn-rate forecast, and a Green/Yellow/Red
// signal, all computed on the fly from data that's already being collected.
// Nothing here introduces new storage: it reads the same intake sections,
// Project Tracking, and Weekly Forecast data everything else already uses.
// Powers the Portfolio (All Projects) dashboard.
// ─────────────────────────────────────────────────────────────────────────

// NOTE: "branding" used to be its own section; it's now folded into
// business_info (see server/sectionSchemas.js), so it's intentionally not
// listed separately here anymore — counting it twice would be wrong, and
// counting it as its own always-incomplete section would drag down every
// project's completion % for no reason.
const BASE_SECTIONS = ['business_info', 'cis_integration', 'payment_vendor', 'smtp_config', 'ansible_inventory'];

// Same "is Smart Meter counted?" rule the manager dashboard's own completion
// bar uses (SKEYS.concat(smEnabled ? [6] : [])) — only counts it if the
// client actually turned it on.
function completionPct(sectionsData) {
  const smEnabled = !!(sectionsData.smart_meter && sectionsData.smart_meter.data && sectionsData.smart_meter.data.sm_on);
  const keys = smEnabled ? BASE_SECTIONS.concat(['smart_meter']) : BASE_SECTIONS;
  const done = keys.filter((k) => sectionsData[k] && sectionsData[k].found).length;
  return Math.round((done / keys.length) * 100);
}

// Burn-rate projection: average actual hours/week logged so far, divided
// into whatever's left of the total forecasted hours, projected forward
// from the most recent week entered. Returns nulls if there isn't enough
// data yet (no weeks logged) rather than guessing.
function forecastProjection(trackingData, weeks) {
  const totalForecasted = parseFloat(trackingData.pt_total_hours) || weeks.reduce((s, w) => s + (parseFloat(w.forecastedHours) || 0), 0) || 0;
  const weeksWithActuals = weeks.filter((w) => w.actualHours !== '' && w.actualHours !== null && w.actualHours !== undefined);
  const hoursLogged = weeksWithActuals.reduce((s, w) => s + (parseFloat(w.actualHours) || 0), 0);
  const avgWeeklyActual = weeksWithActuals.length ? hoursLogged / weeksWithActuals.length : null;
  const remainingHours = Math.max(totalForecasted - hoursLogged, 0);
  const weeksRemaining = avgWeeklyActual ? Math.ceil(remainingHours / avgWeeklyActual) : null;

  let projectedGoLive = null;
  if (weeksRemaining !== null) {
    const lastWeekEnd = weeks.length ? weeks[weeks.length - 1].weekEnd : null;
    const base = lastWeekEnd ? new Date(lastWeekEnd) : new Date();
    if (!isNaN(base.getTime())) {
      projectedGoLive = new Date(base.getTime() + weeksRemaining * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    }
  }
  return { totalForecasted, hoursLogged, avgWeeklyActual, weeksRemaining, projectedGoLive };
}

// Priority-ordered RAG rules — a manual "At Risk"/"Delayed" call always
// wins, then open blockers, then whether the burn-rate pace is tracking
// behind the target go-live date. Every reason that fired is returned so
// the dashboard can show *why*, not just a color.
function computeHealth({ trackingData, unresolvedBlockers, forecast }) {
  const reasons = [];
  let rag = 'green';

  if (trackingData.pt_status === 'Delayed') { rag = 'red'; reasons.push('Manager marked this project Delayed'); }
  else if (trackingData.pt_status === 'At Risk') { rag = 'yellow'; reasons.push('Manager marked this project At Risk'); }

  if (unresolvedBlockers > 0) {
    reasons.push(`${unresolvedBlockers} unresolved blocker${unresolvedBlockers > 1 ? 's' : ''}`);
    if (unresolvedBlockers >= 2) rag = 'red';
    else if (rag === 'green') rag = 'yellow';
  }

  if (forecast.projectedGoLive && trackingData.pt_golive_date) {
    const diffDays = Math.round((new Date(forecast.projectedGoLive) - new Date(trackingData.pt_golive_date)) / (24 * 3600 * 1000));
    if (diffDays > 21) { rag = 'red'; reasons.push(`Pace is ${diffDays} days behind target go-live`); }
    else if (diffDays > 7) { if (rag === 'green') rag = 'yellow'; reasons.push(`Pace is ${diffDays} days behind target go-live`); }
  }

  if (!reasons.length) reasons.push('No risk signals on file');
  return { rag, reasons };
}

module.exports = { completionPct, forecastProjection, computeHealth };
