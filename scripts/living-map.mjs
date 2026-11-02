import { publicPlace } from './recommend.mjs';

// Stage 6 (명세 2-5 ④): what the living map shows for each place, decided on the server at request time.
// live: a report that is still valid → speech bubble. fading: the newest report has expired but news is under
// 48 hours old → faded bubble. sleeping: no news for 48 hours or ever → a place waiting to be woken by a report.
export const WAKE_HOURS = 48;
const newsTime = (report) => (report.lastConfirmedAt && report.lastConfirmedAt > report.createdAt ? report.lastConfirmedAt : report.createdAt);

// `reports` are one place's summaries, newest first (field-reports recentSummaries).
export function placeState(reports = [], now = Date.now()) {
  const lastNewsAt = reports.map(newsTime).sort().at(-1) ?? null;
  const active = reports.find((report) => report.active);
  if (active) return { state: 'live', report: active, lastNewsAt };
  if (reports.length && now - Date.parse(lastNewsAt) < WAKE_HOURS * 3600_000) return { state: 'fading', report: reports[0], lastNewsAt };
  return { state: 'sleeping', report: null, lastNewsAt };
}

export function livingMap(catalog, reportSummaries = {}, now = Date.now()) {
  return {
    wakeHours: WAKE_HOURS,
    generatedAt: new Date(now).toISOString(),
    places: catalog.places.map((place) => {
      const { state, report, lastNewsAt } = placeState(reportSummaries[place.id], now);
      return {
        ...publicPlace(place, catalog), purposes: place.purposes, state, lastNewsAt,
        report: report && { category: report.category, categoryLabel: report.categoryLabel, text: report.text, createdAt: report.createdAt, expiresAt: report.expiresAt, active: report.active },
      };
    }),
  };
}
