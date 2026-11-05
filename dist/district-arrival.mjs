import { featureAt, kmOutside } from './geo.mjs';
import { tk } from './i18n.mjs';

// Stage 5 (명세 2-5 ⑤·⑥): which district the traveler is in, and the device-only 도감 of friends met.
// No DOM access; the boundary features carry `properties.gu` (GET /api/boundaries).

// A fix vaguer than this cannot tell neighbouring districts apart, so it is ignored.
export const MAX_ACCURACY_M = 300;
// Staying this close to the current district keeps it: the 2013 outline is coarse and GPS jitters at borders.
export const STAY_KM = 0.2;
export const FRIENDS_KEY = 'growing-travel.friends.v1';
// D47: for the demo every friend can be opened in the 도감 before it is met. Only the slots open: the met count,
// the board and the stored log still hold just the friends actually met. Set to false to hide unmet friends again.
export const PREVIEW_ALL_FRIENDS = true;

// D52 (11/5 demo only; put back to [] after it): these districts stand raised on the 3D Seoul board as if their friend
// had been met, so the demo shows what a filled 도감 looks like. Nothing is written to the stored 도감, and the met
// count, region counts and slots stay what was really met.
export const DEMO_RAISED_GU = Object.freeze(['jongno', 'mapo', 'seongdong', 'yeongdeungpo', 'songpa']);
// What the board stands up: districts really met, plus the demo ones (marked `demo`).
export function boardMet(log, friends, demo = DEMO_RAISED_GU) {
  const initial = (gu) => friends.find((item) => item.gu === gu)?.name[0] ?? '?';
  const met = new Map(log.map((entry) => [entry.gu, { initial: initial(entry.gu) }]));
  for (const gu of demo) if (!met.has(gu) && friends.some((item) => item.gu === gu)) met.set(gu, { initial: initial(gu), demo: true });
  return met;
}

// D46/P63 character rows for the 도감 detail: personality, catchphrase, look (until there is a drawing) and the
// friend it talks about. Rows whose data is missing are left out.
export function friendProfile(friend, friends = []) {
  const rows = [];
  if (friend?.personality) rows.push([tk('성격'), friend.personality]);
  if (friend?.catchphrase) rows.push([tk('말버릇'), `“${friend.catchphrase}”`]);
  if (friend?.look) rows.push([tk('모습'), friend.look]);
  if (friend?.pal?.note && friends.some((item) => item.id === friend.pal.id)) rows.push([tk('아는 친구'), friend.pal.note]);
  return rows;
}
// The friend's one question about the place the traveler is at; busy/calm become shared field reports.
export const ANSWERS = Object.freeze({
  busy: { label: '붐비거나 줄을 서요', category: 'crowd', text: '지금 붐비거나 줄을 서요.' },
  calm: { label: '한산해요', category: 'calm', text: '지금 한산해요.' },
  unknown: { label: '잘 모르겠어요', category: null, text: '' },
});

// { gu, arrived } for a new fix. `arrived` is true only when the district differs from `current`, so the first
// fix inside Seoul counts as arriving where the traveler already is.
export function districtChange(point, { accuracy = 0, current = null, features }) {
  if (!(accuracy <= MAX_ACCURACY_M)) return { gu: current, arrived: false, reason: 'inaccurate' };
  const own = current ? features.find((feature) => feature.properties.gu === current) : null;
  if (own && kmOutside(point, own) <= STAY_KM) return { gu: current, arrived: false };
  const found = featureAt(point, features);
  if (!found) return { gu: null, arrived: false, reason: 'outside' };
  return { gu: found.properties.gu, arrived: found.properties.gu !== current };
}

// Entries are { gu, friend, metAt, answer }; older plain ids or { gu } still count as met.
export function readFriendLog(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage.getItem(FRIENDS_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.map((entry) => (typeof entry === 'string' ? { gu: entry } : entry))
      .filter((entry) => typeof entry?.gu === 'string' && !seen.has(entry.gu) && seen.add(entry.gu));
  } catch { return []; }
}

// Adds a first meeting; a friend already in the log keeps its first record. Throws when storage is unavailable.
export function recordFriend(entry, storage = globalThis.localStorage) {
  const log = readFriendLog(storage);
  if (log.some((item) => item.gu === entry.gu)) return { log, added: false };
  const next = [...log, { gu: entry.gu, friend: entry.friend, metAt: entry.metAt, answer: entry.answer }];
  storage.setItem(FRIENDS_KEY, JSON.stringify(next));
  return { log: next, added: true };
}
