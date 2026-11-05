import { tk, locale } from './i18n.mjs';
// D26: field reports on a place detail. Reports are what travelers saw at the time; the confirmations
// show whether later visitors still see the same, so the UI always pairs a report with its time.
const CONTRIBUTOR_KEY = 'growing-travel.contributor.v1';
let memoryContributor = null;

const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};

export function contributorId() {
  try {
    const saved = globalThis.localStorage.getItem(CONTRIBUTOR_KEY);
    if (saved) return saved;
    const created = globalThis.crypto.randomUUID();
    globalThis.localStorage.setItem(CONTRIBUTOR_KEY, created);
    return created;
  } catch { return memoryContributor ??= globalThis.crypto.randomUUID(); }
}

async function call(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { ...options, headers: { 'X-Contributor-Id': contributorId(), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  } catch { throw new Error(tk('서버에 연결하지 못했어요. node scripts/serve.mjs로 연 주소인지 확인해 주세요.')); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message ?? tk('잠시 후 다시 시도해 주세요.'));
  return body;
}

export const fetchReports = (placeId) => call(`/api/reports?place_id=${encodeURIComponent(placeId)}`);
export const postReport = (report) => call('/api/reports', { method: 'POST', body: JSON.stringify(report) });
export const postVote = (reportId, vote) => call(`/api/reports/${encodeURIComponent(reportId)}/votes`, { method: 'POST', body: JSON.stringify({ vote }) });
export const fetchContribution = () => call('/api/contributors/me');

const seoulTime = new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export function reportAge(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  const relative = minutes < 1 ? tk('방금 전') : minutes < 60 ? tk('{n}분 전', { n: minutes }) : minutes < 1440 ? tk('{n}시간 전', { n: Math.floor(minutes / 60) }) : tk('{n}일 전', { n: Math.floor(minutes / 1440) });
  return `${relative} (${seoulTime.format(new Date(iso))})`;
}

const STATUS_COPY = { confirmed: tk('다른 여행자도 확인했어요'), unconfirmed: tk('아직 확인한 여행자가 없어요'), outdated: tk('지금은 달라졌다는 확인이 많아요') };

function reportItem(report, onVote) {
  const item = node('li', `report-item report-${report.status}`);
  const head = node('div', 'report-head');
  head.append(node('span', 'small-label', tk(report.categoryLabel)), node('span', 'report-status', STATUS_COPY[report.status]));
  item.append(head, node('p', 'report-text', report.text));
  const meta = [`${report.nickname} · ${reportAge(report.createdAt)}`];
  if (report.lastConfirmedAt) meta.push(tk('마지막 확인 {age}', { age: reportAge(report.lastConfirmedAt) }));
  item.append(node('p', 'report-meta', meta.join(' · ')));
  const votes = node('div', 'report-votes'); votes.setAttribute('role', 'group'); votes.setAttribute('aria-label', tk('이 소식이 지금도 맞나요?'));
  for (const [vote, label] of [['still', tk('아직 그래요')], ['gone', tk('이제 아니에요')]]) {
    const control = node('button', 'vote-button', `${label} ${report.votes[vote]}`); control.type = 'button';
    control.setAttribute('aria-pressed', String(report.myVote === vote)); control.disabled = report.mine; control.dataset.reportVote = `${report.id}:${vote}`;
    control.addEventListener('click', () => onVote(report.id, vote, control));
    votes.append(control);
  }
  item.append(votes);
  if (report.mine) item.append(node('p', 'field-help', tk('내가 남긴 소식이에요. 다른 여행자가 확인해 줘요.')));
  return item;
}

function reportForm(placeId, categories, onCreated) {
  const details = node('details', 'report-form-details'); details.append(node('summary', '', tk('현장 소식 남기기')));
  const form = node('form', 'report-form'); form.noValidate = true;
  const uid = `report-${placeId}`;
  const categoryLabel = node('label', 'field-label', tk('어떤 소식인가요?')); categoryLabel.htmlFor = `${uid}-category`;
  const category = node('select'); category.id = `${uid}-category`; category.name = 'category';
  for (const [value, label] of Object.entries(categories)) { const option = node('option', '', tk(label)); option.value = value; category.append(option); }
  const textLabel = node('label', 'field-label', tk('지금 본 상황 ')); textLabel.htmlFor = `${uid}-text`; textLabel.append(node('small', '', tk('2~200자')));
  const text = node('textarea'); text.id = `${uid}-text`; text.name = 'text'; text.maxLength = 200; text.rows = 3; text.placeholder = tk('예: 오후 3시 입구 대기 20분 정도였어요.');
  const nicknameLabel = node('label', 'field-label', tk('닉네임 ')); nicknameLabel.htmlFor = `${uid}-nickname`; nicknameLabel.append(node('small', '', tk('선택')));
  const nickname = node('input'); nickname.id = `${uid}-nickname`; nickname.name = 'nickname'; nickname.maxLength = 20; nickname.placeholder = tk('익명 여행자'); nickname.autocomplete = 'off';
  const message = node('p', 'field-error'); message.setAttribute('role', 'alert');
  const submit = node('button', 'button primary full', tk('소식 남기기')); submit.type = 'submit';
  form.append(categoryLabel, category, textLabel, text, nicknameLabel, nickname, node('p', 'field-help', tk('다른 여행자에게 공개돼요. 연락처·얼굴 등 개인정보는 적지 마세요.')), message, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = text.value.trim();
    if (value.length < 2) { message.textContent = tk('현장 소식은 2자 이상 적어 주세요.'); text.setAttribute('aria-invalid', 'true'); text.focus(); return; }
    submit.disabled = true; message.textContent = ''; text.removeAttribute('aria-invalid');
    try {
      await postReport({ placeId, category: category.value, text: value, nickname: nickname.value });
      text.value = ''; details.open = false; onCreated();
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  details.append(form);
  return details;
}

// Returns a section that loads the place's reports on its own; the caller only places it in the detail view.
export function fieldReportsSection(place) {
  const section = node('section', 'field-reports');
  const headingId = `field-reports-${place.id}`;
  section.setAttribute('aria-labelledby', headingId);
  const head = node('div', 'field-reports-head');
  const heading = node('h3', '', tk('현장 소식')); heading.id = headingId;
  const score = node('span', 'contribution-score');
  head.append(heading, score);
  const status = node('p', 'field-help'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const body = node('div', 'field-reports-body');
  section.append(head, node('p', 'field-help', tk('여행자가 남긴 당시 상황이에요. 지금도 같은지는 확인 표시와 시간을 함께 봐 주세요.')), status, body);

  let lastScore = null;
  async function refreshScore() {
    try {
      const mine = await fetchContribution(); score.textContent = tk('내 기여 {n}점', { n: mine.score });
      // A report or confirmation that raised the score shows the gain floating up once.
      if (lastScore !== null && mine.score > lastScore) {
        const gain = node('span', 'score-pop', `+${mine.score - lastScore}`); gain.setAttribute('aria-hidden', 'true');
        gain.addEventListener('animationend', () => gain.remove(), { once: true });
        head.append(gain);
      }
      lastScore = mine.score;
    } catch { score.textContent = ''; }
  }
  async function load(notice = '') {
    status.textContent = notice || tk('현장 소식을 불러오는 중이에요.');
    try {
      const { categories, reports } = await fetchReports(place.id);
      const list = node('ul', 'report-list');
      reports.forEach((report) => list.append(reportItem(report, vote)));
      body.replaceChildren(reports.length ? list : node('p', 'report-empty', tk('아직 남겨진 현장 소식이 없어요. 다녀왔다면 첫 소식을 남겨 주세요.')), reportForm(place.id, categories, () => load(tk('현장 소식을 남겼어요. 기여 점수가 올라갔어요.'))));
      status.textContent = notice;
    } catch (error) {
      const retry = node('button', 'button subtle', tk('다시 불러오기')); retry.type = 'button'; retry.addEventListener('click', () => load());
      body.replaceChildren(retry); status.textContent = error.message;
    }
    refreshScore();
  }
  async function vote(reportId, value, control) {
    control.disabled = true;
    try {
      await postVote(reportId, value); await load(value === 'still' ? tk('‘아직 그래요’로 확인했어요.') : tk('‘이제 아니에요’로 확인했어요.'));
      [...body.querySelectorAll('[data-report-vote]')].find((item) => item.dataset.reportVote === `${reportId}:${value}`)?.focus();
    }
    catch (error) { status.textContent = error.message; control.disabled = false; }
  }
  load();
  return section;
}
