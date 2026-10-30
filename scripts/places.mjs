import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACE_TAGS } from '../dist/ai-conditions.mjs';

// D26: candidate places for the AI recommendation, kept in data/places.json so the team can verify and edit them.
export { PLACE_TAGS };
export const WALK_LEVELS = Object.freeze([1, 2, 3]);
// Seoul, Incheon and the Gyeonggi day-trip belt; a point outside is almost certainly a typo.
const BOUNDS = Object.freeze({ lat: [36.9, 38.3], lng: [126.3, 127.9] });
const CHECK = /^(확인 필요|확인됨 \d{4}-\d{2}-\d{2})$/;

export function validatePlaces(data) {
  const errors = [];
  if (!Array.isArray(data?.places)) return { places: [], errors: ['places 배열이 없어요.'] };
  const ids = new Set();
  data.places.forEach((place, index) => {
    const at = `places[${index}]${place?.id ? ` (${place.id})` : ''}`;
    if (typeof place?.id !== 'string' || !/^[a-z0-9-]{3,64}$/.test(place.id)) errors.push(`${at}: id는 소문자·숫자·하이픈 3~64자`);
    else if (ids.has(place.id)) errors.push(`${at}: 중복 id`);
    else ids.add(place.id);
    for (const key of ['name', 'area', 'access']) if (typeof place?.[key] !== 'string' || !place[key].trim()) errors.push(`${at}: ${key} 필요`);
    if (!(place?.lat >= BOUNDS.lat[0] && place.lat <= BOUNDS.lat[1])) errors.push(`${at}: lat이 수도권 범위 밖`);
    if (!(place?.lng >= BOUNDS.lng[0] && place.lng <= BOUNDS.lng[1])) errors.push(`${at}: lng가 수도권 범위 밖`);
    if (!Array.isArray(place?.tags) || !place.tags.length || place.tags.some((tag) => !PLACE_TAGS.includes(tag))) errors.push(`${at}: tags는 ${PLACE_TAGS.join('/')} 중 1개 이상`);
    if (!WALK_LEVELS.includes(place?.walk_level)) errors.push(`${at}: walk_level은 1~3`);
    if (!CHECK.test(place?.check?.coords ?? '') || !CHECK.test(place?.check?.access ?? '')) errors.push(`${at}: check.coords/access는 "확인 필요" 또는 "확인됨 YYYY-MM-DD"`);
  });
  return { places: errors.length ? [] : data.places, errors };
}

export async function loadPlaces(dataDir) {
  let raw;
  try { raw = await fs.readFile(path.join(dataDir, 'places.json'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { places: [], errors: [] }; throw error; }
  let data;
  try { data = JSON.parse(raw); } catch (error) { return { places: [], errors: [`places.json을 읽을 수 없어요: ${error.message}`] }; }
  return validatePlaces(data);
}

// `node scripts/places.mjs` checks data/places.json and lists what still needs a human check.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { places, errors } = await loadPlaces(fileURLToPath(new URL('../data/', import.meta.url)));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else {
    const pending = places.filter((place) => place.check.coords === '확인 필요' || place.check.access === '확인 필요');
    console.log(`후보지 ${places.length}곳 형식 통과. 사람 확인이 남은 곳 ${pending.length}곳.`);
  }
}
