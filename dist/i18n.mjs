// D53/P72: languages. Korean stays in the code as the source text; the other languages live in dist/i18n/<id>.mjs and
// anything missing there shows in Korean. The chosen language stays in this browser.
import en from './i18n/en.mjs';
import zh from './i18n/zh.mjs';
import ja from './i18n/ja.mjs';
import vi from './i18n/vi.mjs';
import my from './i18n/my.mjs';
import { PHRASES, LANG_ORDER } from './i18n/phrases.mjs';

export const LANG_KEY = 'growing-travel.lang.v1';
export const LANGS = Object.freeze([
  { id: 'ko', label: '한국어', html: 'ko' },
  { id: 'en', label: 'English', html: 'en' },
  { id: 'zh', label: '中文', html: 'zh-Hans' },
  { id: 'ja', label: '日本語', html: 'ja' },
  { id: 'vi', label: 'Tiếng Việt', html: 'vi' },
  { id: 'my', label: 'မြန်မာ', html: 'my' },
]);
export const DICTS = Object.freeze({ en, zh, ja, vi, my });
const known = (id) => LANGS.some((item) => item.id === id);

// The stored choice, else the first browser language we have, else Korean.
export function detectLang(stored, browserLangs = []) {
  if (known(stored)) return stored;
  for (const tag of browserLangs) { const base = String(tag).toLowerCase().split('-')[0]; if (known(base)) return base; }
  return 'ko';
}
function readStored() { try { return globalThis.localStorage?.getItem(LANG_KEY); } catch { return null; } }
let current = detectLang(readStored(), globalThis.navigator?.languages ?? []);
const listeners = new Set();

export const lang = () => current;
export const fill = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
// t('start.q.pet', '어떤 여행을 좋아해요?') — the Korean is the fallback and the source.
export function t(key, ko, vars) {
  const text = current === 'ko' ? ko : DICTS[current]?.[key] ?? ko;
  return vars ? fill(text, vars) : text;
}
// tk('한국어 문장', { 값 }) — the Korean sentence itself is the key (dist/i18n/phrases.mjs).
const PHRASE_MAPS = Object.fromEntries(LANG_ORDER.map((id, column) => [id, new Map(PHRASES.map((row) => [row[0], row[column + 1]]))]));
export function tk(ko, vars) {
  const text = current === 'ko' ? ko : PHRASE_MAPS[current]?.get(ko) ?? ko;
  return vars ? fill(text, vars) : text;
}
export const hasPhrase = (ko) => PHRASE_MAPS.en.has(ko);
export const translated = (key) => current === 'ko' || Boolean(DICTS[current]?.[key]);

// Static markup: data-i18n (text), data-i18n-aria (aria-label), data-i18n-placeholder. The Korean is kept on first use.
export function applyStatic(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.dataset.i18nKo ??= element.textContent;
    element.textContent = t(element.dataset.i18n, element.dataset.i18nKo);
  }
  for (const [attr, name] of [['i18nAria', 'aria-label'], ['i18nPlaceholder', 'placeholder'], ['i18nTitle', 'title']]) {
    const selector = `[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
    for (const element of root.querySelectorAll(selector)) {
      const koKey = `${attr}Ko`;
      element.dataset[koKey] ??= element.getAttribute(name) ?? '';
      element.setAttribute(name, t(element.dataset[attr], element.dataset[koKey]));
    }
  }
  // data-tk / data-tk-aria / data-tk-placeholder: the element's own Korean is the phrase key (dist/i18n/phrases.mjs).
  for (const element of root.querySelectorAll('[data-tk]')) {
    element.dataset.tkKo ??= element.textContent;
    element.textContent = tk(element.dataset.tkKo);
  }
  for (const [attr, name] of [['tkAria', 'aria-label'], ['tkPlaceholder', 'placeholder']]) {
    for (const element of root.querySelectorAll(`[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)) {
      element.dataset[`${attr}Ko`] ??= element.getAttribute(name) ?? '';
      element.setAttribute(name, tk(element.dataset[`${attr}Ko`]));
    }
  }
  const html = LANGS.find((item) => item.id === current)?.html ?? 'ko';
  root.documentElement?.setAttribute('lang', html);
}
export function setLang(id, { reload = false } = {}) {
  if (!known(id)) return;
  current = id;
  try { globalThis.localStorage?.setItem(LANG_KEY, id); } catch {}
  if (reload) { globalThis.location?.reload(); return; }
  applyStatic();
  for (const listener of listeners) listener(id);
}
export function onLang(listener) { listeners.add(listener); return () => listeners.delete(listener); }

// A catalog pet in the chosen language (name, purpose, intro and its tag labels by tag id).
export function petText(pet) {
  return {
    name: t(`pet.${pet.id}.name`, pet.name), purpose: t(`pet.${pet.id}.purpose`, pet.purpose), intro: t(`pet.${pet.id}.intro`, pet.intro ?? ''),
    tags: (pet.tag_ids ?? []).length ? pet.tag_ids.map((tag, index) => t(`tag.${tag}`, pet.tags?.[index] ?? tag)) : [...(pet.tags ?? [])],
  };
}
// The header button and its dialog: the whole page is reloaded in the new language so every screen is redrawn.
export function setupLanguagePicker(doc = globalThis.document) {
  const $ = (id) => doc.getElementById(id);
  const short = () => (current === 'zh' ? '中' : current === 'ja' ? '日' : current === 'my' ? 'မြ' : current.toUpperCase());
  $('lang-current').textContent = short();
  $('lang-button').addEventListener('click', () => {
    $('lang-options').replaceChildren(...LANGS.map((item) => {
      const button = doc.createElement('button'); button.type = 'button'; button.className = `lang-option${item.id === current ? ' active' : ''}`;
      button.textContent = item.label; button.lang = item.html; button.setAttribute('aria-pressed', String(item.id === current));
      button.addEventListener('click', () => { $('lang-dialog').close(); if (item.id !== current) setLang(item.id, { reload: true }); });
      return button;
    }));
    $('lang-dialog').showModal();
  });
  $('lang-close').addEventListener('click', () => $('lang-dialog').close());
  onLang(() => { $('lang-current').textContent = short(); });
}

// D53/P74: districts, regions and 동네 친구 in the chosen language (Korean from the data when not translated).
import { REGION_TEXT, DISTRICT_TEXT, FRIEND_TEXT, KO_DISTRICT_IDS } from './i18n/places-text.mjs';
const column = () => LANG_ORDER.indexOf(current);
export const districtName = (id, ko) => (current === 'ko' ? ko : DISTRICT_TEXT[id]?.[column()] ?? ko);
export const regionName = (id, ko) => (current === 'ko' ? ko : REGION_TEXT[id]?.[column()] ?? ko);
export function friendText(friend) {
  if (!friend) return friend;
  const text = FRIEND_TEXT[friend.id];
  if (current === 'ko' || !text) return friend;
  const pick = (field) => text[field]?.[column()];
  return { ...friend, name: pick('name') ?? friend.name, concept: pick('concept') ?? friend.concept, greeting: pick('greeting') ?? friend.greeting,
    personality: pick('personality') ?? friend.personality, catchphrase: pick('catchphrase') ?? friend.catchphrase,
    look: undefined, pal: friend.pal && pick('pal') ? { ...friend.pal, note: pick('pal') } : friend.pal };
}
// The BCP 47 tag for dates and times in the chosen language.
export const locale = () => LANGS.find((item) => item.id === current)?.html ?? 'ko';
// The /api/catalog districts, regions and friends with their names in the chosen language (ids stay).
export function localizeCatalog(catalog) {
  if (current === 'ko' || !catalog) return catalog;
  return { ...catalog,
    regions: catalog.regions?.map((region) => ({ ...region, name: regionName(region.id, region.name) })),
    districts: catalog.districts?.map((district) => ({ ...district, name: districtName(district.id, district.name), ...(district.regionName ? { regionName: regionName(district.region, district.regionName) } : {}) })),
    friends: catalog.friends?.map(friendText) };
}
// D53/P76: the same tables for a given language, so the server can answer each request in the language it asked for.
export const langOr = (id) => (known(id) ? id : 'ko');
export function phraseIn(id, ko, vars) {
  const text = id === 'ko' ? ko : PHRASE_MAPS[id]?.get(ko) ?? ko;
  return vars ? fill(text, vars) : text;
}
export const tagIn = (id, tag, ko) => (id === 'ko' ? ko : DICTS[id]?.[`tag.${tag}`] ?? ko);
export const petNameIn = (id, pet) => (id === 'ko' ? pet.name : DICTS[id]?.[`pet.${pet.id}.name`] ?? pet.name);
export const districtIn = (id, gu, ko) => (id === 'ko' ? ko : DISTRICT_TEXT[gu]?.[LANG_ORDER.indexOf(id)] ?? ko);
export const friendNameIn = (id, friend) => (id === 'ko' || !friend ? friend?.name : FRIEND_TEXT[friend.id]?.name?.[LANG_ORDER.indexOf(id)] ?? friend.name);
// A Korean won amount ("1,550원") in another language: "₩1,550".
export const wonIn = (id, text) => (id === 'ko' || !text ? text : String(text).replace(/([\d,]+)원/g, '₩$1'));
export function districtByName(ko) {
  const id = KO_DISTRICT_IDS[ko];
  return id ? districtName(id, ko) : ko;
}
// D53/P77: the English TourAPI name under a Korean place name (other languages only; none when there was no match).
export function englishLine(place, doc = globalThis.document) {
  if (current === 'ko' || !place?.name_en) return null;
  const element = doc.createElement('span'); element.className = 'place-en'; element.lang = 'en'; element.textContent = place.name_en;
  return element;
}
// D54/P78: a won amount in the chosen language ("8,000원" / "₩8,000").
export const wonLabel = (won) => (current === 'ko' ? `${Number(won).toLocaleString('ko-KR')}원` : `₩${Number(won).toLocaleString('en-US')}`);
