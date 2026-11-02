import { featureAt, kmOutside } from './geo.mjs';

// Stage 5 (명세 2-5 ⑤·⑥): which district the traveler is in, and the device-only 도감 of friends met.
// No DOM access; the boundary features carry `properties.gu` (GET /api/boundaries).

// A fix vaguer than this cannot tell neighbouring districts apart, so it is ignored.
export const MAX_ACCURACY_M = 300;
// Staying this close to the current district keeps it: the 2013 outline is coarse and GPS jitters at borders.
export const STAY_KM = 0.2;
export const FRIENDS_KEY = 'growing-travel.friends.v1';
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
