// D53: lists screen sentences that have no translation yet. `node scripts/check-i18n.mjs` prints them and exits 1.
// It reads every tk('…') call with a literal sentence in dist/, plus the Korean labels the screens pass to tk()
// from data constants (conditions, crowd levels, course kinds).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHRASES } from '../dist/i18n/phrases.mjs';
import { CONDITION_STEPS } from '../dist/condition-steps.mjs';
import { SEOUL_STATIONS, SEOUL_CAMPUSES, BUDGET_CHOICES, HOUR_CHOICES, WALK_CHOICES, TIME_OF_DAY } from '../dist/ai-conditions.mjs';
import { COURSE_KINDS } from '../dist/course-plan.mjs';
import { FALLBACK_COPY, NEARBY_MISSING, SOURCE_NOTE } from '../dist/ai-flow.mjs';
import { SEASONS, WEATHERS, TIMES } from '../dist/sky.mjs';
import { ANSWERS } from '../dist/district-arrival.mjs';
import { REPORT_CATEGORIES } from './field-reports.mjs';
import { CONDITION_LABELS } from './weather.mjs';
import { COMPASS } from '../dist/route-guide.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
export async function missingPhrases() {
  const known = new Set(PHRASES.map((row) => row[0]));
  const wanted = new Map();
  for (const name of await fs.readdir(dist)) {
    if (!name.endsWith('.mjs') || name === 'i18n.mjs') continue;
    const text = await fs.readFile(path.join(dist, name), 'utf8');
    for (const match of text.matchAll(/\btk\(\s*'((?:[^'\\]|\\.)*)'/g)) wanted.set(match[1].replace(/\\'/g, "'"), name);
  }
  const constants = [
    ...CONDITION_STEPS.flatMap((step) => [step.question, step.hint]), ...SEOUL_STATIONS.map((station) => station.label), ...SEOUL_CAMPUSES.map((campus) => campus.label), ...BUDGET_CHOICES.flatMap((choice) => [choice.label, choice.hint]),
    ...HOUR_CHOICES.flatMap((choice) => [choice.label, choice.hint].filter(Boolean)), ...WALK_CHOICES.flatMap((choice) => [choice.label, choice.hint]),
    ...TIME_OF_DAY.map((slot) => slot.label), '여유', '보통', '약간 붐빔', '붐빔',
    ...Object.values(COURSE_KINDS).flatMap((kind) => [kind.title, kind.blurb]),
    ...Object.values(FALLBACK_COPY), ...Object.values(NEARBY_MISSING), ...Object.values(SOURCE_NOTE),
    // D53/P74: sky labels, the friend's answers, report kinds and KMA weather words come from the server or data.
    ...[...SEASONS, ...WEATHERS, ...TIMES].map((item) => item.label), ...Object.values(ANSWERS).map((answer) => answer.label),
    ...Object.values(REPORT_CATEGORIES), ...Object.values(CONDITION_LABELS), ...COMPASS,
  ];
  for (const ko of constants) wanted.set(ko, 'constants');
  // Static page text marked data-tk (its own Korean is the key), and data-tk-aria / data-tk-placeholder values.
  const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<([a-z0-9]+)\s[^>]*?\bdata-tk(?=[\s>])[^>]*>([^<]*)<\/\1>/g)) wanted.set(match[2], 'index.html');
  for (const match of html.matchAll(/<[a-z0-9]+[^>]*>/g)) {
    const tag = match[0];
    if (/\sdata-tk-aria(?=[\s>])/.test(tag)) wanted.set(tag.match(/aria-label="([^"]*)"/)?.[1] ?? '', 'index.html');
    if (/\sdata-tk-placeholder(?=[\s>])/.test(tag)) wanted.set(tag.match(/placeholder="([^"]*)"/)?.[1] ?? '', 'index.html');
  }
  // D53/P76: sentences the server writes in the asked language (phraseIn / p(…) in scripts and the shared summary),
  // each pet's rule reason, the condition errors and the API error messages the screens pass through tk().
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const file of ['scripts/recommend.mjs', 'scripts/transit.mjs', 'dist/ai-conditions.mjs']) {
    const text = await fs.readFile(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/\b(?:p|phraseIn)\((?:lang, )?'([^']*)'/g)) if (/[가-힣]/.test(match[1])) wanted.set(match[1], file);
    for (const match of text.matchAll(/fields\.\w+ = '([^']+)'/g)) wanted.set(match[1], file);
  }
  const { MAX_PARTY } = await import('../dist/ai-conditions.mjs');
  wanted.set(`인원은 1~${MAX_PARTY}명으로 입력해 주세요.`, 'dist/ai-conditions.mjs');
  const pets = JSON.parse(await fs.readFile(path.join(root, 'data/pets.json'), 'utf8'));
  for (const pet of pets.pets) wanted.set(pet.reason_template, 'data/pets.json');
  const api = await fs.readFile(path.join(root, 'scripts/api.mjs'), 'utf8');
  for (const match of api.matchAll(/message: '([^']+)'|ReportError\('[A-Z_]+', '([^']+)'/g)) if (/[가-힣]/.test(match[1] ?? match[2])) wanted.set(match[1] ?? match[2], 'scripts/api.mjs');
  const extra = globalThis.EXTRA_PHRASES ?? [];
  for (const ko of extra) wanted.set(ko, 'extra');
  return [...wanted].filter(([ko]) => !known.has(ko)).map(([ko, from]) => ({ ko, from }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const missing = await missingPhrases();
  for (const { ko, from } of missing) console.log(`${from}\t${ko}`);
  console.log(missing.length ? `번역이 없는 문장 ${missing.length}개` : '모든 문장에 번역이 있어요.');
  process.exitCode = missing.length ? 1 : 0;
}
