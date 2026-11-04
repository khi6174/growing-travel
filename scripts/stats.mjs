// D41/P57: daily counts behind the "뜨는 곳" tabs: how often each place was one of the three picks (per pet), how
// often its Kakao 길찾기 link was opened, and how often each district saw an arrival. Only counts per Seoul date are
// kept, never who or where from, and days older than `keepDays` are dropped. The file lives in data/runtime/
// (Git-ignored). A broken or unwritable file never stops a recommendation or an arrival; it only loses counts.
import fs from 'node:fs/promises';
import path from 'node:path';

const seoulDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const bump = (table, key, by = 1) => { table[key] = (table[key] ?? 0) + by; };
const emptyDay = () => ({ picks: {}, petPicks: {}, routes: {}, arrivals: {} });

export function createStatsStore({ file, now = () => new Date(), keepDays = 8 }) {
  let chain = Promise.resolve();
  const exclusive = (action) => { const run = chain.then(action); chain = run.catch(() => {}); return run; };
  async function read() {
    try {
      const state = JSON.parse(await fs.readFile(file, 'utf8'));
      return state?.schemaVersion === 1 && state.days && typeof state.days === 'object' ? state : { schemaVersion: 1, days: {} };
    } catch { return { schemaVersion: 1, days: {} }; }
  }
  async function write(state) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state));
    await fs.rename(temp, file);
  }
  const recent = (count) => Array.from({ length: count }, (_, index) => seoulDay(new Date(now().getTime() - index * 86_400_000)));
  function change(update) {
    return exclusive(async () => {
      const state = await read();
      const today = seoulDay(now());
      state.days[today] ??= emptyDay();
      update(state.days[today]);
      const keep = new Set(recent(keepDays));
      for (const day of Object.keys(state.days)) if (!keep.has(day)) delete state.days[day];
      await write(state);
    }).catch((error) => console.error(`[stats] not saved: ${error.message}`));
  }

  return {
    recordPicks(petId, placeIds) {
      return change((day) => { for (const id of placeIds) { bump(day.picks, id); day.petPicks[id] ??= {}; bump(day.petPicks[id], petId); } });
    },
    recordRoute(placeId) { return change((day) => bump(day.routes, placeId)); },
    recordArrival(gu) { return change((day) => bump(day.arrivals, gu)); },
    // Totals over the last `days` Seoul dates, today included.
    async totals({ days = 7 } = {}) {
      const state = await read();
      const sum = emptyDay();
      for (const key of recent(days)) {
        const day = state.days[key];
        if (!day) continue;
        for (const [id, n] of Object.entries(day.picks ?? {})) bump(sum.picks, id, n);
        for (const [id, pets] of Object.entries(day.petPicks ?? {})) { sum.petPicks[id] ??= {}; for (const [pet, n] of Object.entries(pets)) bump(sum.petPicks[id], pet, n); }
        for (const [id, n] of Object.entries(day.routes ?? {})) bump(sum.routes, id, n);
        for (const [gu, n] of Object.entries(day.arrivals ?? {})) bump(sum.arrivals, gu, n);
      }
      return sum;
    },
  };
}
