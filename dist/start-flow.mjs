// D50/P66: the first start, one question a screen like the conditions (D42). (D53) Language → pet → hello → tastes →
// usual way of travelling → age and student → home region → done. Every question can be skipped, and each can be
// answered by choosing or by typing a line. Walking and company are asked on every trip instead (D50).
import { petFace } from './pet-art.mjs';
import { createProfileStore, DEFAULT_PROFILE, RESIDENCE_REGIONS, normalizeProfile } from './profile.mjs';
import { TRAVEL_STYLES, NOTE_MAX, cleanNote, loadStart, saveStart, needsStart, profileWith, normalizeStart } from './onboarding.mjs';
import { t, LANGS, lang, setLang, onLang, petText } from './i18n.mjs';

const $ = (id) => document.getElementById(id);
const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const STEPS = Object.freeze([
  { id: 'lang', question: '언어를 골라 주세요', hint: 'Choose your language · 选择语言 · 言語を選択 · Chọn ngôn ngữ · ဘာသာစကားရွေးပါ', next: ['start.next', '다음'], skip: false },
  { id: 'pet', question: '어떤 여행을 좋아해요?', hint: '고른 펫이 내 여행 스타일이 돼요. 언제든 바꿀 수 있어요.', next: ['start.next', '다음'], skip: false },
  { id: 'hello', question: '반가워요!', hint: '이제 주인님이 어떤 사람인지 몇 가지만 알려 주세요.', next: ['start.ok', '좋아요'], skip: false },
  { id: 'taste', question: '그중에서도 뭐가 좋아요?', hint: '여러 개 골라도 되고 직접 적어도 돼요. 코스에 먼저 담을게요.', next: ['start.next', '다음'], skip: true },
  { id: 'style', question: '어떤 방식으로 여행을 자주 했어요?', hint: '코스의 순서와 머무는 시간에 반영해요.', next: ['start.next', '다음'], skip: true },
  { id: 'age', question: '몇 살이에요? 대학생이에요?', hint: '맞는 혜택을 찾으려고 물어요. 이 기기에만 저장돼요.', next: ['start.next', '다음'], skip: true },
  { id: 'home', question: '어디 살아요?', hint: '사는 곳에 따라 받을 수 있는 혜택이 달라요. 이 기기에만 저장돼요.', next: ['start.next', '다음'], skip: true },
  { id: 'done', question: '준비 끝!', hint: '고른 내용은 이 기기에만 저장돼요. 내 설정에서 언제든 바꿀 수 있어요.', next: ['start.go', '첫 코스 짜러 가기'], skip: false },
]);
const PET_STEP = STEPS.findIndex((item) => item.id === 'pet');
// The pet's own hello, in the voice it already uses on the condition screens.
const HELLO = Object.freeze({
  golden: '반가워요, 멍! 저는 골든이에요. 오늘도 신나게 걸어 볼까요?',
  shiba: '반가워요, 멍. 저는 시바예요. 천천히, 느긋하게 다녀요.',
  corgi: '반가워요, 멍멍! 저는 코기예요. 맛있는 냄새를 따라가요!',
  bichon: '반가워요, 멍! 저는 비숑이에요. 예쁜 곳에서 사진 많이 남겨요.',
  baekgu: '반갑습니다, 멍. 저는 백구입니다. 이야기가 있는 길로 모실게요.',
});
const LINES = Object.freeze({ taste: '좋아하는 걸 알면 코스가 더 잘 맞아요!', style: '저는 주인님 속도에 맞출게요.', age: '혜택 찾기는 제게 맡겨요.', home: '사는 곳도 혜택에 도움이 돼요.', done: '이제 같이 출발해요!' });
const STUDENT = Object.freeze([['student', '대학생이에요'], ['not_student', '아니에요'], ['unspecified', '말 안 할래요']]);
const studentLabel = (value) => t(`student.${value}`, STUDENT.find(([id]) => id === value)?.[1] ?? '');
const regionLabel = (region) => (region ? t(`region.${region}`, region) : t('region.none', '말 안 할래요'));

function choice(container, { type = 'radio', name, value, label, hint, checked = false, figure, className = 'cond-tile', index = 0 }) {
  const wrapper = node('label', className); wrapper.style.setProperty('--i', String(index));
  const input = node('input'); input.type = type; input.name = name; input.value = value; input.checked = checked; input.autocomplete = 'off';
  const face = node('span', 'cond-tile-face');
  if (figure) face.append(figure);
  face.append(node('b', '', label));
  if (hint) face.append(node('small', '', hint));
  wrapper.append(input, face); container.append(wrapper);
  return input;
}
const replay = (element, className) => { element.classList.remove(className); void element.offsetWidth; element.classList.add(className); };

export function setupStartFlow({ goScreen, pets, onProfile = () => {} }) {
  const profileStore = createProfileStore();
  const steps = [...document.querySelectorAll('#start-panel .start-step')];
  const answers = { pet: null, tastes: [], tasteNote: '', style: '', styleNote: '', age: '', studentStatus: 'unspecified', residenceRegion: '' };
  let catalog = null;
  let step = 0;
  let autoTimer = 0;
  const currentPet = () => catalog?.pets.find((item) => item.id === answers.pet) ?? null;
  // A tap moves on by itself (like the conditions); the keyboard (detail 0) stays so arrows can browse.
  const autoNext = (event, from) => { clearTimeout(autoTimer); if (event.detail !== 0) autoTimer = setTimeout(() => { if (step === from) go(from + 1); }, 420); };

  function renderLangs() {
    const box = $('start-langs'); box.replaceChildren();
    LANGS.forEach((item, index) => {
      const input = choice(box, { name: 'start-lang', value: item.id, label: item.label, checked: item.id === lang(), className: 'cond-tile start-lang', index });
      input.addEventListener('click', (event) => { if (item.id !== lang()) setLang(item.id); autoNext(event, 0); });
    });
  }
  function renderPets() {
    const box = $('start-pets'); box.replaceChildren();
    catalog.pets.forEach((item, index) => {
      const text = petText(item);
      const input = choice(box, { name: 'start-pet', value: item.id, label: `${text.name} · ${text.purpose}`, hint: text.tags.slice(0, 3).join(' · '), checked: item.id === answers.pet, figure: petFace(item.id), className: 'cond-tile start-pet', index });
      input.addEventListener('click', (event) => {
        answers.pet = item.id; answers.tastes = [];
        $('start-pet-face').replaceChildren(petFace(item.id));
        autoNext(event, PET_STEP);
      });
    });
  }
  function renderTastes() {
    const box = $('start-tastes'); box.replaceChildren();
    const pet = currentPet(); if (!pet) return;
    const text = petText(pet);
    (pet.tag_ids ?? []).forEach((tag, index) => {
      const input = choice(box, { type: 'checkbox', name: 'start-taste', value: tag, label: text.tags[index] ?? tag, checked: answers.tastes.includes(tag), className: 'cond-chip', index });
      input.addEventListener('change', () => { answers.tastes = [...box.querySelectorAll('input:checked')].map((item) => item.value); });
    });
  }
  function renderStyles() {
    const box = $('start-styles'); box.replaceChildren();
    TRAVEL_STYLES.forEach((item, index) => {
      const input = choice(box, { name: 'start-style', value: item.id, label: t(`style.${item.id}.label`, item.label), hint: t(`style.${item.id}.hint`, item.hint), checked: answers.style === item.id, index });
      input.addEventListener('change', () => { answers.style = item.id; });
    });
  }
  function renderStudent() {
    const box = $('start-student'); box.replaceChildren();
    STUDENT.forEach(([value], index) => {
      const input = choice(box, { name: 'start-student', value, label: studentLabel(value), checked: answers.studentStatus === value && value !== 'unspecified', className: 'cond-chip', index });
      input.addEventListener('change', () => { answers.studentStatus = value; });
    });
  }
  function renderRegions() {
    const box = $('start-regions'); box.replaceChildren();
    [...RESIDENCE_REGIONS, ''].forEach((region, index) => {
      const input = choice(box, { name: 'start-region', value: region, label: regionLabel(region), checked: answers.residenceRegion === region && region !== '', className: 'cond-chip', index });
      input.addEventListener('change', () => { answers.residenceRegion = region; });
    });
  }
  function renderAll() { renderLangs(); if (catalog) { renderPets(); renderTastes(); } renderStyles(); renderStudent(); renderRegions(); }
  function summaryRows() {
    const pet = currentPet();
    const text = pet ? petText(pet) : null;
    const tasteLabels = (pet?.tag_ids ?? []).map((tag, index) => (answers.tastes.includes(tag) ? text.tags[index] : null)).filter(Boolean);
    const taste = [...tasteLabels, cleanNote(answers.tasteNote)].filter(Boolean).join(', ');
    const styleItem = TRAVEL_STYLES.find((item) => item.id === answers.style);
    const style = [styleItem ? t(`style.${styleItem.id}.label`, styleItem.label) : '', cleanNote(answers.styleNote)].filter(Boolean).join(', ');
    const student = answers.studentStatus !== 'unspecified' ? studentLabel(answers.studentStatus) : '';
    const who = [answers.age ? t('summary.age', '만 {age}세', { age: answers.age }) : '', student].filter(Boolean).join(' · ');
    const skipped = t('summary.skipped', '건너뛰었어요');
    return [[t('summary.pet', '함께 갈 펫'), text ? `${text.name} · ${text.purpose}` : t('summary.none', '아직 안 골랐어요')], [t('summary.taste', '좋아하는 것'), taste || skipped], [t('summary.style', '여행 방식'), style || skipped], [t('summary.who', '나이·학생'), who || skipped], [t('summary.home', '사는 곳'), answers.residenceRegion ? regionLabel(answers.residenceRegion) : skipped]];
  }

  function show(index, direction = 'forward') {
    step = index;
    const meta = STEPS[index];
    steps.forEach((element, at) => { element.hidden = at !== index; });
    const current = steps[index];
    current.dataset.dir = direction; replay(current, 'entering');
    $('start-count').textContent = t('start.count', '처음 시작 {n} / {total}', { n: index + 1, total: STEPS.length });
    $('start-progress').setAttribute('aria-valuenow', String(index + 1)); $('start-progress').setAttribute('aria-valuemax', String(STEPS.length));
    $('start-progress').firstElementChild.style.setProperty('--progress', `${((index + 1) / STEPS.length) * 100}%`);
    $('start-heading').textContent = t(`start.q.${meta.id}`, meta.question); replay($('start-heading'), 'swap');
    $('start-hint').textContent = t(`start.h.${meta.id}`, meta.hint);
    $('start-next').textContent = t(...meta.next);
    $('start-skip').hidden = !meta.skip;
    $('start-later').hidden = index === STEPS.length - 1;
    $('start-age-error').textContent = '';
    const pet = currentPet();
    // The pet sits beside the questions once chosen; on its hello it is shown large instead.
    $('start-pet-row').hidden = !pet || index <= PET_STEP + 1;
    if (pet && LINES[meta.id]) $('start-pet-line').textContent = t(`start.line.${meta.id}`, LINES[meta.id]);
    if (meta.id === 'hello' && pet) { $('start-hello-face').replaceChildren(petFace(pet.id)); replay($('start-hello-face'), 'hop'); $('start-hello-line').textContent = t(`hello.${pet.id}`, HELLO[pet.id] ?? ''); }
    if (meta.id === 'taste') renderTastes();
    if (meta.id === 'done') { $('start-summary').replaceChildren(...summaryRows().map(([label, text]) => { const li = node('li'); li.append(node('span', '', label), node('b', '', text)); return li; })); $('start-save-message').textContent = ''; }
    $('start-heading').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function readAge() {
    const raw = $('start-age').value.trim();
    if (raw === '') return { ok: true, value: '' };
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= 120 ? { ok: true, value } : { ok: false };
  }
  function go(index) { clearTimeout(autoTimer); show(index, index >= step ? 'forward' : 'back'); }
  function next() {
    const meta = STEPS[step];
    if (meta.id === 'pet' && !answers.pet) { $('start-hint').textContent = t('start.petError', '함께 갈 펫을 한 마리 골라 주세요.'); replay($('start-pets'), 'shake'); return; }
    if (meta.id === 'taste') answers.tasteNote = cleanNote($('start-taste-note').value);
    if (meta.id === 'style') answers.styleNote = cleanNote($('start-style-note').value);
    if (meta.id === 'age') {
      const age = readAge();
      if (!age.ok) { $('start-age-error').textContent = t('start.ageError', '만 나이는 1~120 사이 숫자로 적거나 비워 두세요.'); $('start-age').focus(); return; }
      answers.age = age.value;
    }
    if (meta.id === 'done') { finish(); return; }
    go(step + 1);
  }
  function skip() {
    const meta = STEPS[step];
    if (meta.id === 'taste') { answers.tastes = []; answers.tasteNote = ''; $('start-taste-note').value = ''; renderTastes(); }
    if (meta.id === 'style') { answers.style = ''; answers.styleNote = ''; $('start-style-note').value = ''; renderStyles(); }
    if (meta.id === 'age') { answers.age = ''; answers.studentStatus = 'unspecified'; $('start-age').value = ''; renderStudent(); }
    if (meta.id === 'home') { answers.residenceRegion = ''; renderRegions(); }
    go(step + 1);
  }
  // Saves what was answered: the start record always, the profile only when a benefit question was answered.
  function persist({ skipped = false } = {}) {
    const messages = [];
    try { saveStart({ ...answers, skipped }, { pets: catalog?.pets ?? null }); }
    catch { messages.push(t('start.saveBlocked', '이 브라우저가 저장을 막아서 다음에 다시 물어볼 수 있어요.')); }
    try {
      let existing = null;
      try { existing = profileStore.load(); } catch { existing = undefined; }
      const merged = existing === undefined ? null : profileWith(existing, { age: answers.age === '' ? null : answers.age, residenceRegion: answers.residenceRegion, studentStatus: answers.studentStatus }, DEFAULT_PROFILE);
      if (existing === undefined && (answers.age !== '' || answers.residenceRegion || answers.studentStatus !== 'unspecified')) messages.push(t('start.profileUnread', '저장된 내 설정을 읽지 못해 혜택 조건은 저장하지 않았어요. 내 설정에서 다시 저장해 주세요.'));
      if (merged) { const saved = profileStore.save(normalizeProfile(merged)); onProfile(saved); }
    } catch { messages.push(t('start.profileFail', '혜택 조건을 저장하지 못했어요. 내 설정에서 다시 저장해 주세요.')); }
    if (answers.pet && pets.petId() !== answers.pet) pets.selectPet(answers.pet);
    return messages;
  }
  function finish() {
    const messages = persist();
    if (messages.length) { $('start-save-message').textContent = messages.join(' '); }
    goScreen('ai');
  }

  $('start-next').addEventListener('click', next);
  $('start-skip').addEventListener('click', skip);
  $('start-later').addEventListener('click', () => { persist({ skipped: true }); goScreen('home'); });
  for (const id of ['start-taste-note', 'start-style-note', 'start-age']) $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); next(); } });
  $('start-taste-note').maxLength = NOTE_MAX; $('start-style-note').maxLength = NOTE_MAX;
  // The header back goes to the question before, like the conditions; on the first question it leaves to home.
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('#app-back') || document.querySelector('.app-frame')?.dataset.screen !== 'start' || step === 0) return;
    event.preventDefault(); event.stopImmediatePropagation(); go(step - 1);
  }, true);
  // Choosing a language here changes the words at once; the step stays where it is.
  onLang(() => { renderAll(); if (document.querySelector('.app-frame')?.dataset.screen === 'start') show(step, 'forward'); });

  // Opening the first start begins at the language with what was answered before.
  function open() {
    const saved = loadStart();
    if (saved) Object.assign(answers, { pet: saved.pet, tastes: saved.tastes, tasteNote: saved.tasteNote, style: saved.style, styleNote: saved.styleNote });
    try { const profile = profileStore.load(); if (profile) Object.assign(answers, { age: profile.age ?? '', studentStatus: profile.studentStatus, residenceRegion: profile.residenceRegion }); } catch {}
    $('start-taste-note').value = answers.tasteNote; $('start-style-note').value = answers.styleNote; $('start-age').value = answers.age === null ? '' : String(answers.age);
    renderAll();
    show(0, 'forward');
  }
  new MutationObserver(() => { if (document.querySelector('.app-frame')?.dataset.screen === 'start') open(); }).observe(document.querySelector('.app-frame'), { attributes: true, attributeFilter: ['data-screen'] });

  pets.catalogReady().then((loaded) => {
    catalog = loaded;
    renderAll();
    // A pet chosen at the first start is the default on the pet screen (it can be changed any time).
    const saved = normalizeStart(loadStart() ?? {}, catalog.pets);
    if (saved.pet && !pets.petId()) pets.selectPet(saved.pet);
  });
  return { needed: () => needsStart() };
}
