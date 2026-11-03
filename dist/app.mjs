import { EXPERIENCES as LEGACY_EXPERIENCES, INTERESTS } from './data.mjs';
import { REAL_PLACES } from './real-catalog.mjs';
import { normalizeContext, recommend, validateRecommendation, buildCourseDraft } from './travel-domain.mjs';
import { isRealJourney, realRegionCard, realPlaceDetails, realJourneySummary, realTimeline } from './real-travel-view.mjs';
import { createCourseStore, STORAGE_KEY } from './storage.mjs';
import { DEFAULT_PROFILE, RESIDENCE_REGIONS, normalizeProfile, createProfileStore } from './profile.mjs';
import { DEPARTURES, normalizeTrip, compareRegions, buildJourneySnapshot } from './travel-journey.mjs';
import { OFFICIAL_BENEFITS } from './benefits.mjs';
import { parentScreen } from './navigation.mjs';
import { createScreenNavigation } from './screen-navigation.mjs';
import { benefitStatus, selectBenefits, seoulToday } from './benefit-catalog.mjs';
import { rankBenefits } from './benefit-matching.mjs';
import { hasStudentRoute, shortReason } from './benefit-presentation.mjs';
import { metaText } from './ui-copy.mjs';
import { fieldReportsSection } from './field-reports.mjs';
import { setupAiFlow } from './ai-flow.mjs';
import { setupArrivalFlow } from './arrival-flow.mjs';
import { setupLivingMap } from './living-map.mjs';
import { setupThemePicker } from './theme-picker.mjs';
import { setupSky } from './sky.mjs';

// D33: apply the chosen design draft before the rest of the app renders.
setupThemePicker();
setupSky();

const $ = (id) => document.getElementById(id);
const EXPERIENCES = [...REAL_PLACES, ...LEGACY_EXPERIENCES];
const store = createCourseStore();
const profileStore = createProfileStore();
// Personal benefit inputs are independent of the historical profile displayed in a course.
let personalBenefitInput = { age:'', residenceRegion:'', studentStatus:'unspecified' };
let personalBenefitInputSaved = false;
let personalPreferences = { interests:[...DEFAULT_PROFILE.interests], walkingLimitMinutes:DEFAULT_PROFILE.walkingLimitMinutes };
let conditionDraft = null;
let expandedBenefitId = null;
function captureBenefitInput(saved = false) {
  personalBenefitInput = { age:$('profile-age').value, residenceRegion:$('profile-residence').value, studentStatus:$('profile-student').value };
  personalBenefitInputSaved = saved;
  conditionDraft = null;
  $('benefits-profile-message').textContent = '';
}
function capturePreferences() { const {interests,walkingLimitMinutes} = rawProfile(); personalPreferences = {interests,walkingLimitMinutes}; }
function restoreBenefitInput() {
  const pairs = [['profile-age','age'],['profile-residence','residenceRegion'],['profile-student','studentStatus']];
  const interests = [...document.querySelectorAll('#interest-options input:checked')].map((node) => node.value);
  const changed = pairs.some(([id,key]) => $(id).value !== personalBenefitInput[key]) || $('profile-walking').value !== String(personalPreferences.walkingLimitMinutes) || JSON.stringify(interests) !== JSON.stringify(personalPreferences.interests);
  pairs.forEach(([id,key]) => { $(id).value = personalBenefitInput[key]; });
  $('profile-walking').value = personalPreferences.walkingLimitMinutes;
  document.querySelectorAll('#interest-options input').forEach((node) => { node.checked = personalPreferences.interests.includes(node.value); });
  if (changed) inputsChanged();
  return changed;
}
function editBenefitInput() {
  conditionDraft ??= { ...personalBenefitInput };
  $('condition-age').value = conditionDraft.age;
  $('condition-residence').value = conditionDraft.residenceRegion;
  document.querySelectorAll('[name="condition-student"]').forEach((node) => { node.checked = node.value === conditionDraft.studentStatus; });
  $('condition-error').textContent = '';
  validateConditionDraft();
  $('benefit-condition-sheet').showModal(); $('condition-heading').focus();
}
const state = { run: null, context: null, ids: [], courseId: null, version: null, savedSnapshot: null, inputDirty: false, revision: 0, saveKey: null, saving: false, requesting: false, hasSavedCurrent: false, comparison: null, comparisonDirty: false, journey: null, pendingRegionId: null, screen:'home', lastTravelScreen:'profile', travelStarted:false, walkingCustomized:false };
let petFlow = null;
let arrivalFlow = null;
function availability() {
  let profileValid = true;
  try { normalizeProfile(rawProfile()); } catch { profileValid = false; }
  return { profileValid, comparisonReady: Boolean(state.comparison && !state.comparisonDirty), recommendationsReady: Boolean(state.run && !state.inputDirty), hasCourse: Boolean(state.context && state.ids.length), petChosen: Boolean(petFlow?.hasPet()), aiResultsReady: Boolean(state.aiResults), arrivalReady: Boolean(arrivalFlow?.hasArrival()) };
}
const { goScreen, updateNavigation } = createScreenNavigation({
  state, availability, refreshSaved, renderBenefits,
  enterProfile(target) {
    restoreBenefitInput();
    if (state.screen !== target) {
      $('profile-message').textContent = personalBenefitInputSaved ? '저장한 내 설정이에요.' : '';
      $('profile-message').classList.remove('error');
    }
  },
});
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = /(?:^| )(?:muted|field-help|small-label|benefit-status|card-meta|saved-meta|storage-note)(?: |$)/.test(className || '') ? metaText(text) : text;
  return node;
}
function button(text, className, action, label) {
  const node = element('button', className, text); node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', action); return node;
}
function banner(message, isError = false) {
  $('results-status').replaceChildren();
  if (message) $('results-status').append(element('p', `status-banner${isError ? ' error' : ''}`, message));
}
function saveMessage(text = '', isError = false) { $('save-message').setAttribute('role',isError ? 'alert' : 'status'); $('save-message').textContent = text; $('save-message').className = `save-message${isError ? ' error' : ''}`; }
function markDirty() { state.saveKey = null; state.hasSavedCurrent = false; state.savedSnapshot = null; $('acknowledge').checked = false; saveMessage(); }
function contextSummary(context) {
  const labels = context.interests.map((id) => INTERESTS.find((item) => item.id === id)?.label).join(', ');
  return `${context.regionText || '목적지 미정'}, ${context.availableMinutes}분, ${labels}`;
}
function rawProfile() {
  return { age: $('profile-age').value, residenceRegion: $('profile-residence').value, studentStatus: $('profile-student').value, walkingLimitMinutes: $('profile-walking').value,
    interests: [...document.querySelectorAll('#interest-options input:checked')].map((node) => node.value),
  };
}
function rawTrip() {
  return { departureId: $('departure').value, date: $('travel-date').value, availableMinutes: $('minutes').value, budget: $('budget').value,
    partySize: $('party-size').value, walkingLimitMinutes: $('walking-limit').value, avoidStairs: $('avoid-stairs').checked };
}
function fillProfile(profile) {
  $('profile-age').value = profile.age ?? ''; $('profile-residence').value = profile.residenceRegion; $('profile-walking').value = profile.walkingLimitMinutes;
  $('profile-student').value = profile.studentStatus ?? 'unspecified';
  document.querySelectorAll('#interest-options input').forEach((node) => { node.checked = profile.interests.includes(node.value); });
}
function fillTrip(trip) {
  if (![...$('departure').options].some((option) => option.value === trip.departureId)) { const option = element('option', '', '이전 예시 출발역'); option.value = trip.departureId; option.hidden = true; $('departure').append(option); }
  $('departure').value = trip.departureId; $('travel-date').value = trip.date; $('minutes').value = trip.availableMinutes;
  $('budget').value = trip.budget; $('party-size').value = trip.partySize; $('walking-limit').value = trip.walkingLimitMinutes; $('avoid-stairs').checked = trip.avoidStairs;
  state.walkingCustomized = true;
}
function fillContext(context) {
  $('minutes').value = context.availableMinutes; $('avoid-stairs').checked = context.avoidStairs;
  document.querySelectorAll('#interest-options input').forEach((node) => { node.checked = context.interests.includes(node.value); });
}
function emptyState(title, message) {
  const node = element('div', 'empty-state'); node.append(element('span', 'empty-symbol', '✳'), element('h3', '', title), element('p', '', message)); return node;
}

const money = (amount) => Number.isFinite(amount) ? `${amount.toLocaleString('ko-KR')}원` : '미확인';
const minutes = (amount) => Number.isFinite(amount) ? `${amount}분` : '미확인';
const errorText = (error) => [error.message, ...Object.values(error.fields ?? {})].join(' ');
function reasonBlock(label,text) { const block = element('div','reason-block'); block.append(element('p','reason-label',label),element('p','reason-copy',text)); return block; }
function showFieldErrors(error, profile = false) {
  const fields = profile ? {age:'profile-age',residenceRegion:'profile-residence',studentStatus:'profile-student',walkingLimitMinutes:'profile-walking',interests:'interest-options'} : {departureId:'departure',date:'travel-date',availableMinutes:'minutes',budget:'budget',partySize:'party-size',walkingLimitMinutes:'walking-limit'};
  let first;
  for (const [key,id] of Object.entries(fields)) {
    const target = $(id); const message = error?.fields?.[key] || ''; const errorId = `${id}-validation`;
    let note = $(errorId);
    if (!note) { note = element('p','field-error'); note.id = errorId; target.after(note); }
    note.textContent = message; target.setAttribute('aria-invalid',String(Boolean(message)));
    const descriptions = new Set((target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); descriptions.add(errorId); target.setAttribute('aria-describedby',[...descriptions].join(' '));
    if (message && !first) first = target;
  }
  for (let ancestor = first?.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === 'DETAILS') ancestor.open = true;
  }
  if (first?.id === 'interest-options') first.querySelector('input')?.focus(); else first?.focus();
}
function benefitCard(benefit) {
  const card = element('div', 'benefit-card');
  card.append(element('span', 'small-label', '가상 혜택, 신청 불가'), element('strong', '', benefit.title), element('span', `benefit-status ${benefit.status}`, benefit.statusLabel));
  card.append(reasonBlock('비교 이유',benefit.reasons.join(' ')));
  const details = element('details'); details.append(element('summary', '', '조건 살펴보기'));
  const conditions = metaText(Array.isArray(benefit.conditions) ? benefit.conditions.join(', ') : benefit.conditions);
  details.append(element('p', '', conditions), element('p', 'muted', `예시 사용 기간 ${benefit.startsOn} ~ ${benefit.endsOn}`), element('p', 'muted', metaText(benefit.sourceLabel))); card.append(details); return card;
}
function renderRegions() {
  const grid = $('region-grid'); grid.replaceChildren();
  const actual = !state.comparison || DEPARTURES.some((departure) => departure.id === state.comparison.trip.departureId);
  $('region-sort').closest('.sort-control').hidden = actual;
  $('official-benefits').closest('details').hidden = actual;
  if (!state.comparison || state.comparisonDirty) {
    grid.append(emptyState(state.comparisonDirty ? '바뀐 조건으로 다시 비교해 주세요' : '어디로 떠날지 아직 몰라도 괜찮아요', '개인 설정과 이번 여행 조건을 확인한 뒤 ‘지역 비교하기’를 눌러보세요.'));
    return;
  }
  const { profile, trip } = state.comparison;
  const regions = compareRegions(profile, trip, { sort: $('region-sort').value });
  for (const region of regions) {
    if (region.synthetic === false) {
      const choose = button('이 지역에서 여행하기', 'button primary full', () => requestRecommendations(region.regionId), `${region.name} 코스 추천`);
      choose.disabled = state.saving || state.requesting || !region.eligibleExperienceIds.length;
      const card = realRegionCard(region, choose); card.classList.toggle('chosen', state.journey?.regionId === region.regionId && !state.inputDirty); grid.append(card); continue;
    }
    const card = element('article', `region-card${state.journey?.regionId === region.regionId && !state.inputDirty ? ' chosen' : ''}`);
    card.append(element('span', 'small-label', '가상 지역, 이동, 가격 예시'), element('h3', '', region.name), element('p', 'muted', `${region.station}에서 출발하고 돌아와요`));
    if (region.estimate) {
      const stats = element('div', 'region-stats');
      for (const [label, value] of [['가상 총 시간', minutes(region.estimate.totalMinutes)], ['가상 도보', minutes(region.estimate.walkingMinutes)], ['가상 1인 비용', money(region.estimate.costPerPerson)]]) {
        const item = element('div'); item.append(element('small', '', label), element('b', '', value)); stats.append(item);
      }
      card.append(stats);
    }
    const choose = button('이 지역에서 여행하기', 'button primary full', () => requestRecommendations(region.regionId), `${region.name} 코스 추천`);
    choose.disabled = state.saving || state.requesting || !region.eligibleExperienceIds.length;
    card.append(choose);
    const checkLabels = { time: '시간', walking: '도보', budget: '예산' };
    const checkText = Object.entries(region.checks ?? {}).map(([key, value]) => `${checkLabels[key] ?? key}: ${{met:'가상 조건 이내',unmet:'한도 초과',unknown:'미확인'}[value] ?? value}`).join(', ');
    card.append(element('p', region.fitStatus === 'over_limits' ? 'field-error' : 'field-help', checkText));
    card.append(element('p','reason-label','비교 이유'));
    const reasonList = element('ul', 'region-reasons'); region.reasons.forEach((reason) => reasonList.append(element('li', '', reason))); card.append(reasonList);
    const benefits = element('details', 'region-benefit-details'); benefits.append(element('summary', '', '가상 지역 혜택 비교'));
    const benefitList = element('div', 'region-benefits card-divider'); region.benefits.forEach((benefit) => benefitList.append(benefitCard(benefit))); benefits.append(benefitList);
    card.append(benefits); grid.append(card);
  }
}
function compareTrip() {
  if (state.saving || state.requesting) return;
  if (!DEPARTURES.some((departure) => departure.id === $('departure').value)) $('departure').value = DEPARTURES[0].id;
  $('form-error').textContent = ''; $('minutes-error').textContent = ''; $('interests-error').textContent = '';
  showFieldErrors(null); showFieldErrors(null,true);
  try {
    const profile = normalizeProfile(rawProfile()); const trip = normalizeTrip(rawTrip());
    state.comparison = { profile, trip }; state.comparisonDirty = false;
    $('comparison-status').textContent = `${DEPARTURES.find((departure) => departure.id === trip.departureId).label} 출발, ${trip.date}, ${trip.partySize}명, 1인 예산 ${money(trip.budget)}`;
    if (state.run && state.inputDirty) banner('새 조건의 지역 비교가 준비됐어요. 지역을 선택하면 새 코스를 추천합니다. 편집 중인 코스는 당시 조건을 유지합니다.');
    renderRegions(); goScreen('regions');
  } catch (error) {
    $('form-error').textContent = errorText(error); $('minutes-error').textContent = error.fields?.availableMinutes || ''; $('interests-error').textContent = error.fields?.interests || '';
    if (error.name === 'ProfileError') { goScreen('profile'); $('profile-message').textContent = errorText(error); $('profile-message').classList.add('error'); }
    else goScreen('trip');
    const ids = { age:'profile-age', residenceRegion:'profile-residence', studentStatus:'profile-student', interests:'interest-options', departureId:'departure', date:'travel-date', availableMinutes:'minutes', budget:'budget', partySize:'party-size', walkingLimitMinutes:'walking-limit' };
    if (error.name === 'ProfileError') ids.walkingLimitMinutes = 'profile-walking';
    const target = $(ids[Object.keys(error.fields ?? {})[0]] || 'recommend-button');
    if (target.id === 'interest-options') target.querySelector('input')?.focus(); else target.focus();
    showFieldErrors(error,error.name === 'ProfileError');
  }
}
function renderOfficialBenefits() {
  for (const benefit of OFFICIAL_BENEFITS) {
    const card = element('article', 'official-card');
    card.append(element('span', 'small-label', benefit.kind), element('h3', '', benefit.title), element('p', '', benefit.summary), element('p', 'muted', benefit.limitations));
    card.append(element('p', 'field-help', metaText(`${benefit.checkedAt} 자료 확인, ${benefit.verificationLevel === 'body_read' ? '공식 본문 열람' : '공식 검색 색인만 확인'}, ${benefit.statusLabel}`)));
    card.append(officialLink(benefit.url,'공식 안내 확인')); $('official-benefits').append(card);
  }
}
let benefitsRenderedDay = null;
function renderBenefits() {
  try { renderBenefitsContent(); }
  catch {
    $('benefits-count').textContent = '혜택 비교를 표시하지 못했어요. 입력과 필터는 유지됩니다.';
    const error = emptyState('혜택을 다시 불러와 주세요','현재 입력은 유지하고 다시 비교할 수 있어요.'); error.setAttribute('role','alert'); error.append(button('다시 비교','button subtle',renderBenefits)); $('benefits-list').replaceChildren(error);
  }
}
function renderBenefitsContent() {
  const today = seoulToday();
  benefitsRenderedDay = today;
  $('benefits-date').textContent = `${today} 기준`;
  const profile = { ...personalBenefitInput, age:personalBenefitInput.age === '' ? null : Number(personalBenefitInput.age) };
  const validAge = Number.isInteger(profile.age) && profile.age >= 1 && profile.age <= 120;
  const studentLabel = { unspecified:'미입력', student:'대학생', not_student:'대학생 아님' }[profile.studentStatus] ?? '확인 필요';
  const summary = $('benefits-student'); summary.replaceChildren();
  for (const [label,value,self] of [['나이',validAge ? `만 ${profile.age}세` : profile.age === null ? '미입력' : '확인 필요',false],['거주',profile.residenceRegion || '미입력',false],['학생',studentLabel,true]]) {
    const cell = element('div','condition-cell'); const term = element('dt','condition-label',label); const detail = element('dd','condition-value',value);
    if (self) detail.append(element('small','self-report','본인 입력'));
    cell.append(term,detail); summary.append(cell);
  }
  $('benefits-input-note').textContent = personalBenefitInputSaved ? '저장한 내 설정으로 비교해요.' : '현재 조건으로 비교해요. 다음에도 쓰려면 저장해 주세요.';
  $('benefits-save-profile').hidden = personalBenefitInputSaved;
  const studentOnly = $('benefit-student-route').getAttribute('aria-pressed') === 'true';
  const items = selectBenefits({ category:$('benefit-category').value, status:$('benefit-state').value, today }).filter((item) => !studentOnly || hasStudentRoute(item));
  const ranked = rankBenefits(items, profile, {today});
  $('student-filter-note').hidden = !studentOnly;
  $('student-filter-note').textContent = '공식 학생 조건이 있는 혜택이에요. 신청할 때 학적 확인이 필요할 수 있어요.';
  const matchFilter = $('benefit-match').value;
  const visible = ranked.filter(({match}) => matchFilter === 'all' || match.status === matchFilter);
  const counts = Object.fromEntries(['candidate','needs_info','not_matched','not_current'].map((key) => [key,ranked.filter(({match})=>match.status===key).length]));
  $('benefits-count').textContent = `혜택 ${visible.length}개`;
  $('benefit-in-period').setAttribute('aria-pressed',String($('benefit-state').value === 'in_period'));
  const shortcuts = $('benefit-shortcuts'); shortcuts.replaceChildren();
  for (const [value,label] of [['all','전체'],['candidate','후보'],['needs_info','확인 필요'],['not_matched','조건 불일치'],['not_current','기간 아님']]) {
    const chip = button(`${label} ${value === 'all' ? ranked.length : counts[value]}`, 'filter-chip', () => { $('benefit-match').value = value; renderBenefits(); document.querySelector(`#benefit-shortcuts [data-match="${value}"]`)?.focus(); });
    chip.dataset.match = value; chip.setAttribute('aria-pressed',String(matchFilter === value)); shortcuts.append(chip);
  }
  const list = $('benefits-list'); list.replaceChildren();
  if (!visible.length) { const empty = emptyState('이 조건에 표시할 혜택이 없어요', '개인 설정이나 필터를 확인해 보세요. 관련 혜택 자체가 없다는 뜻은 아닙니다.'); empty.append(button('필터 초기화','button subtle',resetBenefitFilters)); list.append(empty); return; }
  const groupLabels = {candidate:'조건이 맞는 후보',needs_info:'추가 확인이 필요한 혜택',not_matched:'알려진 조건과 다른 혜택',not_current:'현재 공고 기간 외 혜택'};
  let group;
  let previousStatus;
  for (const {benefit,match} of visible) {
    if (match.status !== previousStatus) {
      group = element('section','benefit-match-group');
      group.append(element('h2','match-group-heading',`${groupLabels[match.status]}, ${counts[match.status]}개`));
      list.append(group); previousStatus = match.status;
    }
    const status = benefitStatus(benefit, today);
    const card = element('article', `ticket-card ${match.status}`);
    const heading = element('h3'); const summary = button('', 'ticket-summary', () => {
      expandedBenefitId = expandedBenefitId === benefit.id ? null : benefit.id;
      list.querySelectorAll('.ticket-summary').forEach((node) => {
        const open = node.dataset.benefitId === expandedBenefitId;
        node.setAttribute('aria-expanded',String(open)); $(node.getAttribute('aria-controls')).hidden = !open;
        node.querySelector('.ticket-toggle').textContent = open ? '상세 접기 −' : '상세 펼치기 +';
      });
    }, `${benefit.title} 상세`);
    summary.removeAttribute('aria-label');
    summary.dataset.benefitId = benefit.id; summary.setAttribute('aria-expanded',String(expandedBenefitId === benefit.id)); summary.setAttribute('aria-controls',`detail-${benefit.id}`);
    const topline = element('span','ticket-topline'); topline.append(element('span','small-label',metaText(`${benefit.category}, ${benefit.kind}`)));
    if (hasStudentRoute(benefit)) topline.append(element('span','student-route','학생 경로 있음'));
    const symbols = {candidate:'✓',needs_info:'?',not_matched:'≠',not_current:'◷'};
    summary.append(topline, element('span','ticket-title',benefit.title), element('span',`match-status ${match.status}`,`${symbols[match.status]} ${match.label}`), element('span','reason-label',{candidate:'맞는 이유',needs_info:'확인 이유',not_matched:'다른 조건',not_current:'기간 안내'}[match.status]), element('span','ticket-reason',shortReason(match)), element('span','ticket-toggle',expandedBenefitId === benefit.id ? '상세 접기 −' : '상세 펼치기 +'));
    heading.append(summary); card.append(heading);
    const outside = element('div','ticket-public');
    outside.append(element('strong',`benefit-status ${status.code}`,metaText(status.label)));
    outside.append(element('p','benefit-period',benefit.period ? `${metaText(benefit.period.label)} ${benefit.period.start} ~ ${benefit.period.end}` : '신청 기간은 공식 안내에서 확인해 주세요.'));
    if (benefit.usePeriod) outside.append(element('p','field-help',`사용 기한: ${benefit.usePeriod}`));
    outside.append(element('p','field-help',`${benefit.checkedAt} 자료 확인`), element('p','field-help','신청 가능 여부는 공식 안내에서 확인해 주세요.'));
    card.append(outside);
    const detail = element('div','ticket-detail'); detail.id = `detail-${benefit.id}`; detail.hidden = expandedBenefitId !== benefit.id;
    detail.append(element('p','',benefit.summary), reasonBlock('대상 조건',metaText(benefit.eligibility)));
    detail.append(element('p','reason-label',{candidate:'맞는 이유',needs_info:'확인 이유',not_matched:'다른 조건',not_current:'기간 안내'}[match.status]));
    const reasons = element('ul','match-reasons'); match.reasons.forEach((reason) => reasons.append(element('li','',reason))); detail.append(reasons);
    detail.append(button('조건 비교 전체 보기','text-button',() => openBenefitEvidence(benefit,match,today)));
    if (match.remainingChecks.length) { detail.append(element('h4','benefit-detail-heading','신청 전 남은 확인')); const pending = element('ul'); match.remainingChecks.forEach((check)=>pending.append(element('li','',check))); detail.append(pending); }
    detail.append(element('p','muted',benefit.limitations),element('p','field-help',`${benefit.provider}, ${benefit.verificationLevel === 'body_read' ? '공식 본문 확인' : '공식 검색 색인만 확인'}. 확인일 이후 공고가 변경됐을 수 있어요.`));
    detail.append(officialLink(benefit.url,'공식 안내에서 조건 확인'));
    if (benefit.matchSourceUrl && benefit.matchSourceUrl !== benefit.url) detail.append(officialLink(benefit.matchSourceUrl,'조건 비교의 공식 근거'));
    card.append(detail);
    group.append(card);
  }
}
function officialLink(url,label) { const link = element('a','text-button',`${label} (새 창)`); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
function openBenefitEvidence(benefit,match,today) {
  const content = $('evidence-content'); content.replaceChildren();
  const title = element('h2','',benefit.title); title.id = 'evidence-heading'; title.tabIndex = -1;
  content.append(element('span','eyebrow','WHY THIS TICKET'),title,element('p',`match-status ${match.status}`,match.label),element('p','',metaText(benefitStatus(benefit,today).label)),element('h3','','개인 조건 비교'));
  const checks = element('ul'); const labels = {met:'맞음',unmet:'불일치',unknown:'확인 필요',not_used:'비교 조건 없음'};
  match.checks.forEach((check) => { const row = element('li'); row.append(reasonBlock(labels[check.result] ?? '확인 필요',check.message)); checks.append(row); }); content.append(checks,element('h3','','남은 확인'));
  const remaining = element('ul'); match.remainingChecks.forEach((check) => remaining.append(element('li','',check))); content.append(remaining);
  if (benefit.period) content.append(element('p','',`${benefit.period.label}: ${benefit.period.start} ~ ${benefit.period.end}`));
  content.append(element('p','field-help',`${benefit.checkedAt} 자료 확인, 개인 수혜 확정이 아니에요.`),officialLink(benefit.matchSourceUrl || benefit.url,'공식 조건 확인'),button('비교 조건 수정','button subtle full',() => { $('evidence-dialog').close(); editBenefitInput(); }));
  $('evidence-dialog').showModal(); title.focus();
}

function validateConditionDraft() {
  conditionDraft = {age:$('condition-age').value,residenceRegion:$('condition-residence').value,studentStatus:document.querySelector('[name="condition-student"]:checked')?.value ?? 'unspecified'};
  let error = '';
  try { normalizeProfile({...DEFAULT_PROFILE,...conditionDraft}); if ($('condition-age').validity.badInput) throw new Error('invalid number'); }
  catch (issue) { error = issue.fields?.age || '만 나이는 1~120 사이 정수로 입력하거나 비워 두세요.'; }
  $('condition-age-error').textContent = error ? `ⓘ ${error}` : ''; $('condition-age').setAttribute('aria-invalid',String(Boolean(error)));
  return !error;
}
function applyConditionDraft(save) {
  if (!validateConditionDraft()) { $('condition-error').textContent = '만 나이를 고친 뒤 다시 눌러 주세요. 입력한 다른 값은 그대로 있어요.'; $('condition-age').focus(); return; }
  const next = {...conditionDraft};
  try {
    if (save) profileStore.save(normalizeProfile({...personalPreferences,...next}));
    const changed = Object.keys(next).some((key) => next[key] !== personalBenefitInput[key]);
    personalBenefitInput = next; personalBenefitInputSaved = save; conditionDraft = null;
    const restored = restoreBenefitInput();
    if (changed && !restored) inputsChanged();
    $('profile-message').textContent = save ? '이 브라우저에 개인 설정을 저장했어요.' : '혜택 비교에 적용했어요. 변경한 설정은 아직 따로 저장하지 않았어요.';
    $('profile-message').classList.remove('error'); $('benefit-condition-sheet').close(); renderBenefits();
  } catch (error) { $('condition-error').textContent = `${errorText(error)} 입력한 초안은 유지됩니다. 이번 비교에만 적용할 수도 있어요.`; }
}
function resetBenefitFilters() {
  $('benefit-category').value = 'all'; $('benefit-state').value = 'all'; $('benefit-match').value = 'all'; $('benefit-student-route').setAttribute('aria-pressed','false');
  document.querySelectorAll('[data-benefit-category]').forEach((chip) => chip.setAttribute('aria-pressed',String(chip.dataset.benefitCategory === 'all')));
  renderBenefits(); $('benefits-heading').focus();
}
function renderJourney(snapshot, activityEstimate = null) {
  const root = $('journey-summary'); root.replaceChildren();
  if (!snapshot && !activityEstimate) return;
  if (isRealJourney(snapshot)) { root.append(realJourneySummary(snapshot)); return; }
  root.append(element('p', 'route-verification', '실제 이동·운영 정보는 미확인입니다.'));
  if (snapshot) {
    root.append(element('p', 'route-limits', `가상 활동 ${minutes(snapshot.estimate.activityMinutes)}, 입력 가능 시간 ${minutes(snapshot.tripSnapshot.availableMinutes)}, 걷기 한도 ${minutes(snapshot.tripSnapshot.walkingLimitMinutes)}, ${snapshot.tripSnapshot.partySize}명 합계 ${money(snapshot.estimate.totalCost)}`));
    if (Object.values(snapshot.checks).includes('unmet')) root.append(element('p', 'field-error route-alert', '입력한 시간·도보·예산 중 한도를 넘은 항목이 있어요. 아래 확인 사항을 살펴보세요.'));
    if (snapshot.estimate.totalMinutes === null || snapshot.estimate.walkingMinutes === null) root.append(element('p', 'field-help route-alert', '일부 가상 구간 정보가 없어 총시간·총도보는 미확인으로 남겨 두었어요.'));
  } else root.append(element('p', 'field-help', '이전 코스에는 역·구간·비용 자료가 없어요. 활동 시간만 표시하며 이동이나 비용을 새로 추정하지 않아요.'));
  const details = element('details', 'course-detail');
  details.append(element('summary', '', snapshot ? '가상 동선·혜택의 확인 사항' : '활동 시간과 확인 사항'));
  const warnings = element('ul', 'route-warnings');
  (snapshot?.warnings ?? activityEstimate.warnings).forEach((text) => warnings.append(element('li', '', text))); details.append(warnings);
  if (snapshot) {
    details.append(element('h3', '', '함께 저장할 가상 혜택 조건'), element('p', 'field-help', '당시 입력 조건의 비교 예시입니다. 실제 혜택 안내와 별개이며 비용에서 차감하지 않았어요.'));
    snapshot.benefits.forEach((benefit) => details.append(benefitCard(benefit)));
  }
  root.append(details);
}

// Original geometric illustrations: no photography, real place imagery, or external assets.
function illustration(art) {
  const palette = { garden: ['#e4e9d9','#8da77c'], library: ['#eae3d4','#b6a280'], table: ['#f0e0c7','#c18f67'], gallery: ['#e7e4dd','#99a398'], workshop: ['#e8dcd1','#b98367'], river: ['#dce6df','#91afa6'] };
  const [background, color] = palette[art] || palette.garden;
  const drawings = {
    garden: '<path d="M0 130Q80 80 180 130T380 100V180H0" fill="#c5d1af"/><path d="M160 180Q220 150 195 120T216 70" fill="none" stroke="#f5e9c6" stroke-width="25"/><path d="M76 128V57M54 72l22-44 22 44M48 95l28-45 28 45M54 115l22-37 22 37" stroke="#4e7457" stroke-width="5" fill="#4e7457"/><circle cx="291" cy="53" r="23" fill="#ecbb70"/><path d="M284 143v-35m-18 7q18-25 34 0" stroke="#65845a" stroke-width="5" fill="none"/>',
    library: '<rect x="87" y="35" width="210" height="121" rx="4" fill="#f8f3e7"/><path d="M100 74h182M100 115h182" stroke="#887c61" stroke-width="5"/><path d="M114 45v27m16-31v31m18-25v25m14-30v30m52-25v25m18-29v29m17-24v24m17-31v31M114 86v26m17-29v29m48-26v26m19-31v31m18-28v28m18-20v20m31-26v26" stroke="#779178" stroke-width="11"/><path d="M107 150v-24m20 24v-27m17 27v-29m90 29v-22m17 22v-26" stroke="#bb936f" stroke-width="11"/>',
    table: '<ellipse cx="190" cy="132" rx="116" ry="24" fill="#d4b08b"/><ellipse cx="190" cy="111" rx="108" ry="28" fill="#f7eedb"/><ellipse cx="166" cy="103" rx="44" ry="17" fill="#d7d8bb"/><ellipse cx="166" cy="99" rx="30" ry="12" fill="#7b9471"/><path d="M236 69v36q0 15 20 0V69" fill="#fffdf0"/><path d="M255 76q22 0 4 19" fill="none" stroke="#fffdf0" stroke-width="6"/><path d="M240 57q-12-12 0-22M250 60q-10-15 0-23" stroke="#c5b296" stroke-width="2" fill="none"/>',
    gallery: '<path d="M71 155V35h240v120" fill="#f8f6ed"/><rect x="100" y="54" width="64" height="70" fill="#afac92"/><path d="M105 118V61h54v57" fill="#e6d5b2"/><circle cx="133" cy="84" r="14" fill="#bc805a"/><path d="M110 112l17-20 26 20" fill="#758d78"/><rect x="208" y="57" width="67" height="67" fill="#719483"/><path d="M213 119V62h57v57" fill="#dce3d7"/><path d="M217 110q28-63 48-13" stroke="#acba99" stroke-width="12" fill="none"/><path d="M57 156h268" stroke="#b3b9a7" stroke-width="3"/>',
    workshop: '<ellipse cx="190" cy="139" rx="112" ry="20" fill="#c3aa8c"/><path d="M145 69q-20 27-15 54 7 26 62 1 10-22-13-56" fill="#c2825f"/><ellipse cx="161" cy="68" rx="17" ry="7" fill="#8a563e"/><path d="M213 88q-9 32 2 37 24 13 42-3 5-16-10-34" fill="#eee1bf"/><ellipse cx="229" cy="87" rx="17" ry="6" fill="#baa582"/><path d="M80 136l33-47" stroke="#f5e8cb" stroke-width="9"/><path d="M283 130l12-54" stroke="#6c8d6b" stroke-width="4"/>',
    river: '<circle cx="282" cy="43" r="24" fill="#edc18a"/><path d="M0 112Q85 51 175 107T380 80V180H0" fill="#a6b99c"/><path d="M0 152Q90 91 180 142T380 130V180H0" fill="#609385"/><path d="M5 155q90-47 170-8t180-6M90 176q90-42 180-7" stroke="#d5e1c7" stroke-width="3" fill="none"/><path d="M62 120V64m-15 18 15-25 15 25m-31 18 16-26 16 26" fill="#52785c" stroke="#52785c" stroke-width="5"/>' };
  const node = element('div', 'card-art');
  node.innerHTML = `<svg viewBox="0 0 380 180" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="380" height="180" fill="${background}"/><rect x="22" y="161" width="336" height="1" fill="${color}"/>${drawings[art] || drawings.garden}</svg>`;
  node.append(element('span', 'art-caption', 'A SMALL DISCOVERY'), element('span', 'synthetic-badge', '가상 경험, 시연용')); return node;
}

function renderResults() {
  updateNavigation();
  const grid = $('results-grid'); grid.replaceChildren();
  if (state.inputDirty) {
    $('results-title').textContent = '조건이 바뀌었어요'; $('results-meta').textContent = '';
    const empty = emptyState('새로운 조건으로 찾아보세요', '이전 추천은 숨겼어요. 편집 중인 코스는 이전 조건 그대로 유지됩니다.'); empty.append(button('여행 조건 확인', 'button primary', () => goScreen('trip'))); grid.append(empty); return;
  }
  if (!state.run) {
    $('results-title').textContent = '작은 발견이 기다리고 있어요'; $('results-meta').textContent = '';
    grid.append(emptyState('지금의 나에게 맞는 여행', '상황을 입력하면 경험과 추천 이유를 함께 살펴볼 수 있어요.')); return;
  }
  $('results-title').textContent = state.run.recommendations.length ? '이런 경험은 어때요?' : '조금 다른 조건으로 만나볼까요?';
  $('results-meta').textContent = `${state.run.recommendations.length}개의 ${state.context?.regionId?.startsWith('real-') ? '장소' : '이전 예시 경험'}`;
  if (!state.run.recommendations.length) { grid.append(emptyState('조건에 맞는 경험이 없어요', '시간을 늘리거나 다른 관심·지역을 직접 선택해 보세요. 조건을 자동으로 바꾸지는 않아요.')); return; }
  for (const rec of state.run.recommendations) {
    const experience = EXPERIENCES.find((item) => item.id === rec.experienceId);
    if (!experience) continue;
    const selected = state.ids.includes(experience.id);
    const card = element('article', `experience-card${selected ? ' selected' : ''}`);
    const body = element('div', 'card-body'); const meta = element('div', 'card-meta');
    meta.append(element('span', '', experience.region), element('span', '', `${experience.synthetic === false ? '머무를 계획' : '예시 활동'} ${experience.durationMinutes}분`));
    const reason = reasonBlock('추천 이유',rec.reasons[0].summary); reason.classList.add('reason-preview');
    body.append(meta, element('h3', '', experience.title), element('p', 'card-summary', experience.summary), reason);
    const actions = element('div', 'card-actions');
    actions.append(button('장소 자세히', 'text-button', () => openEvidence(experience, rec.reasons), `${experience.title} 장소 자세히`));
    const toggle = button(selected ? '✓ 담았어요' : '+ 코스에 담기', 'add-button', () => {
      if (state.inputDirty || state.saving || state.requesting) return;
      state.ids = selected ? state.ids.filter((id) => id !== experience.id) : [...state.ids, experience.id];
      markDirty(); renderResults(); renderCourse();
      $('selection-notice').textContent = `${experience.title} ${selected ? '뺐어요' : '담았어요'}. 지금 ${state.ids.length}개의 경험을 담았어요.`;
      [...document.querySelectorAll('.add-button')].find((node) => node.dataset.experienceId === experience.id)?.focus();
    }, `${experience.title} ${selected ? '코스에서 빼기' : '코스에 담기'}`);
    toggle.dataset.experienceId = experience.id; toggle.setAttribute('aria-pressed', String(selected)); toggle.disabled = state.saving || state.requesting; actions.append(toggle); body.append(actions); if (experience.synthetic !== false) card.append(illustration(experience.art)); card.append(body); grid.append(card);
  }
}

function openEvidence(experience, reasons = []) {
  const content = $('evidence-content'); content.replaceChildren();
  if (experience.synthetic === false) { content.append(realPlaceDetails(experience, reasons), fieldReportsSection(experience)); $('evidence-dialog').showModal(); $('evidence-heading').focus(); return; }
  content.append(element('span', 'small-label', '가상 데이터, 시연용'), element('h2', '', experience.title));
  content.lastElementChild.id = 'evidence-heading';
  content.append(element('p', 'intro', `${experience.region}, 실제 장소·방문 후기가 아닙니다.`));
  content.append(element('h3', '', '이 상황에 추천한 이유'));
  if (reasons.length) {
    for (const reason of reasons) {
      const block = element('div', 'evidence-block'); block.append(element('p', '', reason.summary)); content.append(block);
    }
  } else content.append(element('p', '', '사용자가 고른 경험입니다. 아래 가상 자료를 참고해 코스에 담았습니다.'));
  content.append(element('h3', '', '가상 카드에 설정한 방문 조건'), element('p', '', metaText(experience.visitContext)));
  for (const [heading, items] of [['좋았던 점으로 설정한 내용', experience.positives], ['아쉬운 점·주의할 조건', experience.drawbacks]]) {
    content.append(element('h3', '', heading)); const list = element('ul'); items.forEach((text) => list.append(element('li', '', text))); content.append(list);
  }
  content.append(element('h3', '', '근거 원문과 출처'));
  for (const evidence of experience.evidence) {
    const block = element('div', 'evidence-block'); block.append(element('p', '', evidence.claim), element('p', 'muted', metaText(evidence.sourceLabel))); content.append(block);
  }
  content.append(element('p', 'disclaimer', '실제 관측·방문 확인 자료가 없습니다. 현재 영업·가격·대기·이동 시간·방문 안전은 확인 필요이며, 이 가상 자료로 판단할 수 없어요.'));
  $('evidence-dialog').showModal();
}

function getDraft() { return buildCourseDraft({ title: $('course-title').value, experienceIds: state.ids, context: state.context, requestId: state.run?.requestId || state.savedSnapshot?.sourceRequestId, journey: state.journey }); }
function renderCourseOverview(snapshot, activityMinutes, error = null) {
  const overview = $('estimate'); overview.replaceChildren(); overview.className = 'course-overview';
  const values = snapshot
    ? [[isRealJourney(snapshot) ? '계획 총시간' : '가상 총시간', minutes(snapshot.estimate.totalMinutes)], [isRealJourney(snapshot) ? '머무를 시간' : '가상 도보', minutes(isRealJourney(snapshot) ? snapshot.estimate.activityMinutes : snapshot.estimate.walkingMinutes)], ['1인 예상', money(snapshot.estimate.costPerPerson)]]
    : [['활동 합계', minutes(activityMinutes)], ['총 이동', '미확인'], ['1인 예상', '미확인']];
  const list = element('dl', 'overview-values');
  values.forEach(([label, value]) => { const cell = element('div', 'overview-cell'); cell.append(element('dt', '', label), element('dd', '', value)); list.append(cell); });
  overview.append(list);
  if (error) overview.append(element('p', 'field-error', error.message));
}
function courseExperienceRow(id, index) {
  const source = state.savedSnapshot?.orderedItems.find((item) => item.experienceId === id)?.displaySnapshot ?? EXPERIENCES.find((item) => item.id === id);
  const row = element('li', 'course-item route-experience');
  const marker = element('span', 'route-marker'); marker.setAttribute('aria-hidden', 'true');
  const info = element('div', 'course-item-info'); info.append(element('b', '', source.title));
  const meta = element('div', 'course-experience-meta');
  const thumbnail = { 'demo-garden':'/assets/garden.png', 'demo-library':'/assets/bookstore.png' }[id];
  if (thumbnail) { const image = element('img', 'course-thumb'); image.src = thumbnail; image.alt = ''; image.width = 64; image.height = 48; image.loading = 'lazy'; meta.append(image); }
  meta.append(element('small', '', `${source.synthetic === false ? '머무를 계획' : '이전 예시 경험, 활동'} ${source.durationMinutes}분`)); info.append(meta);
  const controls = element('div', 'item-controls');
  const move = (offset) => {
    if (state.saving || state.requesting || index + offset < 0 || index + offset >= state.ids.length) return;
    const next = [...state.ids]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; state.ids = next; markDirty(); renderCourse();
    $('course-order-notice').textContent = `${source.title}, ${index + offset + 1}번째로 옮겼어요.`;
    const focusTarget = [...document.querySelectorAll('[data-course-detail]')].find((node) => node.dataset.courseDetail === id);
    if (focusTarget) focusTarget.focus({preventScroll:true});
  };
  const up = button('위로', 'icon-button', () => move(-1), `${source.title} 위로`); up.disabled = index === 0 || state.saving || state.requesting;
  const down = button('아래로', 'icon-button', () => move(1), `${source.title} 아래로`); down.disabled = index === state.ids.length - 1 || state.saving || state.requesting;
  up.setAttribute('aria-disabled', String(up.disabled)); down.setAttribute('aria-disabled', String(down.disabled));
  const remove = button('빼기', 'icon-button', () => {
    if (state.saving || state.requesting) return;
    const nextId = state.ids[index + 1] ?? state.ids[index - 1];
    state.ids = state.ids.filter((item) => item !== id); markDirty(); renderCourse(); renderResults();
    $('course-order-notice').textContent = `${source.title}을 코스에서 뺐어요.`;
    const nextControl = [...document.querySelectorAll('[data-course-detail]')].find((node) => node.dataset.courseDetail === nextId);
    (nextControl ?? $('course-back-experiences')).focus();
  }, `${source.title} 제거`); remove.disabled = state.saving || state.requesting;
  const details = button('상세', 'icon-button', () => {
    const saved = state.savedSnapshot?.orderedItems.find((item) => item.experienceId === id);
    if (saved) openEvidence({ ...saved.displaySnapshot, evidence: saved.evidence }, saved.reasons || []);
    else openEvidence(source, state.run?.recommendations.find((item) => item.experienceId === id)?.reasons || []);
  }, `${source.title} ${source.synthetic === false ? '장소 자세히' : '저장 근거 보기'}`);
  details.dataset.courseDetail = id;
  details.disabled = state.saving || state.requesting;
  controls.append(details, up, down, remove);
  const editing = element('div', 'course-edit-actions'); editing.append(controls);
  row.append(marker, info, editing); return row;
}
function courseStationRow(label, note) {
  const row = element('li', 'route-stop'); const marker = element('span', 'route-marker'); marker.setAttribute('aria-hidden', 'true');
  const info = element('div', 'route-stop-info'); info.append(element('b', 'route-stop-title', label), element('small', 'route-stop-note', note)); row.append(marker, info); return row;
}
function renderCourseTimeline(snapshot) {
  if (isRealJourney(snapshot)) {
    $('course-items').append(realTimeline(snapshot, {
      station: courseStationRow, experience: courseExperienceRow, busy: state.saving || state.requesting,
      updateTime(id, value) {
        if (state.saving || state.requesting) return;
        const travelOverrides = {...state.journey.travelOverrides};
        if (value === null) delete travelOverrides[id]; else travelOverrides[id] = {minutes:value};
        state.journey = {...state.journey, travelOverrides}; markDirty(); renderCourse();
        const input = [...document.querySelectorAll('[data-leg-id]')].find((node) => node.dataset.legId === id);
        if (input) { input.closest('details').open = true; input.focus({preventScroll:true}); }
        $('course-order-notice').textContent = value === null ? '이 구간을 미확인으로 바꿨어요.' : `이 구간에 ${value}분을 반영했어요.`;
      },
    })); return;
  }
  const timeline = element('ol', 'course-timeline'); timeline.setAttribute('aria-label', snapshot ? '가상 여행 동선과 경험 순서' : '선택한 가상 경험 순서');
  if (!snapshot) state.ids.forEach((id, index) => timeline.append(courseExperienceRow(id, index)));
  else {
    timeline.append(courseStationRow(snapshot.legs[0].from, '여행을 시작하는 가상 출발역이에요.'));
    let pendingLegs = [];
    snapshot.legs.forEach((leg, legIndex) => {
      pendingLegs.push(leg);
      const experienceIndex = state.ids.findIndex((id) => EXPERIENCES.find((item) => item.id === id)?.title === leg.to);
      if (experienceIndex === -1 && legIndex !== snapshot.legs.length - 1) return;
      const connection = element('li', `route-connection${pendingLegs.some((item) => item.minutes === null) ? ' route-unknown' : ''}`);
      const marker = element('span', `route-marker route-marker-${pendingLegs[0].mode}`); marker.setAttribute('aria-hidden', 'true');
      const info = element('div', 'route-connection-info');
      const modes = pendingLegs.map((item) => `${item.mode === 'walk' ? '도보' : '대중교통'}, ${item.minutes === null ? '구간 시간 미확인' : `가상 ${minutes(item.minutes)}`}`).join(' / ');
      const path = [pendingLegs[0].from, ...pendingLegs.map((item) => item.to)].join(' → ');
      info.append(element('span', 'route-mode', modes), element('small', 'route-leg-caption', path));
      connection.append(marker, info); timeline.append(connection); pendingLegs = [];
      if (experienceIndex !== -1) timeline.append(courseExperienceRow(state.ids[experienceIndex], experienceIndex));
      else if (legIndex === snapshot.legs.length - 1) timeline.append(courseStationRow(leg.to, '출발역으로 돌아오는 가상 도착역이에요.'));
    });
  }
  $('course-items').append(timeline);
}
function renderCourse() {
  updateNavigation();
  const real = state.journey?.regionId?.startsWith('real-') === true;
  $('acknowledge').closest('label').hidden = real;
  const courseLabel = document.querySelector('.course-demo-label');
  if (courseLabel) courseLabel.textContent = real ? '지도에서 확인하고, 내 속도로 다녀오세요.' : '이전 예시 코스';
  const stationArt = document.querySelector('.course-station-art'); if (stationArt) stationArt.hidden = real;
  $('course-count').textContent = `${state.ids.length}개의 경험`;
  $('course-items').replaceChildren(); $('course-editor').hidden = state.ids.length === 0;
  $('estimate').hidden = state.ids.length === 0;
  $('course-context').textContent = state.context && state.ids.length ? `${contextSummary(state.context)}${state.inputDirty ? ', 이전 입력 조건으로 만든 코스' : ''}` : '추천에서 마음에 드는 경험을 담아보세요.';
  if (!state.ids.length) { $('estimate').replaceChildren(); renderJourney(null); return; }
  let draft = null; let snapshot = null; let draftError = null;
  try {
    draft = state.savedSnapshot ?? getDraft(); snapshot = draft.journeySnapshot;
  } catch (error) {
    draftError = error;
    // An invalid title must not remove the visible route or its editing controls.
    if (state.journey) { try { snapshot = buildJourneySnapshot({ ...state.journey, experienceIds: state.ids }); } catch { /* Preserve unknown data rather than inventing a route. */ } }
  }
  const activityMinutes = draft?.estimate.activityMinutes ?? state.ids.reduce((sum, id) => sum + (EXPERIENCES.find((item) => item.id === id)?.durationMinutes ?? 0), 0);
  renderCourseOverview(snapshot, activityMinutes, draftError); renderCourseTimeline(snapshot);
  renderJourney(snapshot, draft?.estimate ?? { activityMinutes, warnings:['현재 운영정보·가격·방문 안전을 확인하지 않은 가상 시연 초안입니다.'] });
  $('save-course').disabled = state.saving || state.requesting || state.hasSavedCurrent;
  $('save-course').textContent = state.saving ? '저장 중…' : state.hasSavedCurrent ? '✓ 저장했어요' : state.courseId ? '수정한 코스 저장하기' : '코스 저장하기';
  $('course-title').disabled = state.saving || state.requesting; $('new-course').disabled = state.saving || state.requesting;
}

async function requestRecommendations(regionId, confirmed = false) {
  if (state.requesting || state.saving) return;
  if (!state.comparison || state.comparisonDirty) { goScreen('trip'); $('form-error').textContent = '여행 조건이 바뀌었어요. 지역·혜택을 다시 비교해 주세요.'; return; }
  const { profile, trip } = state.comparison;
  const region = compareRegions(profile, trip).find((item) => item.regionId === regionId);
  if (!region) return;
  const context = normalizeContext({ availableMinutes: trip.availableMinutes, interests: profile.interests, regionText: region.name, regionId, date:trip.date, companion: trip.partySize === 1 ? 'solo' : 'together', mobility: 'walk_transit', avoidStairs: trip.avoidStairs });
  if (state.ids.length && !confirmed) { state.pendingRegionId = regionId; $('replace-prompt').hidden = false; $('confirm-replace').focus(); return; }
  $('replace-prompt').hidden = true;
  const revision = ++state.revision; state.requesting = true;
  renderResults(); renderCourse(); renderRegions();
  $('recommend-button').disabled = true; banner('취향과 여행일에 맞는 장소를 고르고 있어요.');
  try {
    // Yield to paint the pending state; this is local computation, never a network/AI request.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const run = recommend(context, {date:trip.date}); validateRecommendation(run);
    if (revision !== state.revision) return;
    state.context = context; state.run = run; state.ids = region.recommendedExperienceIds.filter((id) => run.recommendations.some((item) => item.experienceId === id)); state.courseId = null; state.version = null; state.inputDirty = false; state.journey = { profile, trip, regionId, travelOverrides:{} }; markDirty();
    $('course-title').value = `${region.name}에서 보내는 하루`;
    banner(run.status === 'no_match' ? run.warnings.join(' ') : state.ids.length ? '취향에 맞는 장소를 담았어요. 장소와 순서를 바꿔 나만의 하루를 만들어 보세요.' : '마음에 드는 장소를 직접 담아 보세요.');
    renderResults(); renderCourse(); renderRegions(); goScreen('experiences', { allowBusy:true });
  } catch (error) { if (revision === state.revision) { state.run = null; renderResults(); $('comparison-status').textContent = error.message || '추천을 준비하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.'; } }
  finally { state.requesting = false; $('recommend-button').disabled = false; renderResults(); renderCourse(); renderRegions(); }
}

async function refreshSaved() {
  try {
    const courses = await store.list(); $('saved-count').textContent = courses.length; $('storage-error').textContent = ''; $('saved-list').replaceChildren();
    if (!courses.length) { const empty = emptyState('아직 담아 둔 여행이 없어요', '추천에서 마음에 드는 경험을 골라 첫 코스를 저장해 보세요.'); empty.append(button('경험 발견하러 가기', 'button primary', () => setView('discover'))); const row = element('li'); row.append(empty); $('saved-list').append(row); }
    for (const course of courses) {
      const row = element('li'); const card = element('a', 'saved-card'); card.href = '#course'; card.setAttribute('aria-label',`${course.title} ${isRealJourney(course.journeySnapshot) ? '코스 다시 열기' : '코스와 근거 다시 열기'}`);
      card.addEventListener('click',(event) => { event.preventDefault(); loadCourse(course.id); });
      const real = isRealJourney(course.journeySnapshot);
      card.append(element('span', 'small-label', real ? '이 기기에 저장한 여행' : '이전 예시 코스'), element('h2', '', course.title), element('p', 'saved-meta', new Date(course.savedAt).toLocaleString('ko-KR')), element('p', 'muted', contextSummary(course.contextSnapshot)));
      const list = element('ol'); course.orderedItems.forEach((item) => list.append(element('li', '', item.displaySnapshot.title))); card.append(list);
      if (real) card.append(element('p', 'muted', `${course.journeySnapshot.tripSnapshot.date}, ${course.journeySnapshot.tripSnapshot.partySize}명, 계획 총시간 ${minutes(course.journeySnapshot.estimate.totalMinutes)}`));
      else if (course.journeySnapshot) card.append(element('p', 'muted', `${course.journeySnapshot.tripSnapshot.date}, ${course.journeySnapshot.tripSnapshot.partySize}명, 예시 도보 ${minutes(course.journeySnapshot.estimate.walkingMinutes)}`), element('p', 'field-help', '실제 장소와 이동 정보가 아닌 이전 예시입니다.'));
      else card.append(element('p', 'field-help', '이전 버전 코스, 개인 설정·지역 혜택 정보 없음'));
      card.append(element('p', 'muted', `${real ? '머무를 계획' : '예시 활동'} ${course.estimate.activityMinutes}분`), element('span','text-button','코스 다시 열기')); row.append(card); $('saved-list').append(row);
    }
  } catch (error) { $('saved-count').textContent = '—'; $('storage-error').textContent = error.message; const row = element('li'); row.append(emptyState('저장된 자료를 읽지 못했어요', '자료를 자동으로 지우거나 덮어쓰지 않았어요. 브라우저 저장 설정을 확인한 뒤 다시 열어주세요.'),button('다시 읽기','button subtle',refreshSaved)); $('saved-list').replaceChildren(row); }
}
function setView(view) {
  goScreen(view === 'saved' ? 'saved' : 'home');
}
async function loadCourse(id) {
  if (state.saving) return;
  try {
    const course = await store.get(id); if (!course) throw new Error('이 코스를 찾을 수 없어요. 목록을 다시 확인해 주세요.');
    state.revision += 1; state.context = course.contextSnapshot; state.ids = course.orderedItems.map((item) => item.experienceId); state.courseId = course.id; state.version = course.version;
    state.run = recommend(state.context, { requestId: course.sourceRequestId, contractVersion:course.contractVersion, date:course.journeySnapshot?.tripSnapshot.date }); state.savedSnapshot = course; state.inputDirty = false; state.saveKey = null; state.hasSavedCurrent = true;
    const journey = course.journeySnapshot;
    state.journey = journey ? { profile: journey.profileSnapshot, trip: journey.tripSnapshot, regionId: journey.regionId, travelOverrides:journey.travelOverrides ?? {} } : null;
    state.comparison = journey ? { profile: journey.profileSnapshot, trip: journey.tripSnapshot } : null; state.comparisonDirty = false;
    if (journey) { fillProfile(journey.profileSnapshot); fillTrip(journey.tripSnapshot); $('profile-message').textContent = '코스에 보관한 당시 설정을 표시합니다. 따로 저장한 개인 설정은 변경하지 않았어요.'; $('profile-message').classList.remove('error'); } else fillContext(state.context);
    $('comparison-status').textContent = journey ? '저장한 여행의 조건이에요.' : '';
    $('course-title').value = course.title; $('acknowledge').checked = false; $('replace-prompt').hidden = true;
    renderResults(); renderCourse(); renderRegions(); goScreen('course'); banner('저장한 코스를 다시 열었어요. 내 설정은 그대로 유지됩니다.');
    saveMessage('저장한 코스예요. 순서나 이름을 바꾼 뒤 다시 저장할 수 있어요.');
  } catch (error) { $('storage-error').textContent = error.message; }
}
async function saveCourse() {
  if (state.saving || state.requesting || state.hasSavedCurrent) return;
  let draft;
  try { draft = getDraft(); if (!isRealJourney(draft.journeySnapshot) && !$('acknowledge').checked) { saveMessage('이전 예시 코스의 안내를 확인한 뒤 체크해 주세요.', true); $('acknowledge').focus(); return; } }
  catch (error) { saveMessage(error.message, true); if (error.fields?.title) { $('course-title').closest('details').open = true; $('course-title').focus(); } return; }
  state.saveKey ??= crypto.randomUUID(); state.saving = true; renderCourse(); renderResults(); saveMessage('여행을 저장하고 있어요…');
  try {
    const result = await store.save({ draft, courseId: state.courseId || undefined, expectedVersion: state.version || undefined, clientSaveKey: state.saveKey, acknowledgeWarnings: true });
    const reopened = await store.get(result.id);
    if (!reopened || JSON.stringify(reopened) !== JSON.stringify(result)) throw new Error('저장 후 확인에 실패했어요. 초안을 유지합니다. 저장한 코스 목록을 확인해 주세요.');
    state.courseId = result.id; state.version = result.version; state.savedSnapshot = result; state.hasSavedCurrent = true; state.saveKey = null;
    saveMessage('저장했어요. ‘저장한 코스’에서 언제든 다시 열 수 있어요.');
    $('saved-notice-text').textContent = `‘${result.title}’ 코스를 이 브라우저에 저장했어요.`; $('saved-notice').hidden = false;
    goScreen('saved',{allowBusy:true});
  } catch (error) { saveMessage(error.message || '저장하지 못했어요. 초안은 유지됩니다.', true); }
  finally { state.saving = false; renderCourse(); renderResults(); }
}

RESIDENCE_REGIONS.forEach((region) => { for (const id of ['profile-residence','condition-residence']) { const option = element('option', '', region); option.value = region; $(id).append(option); } });
DEPARTURES.forEach(({ id, label }) => { const option = element('option', '', label); option.value = id; $('departure').append(option); });
INTERESTS.forEach(({ id, label }) => { const wrapper = element('label', 'interest-option'); const input = element('input'); input.type = 'checkbox'; input.name = 'interests'; input.autocomplete = 'off'; input.value = id; input.checked = ['nature', 'quiet'].includes(id); wrapper.append(input, element('span', '', label)); $('interest-options').append(wrapper); });
try { const savedProfile = profileStore.load(); fillProfile(savedProfile ?? DEFAULT_PROFILE); captureBenefitInput(Boolean(savedProfile)); $('walking-limit').value = (savedProfile ?? DEFAULT_PROFILE).walkingLimitMinutes; if (savedProfile) $('profile-message').textContent = '이 브라우저에 저장한 설정을 불러왔어요.'; }
catch (error) { fillProfile(DEFAULT_PROFILE); captureBenefitInput(); $('profile-message').textContent = error.message; $('profile-message').classList.add('error'); }
capturePreferences();
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
$('travel-date').value = ['year','month','day'].map((type) => dateParts.find((part) => part.type === type).value).join('-');
function inputsChanged() {
  state.revision += 1; state.comparisonDirty = true; $('replace-prompt').hidden = true; $('comparison-status').textContent = '';
  renderRegions(); updateNavigation();
  if (state.run || state.requesting) { state.inputDirty = true; banner('입력 조건이 바뀌었어요. 지역·혜택을 다시 비교해 주세요. 편집 중인 코스는 당시 조건을 유지합니다.'); renderResults(); renderCourse(); }
}
$('context-form').addEventListener('submit', (event) => { event.preventDefault(); compareTrip(); });
$('context-form').addEventListener('input', inputsChanged);
$('walking-limit').addEventListener('input', () => { state.walkingCustomized = true; });
$('profile-form').addEventListener('input', (event) => { if (['profile-age','profile-residence','profile-student'].includes(event.target.id)) captureBenefitInput(); capturePreferences(); inputsChanged(); $('profile-message').textContent = '변경한 설정은 아직 따로 저장하지 않았어요.'; });
$('profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showFieldErrors(null,true);
  try { profileStore.save(normalizeProfile(rawProfile())); captureBenefitInput(true); capturePreferences(); $('profile-message').textContent = '이 브라우저에 개인 설정을 저장했어요.'; $('profile-message').classList.remove('error'); }
  catch (error) { $('profile-message').textContent = errorText(error); $('profile-message').classList.add('error'); showFieldErrors(error,true); }
});
$('profile-next').addEventListener('click', () => {
  showFieldErrors(null,true);
  try { const profile = normalizeProfile(rawProfile()); if (!state.walkingCustomized && $('walking-limit').value !== String(profile.walkingLimitMinutes)) { $('walking-limit').value = profile.walkingLimitMinutes; inputsChanged(); } goScreen('trip'); }
  catch (error) { $('profile-message').textContent = errorText(error); $('profile-message').classList.add('error'); showFieldErrors(error,true); }
});
$('clear-profile').addEventListener('click', () => {
  try { profileStore.clear(); fillProfile(DEFAULT_PROFILE); captureBenefitInput(); capturePreferences(); inputsChanged(); $('profile-message').classList.remove('error'); $('profile-message').textContent = '따로 저장한 설정을 지웠어요. 저장한 코스의 당시 입력과 코스 내용은 그대로 유지됩니다.'; }
  catch (error) { $('profile-message').textContent = error.message; $('profile-message').classList.add('error'); }
});
$('region-sort').addEventListener('change', renderRegions);
$('confirm-replace').addEventListener('click', () => requestRecommendations(state.pendingRegionId, true));
$('cancel-replace').addEventListener('click', () => {
  $('replace-prompt').hidden = true;
  if (state.context) {
    if (state.journey) { fillProfile(state.journey.profile); fillTrip(state.journey.trip); state.comparison = { profile: state.journey.profile, trip: state.journey.trip }; state.comparisonDirty = false; }
    else { fillContext(state.context); state.comparison = null; }
    state.inputDirty = false; renderRegions(); renderResults(); renderCourse(); goScreen('course'); banner('편집 중인 코스의 입력 조건으로 돌아왔어요.');
  }
});
$('course-title').addEventListener('input', () => { markDirty(); renderCourse(); });
$('acknowledge').addEventListener('change', () => saveMessage());
$('save-course').addEventListener('click', saveCourse);
$('new-course').addEventListener('click', () => { if (state.saving || state.requesting) return; state.ids = []; state.courseId = null; state.version = null; markDirty(); $('course-title').value = '나의 작은 여행'; renderCourse(); renderResults(); goScreen('trip'); });
$('discover-tab').addEventListener('click', () => setView('discover'));
$('saved-tab').addEventListener('click', () => setView('saved'));
$('profile-tab').addEventListener('click', () => goScreen('settings'));
$('home-resume').addEventListener('click', () => goScreen(state.lastTravelScreen));
$('benefits-tab').addEventListener('click', () => goScreen('benefits'));
$('benefits-edit-profile').addEventListener('click', editBenefitInput);
$('benefits-save-profile').addEventListener('click',() => {
  try { profileStore.save(normalizeProfile({...personalPreferences,...personalBenefitInput})); personalBenefitInputSaved = true; $('benefits-profile-message').setAttribute('role','status'); $('benefits-profile-message').textContent = '이 브라우저에 내 설정을 저장했어요.'; renderBenefits(); $('benefits-edit-profile').focus(); }
  catch (error) { $('benefits-profile-message').setAttribute('role','alert'); $('benefits-profile-message').textContent = errorText(error); if (error.fields) { conditionDraft = {...personalBenefitInput}; editBenefitInput(); applyConditionDraft(true); } }
});
$('benefit-category').addEventListener('change', renderBenefits);
$('benefit-state').addEventListener('change', renderBenefits);
$('benefit-match').addEventListener('change', renderBenefits);
$('benefit-student-route').addEventListener('click',() => { const node = $('benefit-student-route'); node.setAttribute('aria-pressed',String(node.getAttribute('aria-pressed') !== 'true')); renderBenefits(); });
$('benefit-in-period').addEventListener('click',() => { $('benefit-state').value = $('benefit-state').value === 'in_period' ? 'all' : 'in_period'; renderBenefits(); });
document.querySelectorAll('[data-benefit-category]').forEach((node) => node.addEventListener('click',() => { $('benefit-category').value = node.dataset.benefitCategory; document.querySelectorAll('[data-benefit-category]').forEach((chip) => chip.setAttribute('aria-pressed',String(chip === node))); renderBenefits(); }));
$('benefit-condition-form').addEventListener('input',() => { $('condition-error').textContent = ''; validateConditionDraft(); });
$('benefit-condition-form').addEventListener('submit',(event) => { event.preventDefault(); applyConditionDraft(true); });
$('apply-condition').addEventListener('click',() => applyConditionDraft(false));
$('clear-condition-age').addEventListener('click',() => { $('condition-age').value = ''; $('condition-error').textContent = ''; validateConditionDraft(); $('condition-age').focus(); });
$('clear-condition-draft').addEventListener('click',() => { $('condition-age').value = ''; $('condition-residence').value = ''; document.querySelector('[name="condition-student"][value="unspecified"]').checked = true; $('condition-error').textContent = ''; validateConditionDraft(); $('condition-age').focus(); });
$('close-condition-sheet').addEventListener('click',() => $('benefit-condition-sheet').close());
$('benefit-condition-sheet').addEventListener('close',() => $('benefits-edit-profile').focus({preventScroll:true}));
function containDialogFocus(dialog) {
  dialog.addEventListener('keydown',(event) => {
    if (event.key !== 'Tab') return;
    const targets = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter((node) => node.getClientRects().length);
    const first = targets[0]; const last = targets.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}
containDialogFocus($('benefit-condition-sheet')); containDialogFocus($('evidence-dialog'));
$('dismiss-saved-notice').addEventListener('click',() => { $('saved-notice').hidden = true; $('saved-view').querySelector('h1').focus(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.screen === 'benefits') renderBenefits(); });
setInterval(() => { if (!document.hidden && state.screen === 'benefits' && benefitsRenderedDay !== seoulToday()) renderBenefits(); }, 60_000);
$('view-saved').addEventListener('click', () => goScreen('saved'));
$('course-shortcut').addEventListener('click', () => goScreen('course'));
$('course-back-experiences').addEventListener('click', () => goScreen('experiences'));
$('app-back').addEventListener('click', () => goScreen(state.screen === 'saved' && state.travelStarted ? state.lastTravelScreen : parentScreen(state.screen)));
$('skip-main').addEventListener('click', (event) => { event.preventDefault(); $('main').focus(); });
document.querySelectorAll('[data-screen-target]').forEach((node) => node.addEventListener('click', (event) => {
  event.preventDefault();
  const requested = node.dataset.screenTarget === 'experiences' && availability().hasCourse && !availability().recommendationsReady ? 'course' : node.dataset.screenTarget;
  goScreen(requested);
}));
window.addEventListener('popstate', () => goScreen(location.hash.slice(1) || 'home', { replace:true }));
window.addEventListener('hashchange', () => { if (location.hash !== `#${state.screen}`) goScreen(location.hash.slice(1), { replace:true }); });
$('close-evidence').addEventListener('click', () => $('evidence-dialog').close());
$('evidence-dialog').addEventListener('click', (event) => { if (event.target === $('evidence-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) { refreshSaved(); if (state.courseId) saveMessage('다른 탭에서 저장 내용이 바뀌었을 수 있어요. 현재 초안은 유지됩니다. 최신본은 저장한 코스에서 확인하세요.'); } });
renderRegions(); renderOfficialBenefits(); renderResults(); refreshSaved();
// D27: pet recommendation flow (펫 → 조건 → 추천); choices and results live in memory for this visit only.
petFlow = setupAiFlow({ goScreen, showResults: (result) => { state.aiResults = result; goScreen('ai-results'); } });
// Stage 5: district arrival → 동네 친구 → 현장 질문 → 도감 (the 도감 stays in this browser).
arrivalFlow = setupArrivalFlow({ goScreen, pets: petFlow });
// Stage 6: the living map (Kakao map when KAKAO_JS_KEY is set, lists otherwise).
setupLivingMap({ goScreen, pets: petFlow, arrival: arrivalFlow });
goScreen(location.hash.slice(1) || 'home', { replace:true, focus:false });
