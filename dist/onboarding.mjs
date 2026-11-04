// D50/P66: what the first-start questions keep. The pet, the tastes within it and the usual way of travelling stay in
// this browser under START_KEY; only pet, taste tags and style ever go to the server (to shape courses). Age, home
// region and student status go to the existing profile (benefits, P21) and nowhere else. Every answer may be skipped.
export const START_KEY = 'growing-travel.start.v1';
export const NOTE_MAX = 40;
export const TRAVEL_STYLES = Object.freeze([
  { id: 'slow', label: '한 곳에 오래 머물러요', hint: '천천히 깊게' },
  { id: 'packed', label: '여러 곳을 부지런히 돌아요', hint: '알차게 많이' },
  { id: 'spontaneous', label: '그때그때 끌리는 대로 가요', hint: '가다가 바꾸기' },
  { id: 'planned', label: '꼼꼼히 계획하고 다녀요', hint: '시간 맞춰 딱딱' },
]);
const ID = /^[a-z][a-z_]{1,29}$/;
// A typed note keeps letters only on one line and at most NOTE_MAX characters; it is shown back, never sent.
export const cleanNote = (value) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : '');

// `pets` is the catalog list ({ id, tag_ids }); without it ids are only checked for shape (reading before the catalog).
export function normalizeStart(raw = {}, pets = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const known = pets ? pets.find((item) => item.id === source.pet) : null;
  const pet = pets ? (known ? known.id : null) : (ID.test(source.pet ?? '') ? source.pet : null);
  const allowed = known ? new Set(known.tag_ids ?? []) : null;
  const tastes = Array.isArray(source.tastes) ? [...new Set(source.tastes.filter((tag) => ID.test(tag) && (!allowed || allowed.has(tag))))].slice(0, 8) : [];
  const style = TRAVEL_STYLES.some((item) => item.id === source.style) ? source.style : '';
  return { pet, tastes: pet ? tastes : [], tasteNote: cleanNote(source.tasteNote), style, styleNote: cleanNote(source.styleNote), skipped: source.skipped === true };
}

export function loadStart(storage = globalThis.localStorage) {
  try {
    const envelope = JSON.parse(storage.getItem(START_KEY) ?? 'null');
    if (!envelope || envelope.schemaVersion !== 1 || !envelope.start) return null;
    return { ...normalizeStart(envelope.start), savedAt: typeof envelope.savedAt === 'string' ? envelope.savedAt : null };
  } catch { return null; }
}
// Throws when the browser will not keep it, so the screen can say so.
export function saveStart(answers, { pets = null, storage = globalThis.localStorage, now = () => new Date() } = {}) {
  const start = normalizeStart(answers, pets);
  const serialized = JSON.stringify({ schemaVersion: 1, savedAt: now().toISOString(), start });
  storage.setItem(START_KEY, serialized);
  if (storage.getItem(START_KEY) !== serialized) throw new Error('read-back mismatch');
  return start;
}
// The first start shows until it is finished or put off once.
export const needsStart = (storage = globalThis.localStorage) => loadStart(storage) === null;

// The benefit answers merged into the stored profile; other profile fields keep what was there. Null when nothing was
// answered, so skipping all three never creates a profile.
export function profileWith(existing, { age = null, residenceRegion = '', studentStatus = 'unspecified' } = {}, defaults = {}) {
  const answered = (age !== null && age !== '') || residenceRegion !== '' || studentStatus !== 'unspecified';
  if (!answered) return null;
  return { ...defaults, ...(existing ?? {}), age: age === '' ? null : age, residenceRegion, studentStatus };
}
// What a course request may carry from the first start.
export const courseHints = (start) => (start ? { pet: start.pet, tastes: start.tastes, style: start.style } : { pet: null, tastes: [], style: '' });
