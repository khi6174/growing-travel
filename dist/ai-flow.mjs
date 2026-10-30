import { SEOUL_STATIONS, TIME_SLOTS, WALK_CHOICES, PLACE_TAGS, AGE_GROUPS, STUDENT_STATUSES, MAX_INTERESTS, MAX_DAYS_AHEAD, normalizeConditions, describeConditions } from './ai-conditions.mjs';
import { fieldReportsSection, fetchReports, reportAge } from './field-reports.mjs';

// D26: the AI recommendation flow (조건 → 추천 → 상세 → 현장 제보). Conditions and results stay in memory for this visit only.
const $ = (id) => document.getElementById(id);
const FIELD_IDS = { departure: 'ai-departure', date: 'ai-date', timeSlot: 'ai-time-options', partySize: 'ai-party', walkLevel: 'ai-walk-options', interests: 'ai-interest-options', ageGroup: 'ai-age', studentStatus: 'ai-student' };
const FALLBACK_COPY = {
  not_configured: 'AI 연결이 설정되지 않아 관심사·걷기 정도·거리 기준으로 골랐어요.',
  timeout: 'AI 응답이 늦어 관심사·걷기 정도·거리 기준으로 골랐어요.',
  error: 'AI에 연결하지 못해 관심사·걷기 정도·거리 기준으로 골랐어요.',
  invalid_response: 'AI 응답을 읽을 수 없어 관심사·걷기 정도·거리 기준으로 골랐어요.',
  incomplete_response: 'AI 응답에 후보 목록에 없는 곳이 있어 그 자리는 기준 정렬로 채웠어요.',
};

export function sourceNote(result) {
  if (result.source === 'ai') return 'AI가 후보지 중에서 고른 3곳이에요. 이유와 이동 요약은 AI가 쓴 설명이에요.';
  return FALLBACK_COPY[result.fallbackReason] ?? FALLBACK_COPY.error;
}
export function latestReportLine(report, now = Date.now()) {
  if (!report) return '아직 현장 소식이 없어요. 다녀오면 첫 소식을 남겨 주세요.';
  return `${report.categoryLabel} · ${reportAge(report.createdAt, now)} · ${report.text}`;
}
export const kakaoPlaceUrl = (place) => `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;

const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
function externalLink(url, label) {
  const link = node('a', 'text-button', `${label} (새 창)`); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function option(list, id, label) { const item = node('option', '', label); item.value = id; $(list).append(item); }
function chip(container, { type, name, value, label, hint, checked }) {
  const wrapper = node('label', 'interest-option');
  const input = node('input'); input.type = type; input.name = name; input.value = value; input.checked = checked; input.autocomplete = 'off';
  const text = node('span', '', label);
  if (hint) text.append(node('small', '', hint));
  wrapper.append(input, text); $(container).append(wrapper);
}

function rawConditions() {
  const checked = (name) => [...document.querySelectorAll(`#ai-form input[name="${name}"]:checked`)].map((item) => item.value);
  return {
    departure: $('ai-departure').value, date: $('ai-date').value, timeSlot: checked('ai-time')[0], partySize: $('ai-party').value === '' ? NaN : Number($('ai-party').value),
    walkLevel: Number(checked('ai-walk')[0]), interests: checked('ai-interest'), ageGroup: $('ai-age').value, studentStatus: $('ai-student').value,
  };
}

function showErrors(fields = {}) {
  for (const [field, id] of Object.entries(FIELD_IDS)) {
    const message = fields[field] ?? '';
    $(`ai-${field}-error`).textContent = message;
    if (message) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid');
  }
  const first = Object.keys(FIELD_IDS).find((field) => fields[field]);
  if (first) { const target = $(FIELD_IDS[first]); (target.matches('input,select') ? target : target.querySelector('input'))?.focus(); }
}

function openPlaceDetail(item, onClose) {
  const { place } = item;
  const content = $('evidence-content'); content.replaceChildren();
  const heading = node('h2', '', place.name); heading.id = 'evidence-heading'; heading.tabIndex = -1;
  content.append(node('span', 'small-label', place.area), heading, node('p', 'intro', place.summary));
  const facts = node('dl', 'place-facts');
  const walk = WALK_CHOICES.find((choice) => choice.level === place.walk_level);
  for (const [label, text] of [['추천 이유', item.reason], ['가는 방법', place.access], ['걷기', `${walk.label} (${walk.hint})`], ['주의', item.caution]]) facts.append(node('dt', '', label), node('dd', '', text));
  content.append(facts);
  if (place.needs_check) content.append(node('p', 'field-help', '위치와 교통 정보는 팀이 아직 확인하지 않은 초안이에요. 지도 앱에서 함께 확인해 주세요.'));
  content.append(externalLink(kakaoPlaceUrl(place), '카카오맵에서 위치 보기'), fieldReportsSection(place));
  const dialog = $('evidence-dialog');
  dialog.addEventListener('close', onClose, { once: true });
  dialog.showModal(); heading.focus();
}

function resultCard(item, index, result) {
  const card = node('li', 'ai-result-card');
  const head = node('div', 'ai-result-head');
  const title = node('div');
  title.append(node('span', 'ai-result-rank', String(index + 1).padStart(2, '0')), node('h3', '', item.place.name), node('p', 'muted', item.place.area));
  head.append(title);
  if (result.source === 'mixed' && item.source === 'rules') head.append(node('span', 'small-label', '기준 정렬로 채움'));
  const tags = node('div', 'ai-result-tags'); item.place.tags.forEach((tag) => tags.append(node('span', 'tag', tag)));
  const body = node('dl', 'ai-result-body');
  const report = node('dd', 'ai-result-report', latestReportLine(item.latest_report));
  for (const [label, value] of [['추천 이유', item.reason], ['이동', item.route_summary], ['주의', item.caution]]) body.append(node('dt', '', label), node('dd', '', value));
  body.append(node('dt', '', '현장 소식'), report);
  const actions = node('div', 'ai-result-actions');
  const detail = node('button', 'button primary', '상세·현장 소식'); detail.type = 'button';
  detail.setAttribute('aria-label', `${item.place.name} 상세와 현장 소식 보기`);
  // After the dialog closes, the card shows the newest report so a just-posted one appears right away.
  detail.addEventListener('click', () => openPlaceDetail(item, async () => {
    try {
      const { reports } = await fetchReports(item.place.id);
      item.latest_report = reports.find((entry) => entry.status !== 'outdated') ?? null;
      report.textContent = latestReportLine(item.latest_report);
    } catch { /* keep the previous line when the server is unreachable */ }
  }));
  actions.append(detail, externalLink(kakaoPlaceUrl(item.place), '지도'));
  card.append(head, tags, body, actions);
  return card;
}

function renderResults(result) {
  $('ai-results-conditions').textContent = result.conditionsText;
  $('ai-results-source').textContent = sourceNote(result);
  $('ai-results-source').dataset.source = result.source;
  $('ai-results-list').replaceChildren(...result.items.map((item, index) => resultCard(item, index, result)));
}

async function requestRecommendations(conditions) {
  let response;
  try { response = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions }) }); }
  catch { throw new Error('서버에 연결하지 못했어요. node scripts/serve.mjs로 연 주소인지 확인해 주세요.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error?.message ?? '추천을 받지 못했어요. 잠시 후 다시 시도해 주세요.'), { fields: body.error?.fields });
  return body;
}

// `today()` returns the Seoul date; `studentStatus()` reads the saved profile so a student does not answer twice.
export function setupAiFlow({ today, studentStatus, showResults }) {
  SEOUL_STATIONS.forEach(({ id, label }) => option('ai-departure', id, label));
  AGE_GROUPS.forEach(({ id, label }) => option('ai-age', id, label));
  STUDENT_STATUSES.forEach(({ id, label }) => option('ai-student', id, label));
  TIME_SLOTS.forEach(({ id, label, hint }, index) => chip('ai-time-options', { type: 'radio', name: 'ai-time', value: id, label, hint, checked: index === 0 }));
  WALK_CHOICES.forEach(({ level, label, hint }) => chip('ai-walk-options', { type: 'radio', name: 'ai-walk', value: String(level), label, hint, checked: level === 2 }));
  PLACE_TAGS.forEach((tag) => chip('ai-interest-options', { type: 'checkbox', name: 'ai-interest', value: tag, label: tag, checked: false }));
  const start = today();
  $('ai-date').value = start; $('ai-date').min = start;
  const last = new Date(`${start}T00:00:00Z`); last.setUTCDate(last.getUTCDate() + MAX_DAYS_AHEAD); $('ai-date').max = last.toISOString().slice(0, 10);
  if (STUDENT_STATUSES.some((status) => status.id === studentStatus())) $('ai-student').value = studentStatus();

  $('ai-interest-options').addEventListener('change', (event) => {
    const picked = document.querySelectorAll('#ai-interest-options input:checked');
    if (picked.length > MAX_INTERESTS) { event.target.checked = false; $('ai-interests-error').textContent = `관심사는 ${MAX_INTERESTS}개까지 고를 수 있어요.`; }
    else $('ai-interests-error').textContent = '';
  });
  let busy = false;
  $('ai-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    let conditions;
    try { conditions = normalizeConditions(rawConditions(), { today: today() }); }
    catch (error) {
      if (error.name !== 'ConditionError') throw error;
      showErrors(error.fields); $('ai-form-error').textContent = `${Object.keys(error.fields).length}개 항목을 확인해 주세요.`; return;
    }
    showErrors(); $('ai-form-error').textContent = '';
    busy = true; $('ai-submit').disabled = true; $('ai-submit').textContent = '추천 고르는 중…';
    $('ai-summary').textContent = `${describeConditions(conditions)} 조건으로 후보지를 살펴보고 있어요. 최대 20초쯤 걸릴 수 있어요.`;
    try {
      const result = await requestRecommendations(conditions);
      renderResults(result); $('ai-summary').textContent = '';
      showResults(result);
    } catch (error) {
      $('ai-summary').textContent = '';
      $('ai-form-error').textContent = error.message;
      if (error.fields) showErrors(error.fields);
    } finally { busy = false; $('ai-submit').disabled = false; $('ai-submit').textContent = 'AI 추천 받기'; }
  });
}
