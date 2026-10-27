import { SCREEN_META, REGIONS, EXPERIENCES, INITIAL_PROFILE, INITIAL_TRIP, INITIAL_SAVED, STUDENT_LABELS, profileError, tripError } from './model.mjs';

const copy = (value) => structuredClone(value);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const state = { profile: copy(INITIAL_PROFILE), profileDraft: copy(INITIAL_PROFILE), trip: copy(INITIAL_TRIP), region: 'green', selected: ['garden', 'books'], title: '온유동, 느리게 걷는 하루', acknowledged: false, saved: [copy(INITIAL_SAVED)], snapshot: null, courseTrip: null, reopened: false, notice: '', benefitProfile: null, conditionDraft: null, filter: 'all' };
const board = document.querySelector('#board-root');
const app = document.querySelector('#app-root');
const select = document.querySelector('#screen-select');
const dialog = document.createElement('dialog');
dialog.id = 'consumer-dialog';
dialog.className = 'consumer-dialog';
dialog.setAttribute('aria-labelledby', 'consumer-dialog-title');
document.body.append(dialog);
let active = SCREEN_META.some((screen) => screen.id === location.hash.slice(1)) ? location.hash.slice(1) : 'home';
let boardMode = !location.hash;
let dialogOrigin = null;

function button(action, text, options = {}) {
  return `<button type="button" class="button ${options.kind || 'secondary'}" data-action="${action}"${options.value ? ` data-value="${esc(options.value)}"` : ''}${options.pressed !== undefined ? ` aria-pressed="${options.pressed}"` : ''}>${text}</button>`;
}
const go = (view, text, kind = 'secondary') => button('view', text, { value: view, kind });
function input(group, name, options) {
  const value = state[group][name];
  return `<label class="field"><span>${options.label}</span><input name="${name}" data-bind="${group}" type="${options.type || 'text'}" value="${esc(value)}"${options.min !== undefined ? ` min="${options.min}"` : ''}${options.max !== undefined ? ` max="${options.max}"` : ''}${options.type === 'number' ? ' inputmode="decimal" step="any"' : ''}${options.placeholder ? ` placeholder="${options.placeholder}"` : ''}></label>`;
}
function choices(group, name, entries) {
  return `<label class="field"><span>${{ residence: '거주 시·도 · 선택', student: '대학생 여부 · 선택, 본인 입력', walk: '평소 걷기 선호' }[name]}</span><select name="${name}" data-bind="${group}">${entries.map(([value, title]) => `<option value="${esc(value)}"${state[group][name] === value ? ' selected' : ''}>${title}</option>`).join('')}</select></label>`;
}
function personalFields(group, compact = false) {
  const personal = input(group, 'age', { label: '만 나이 · 선택', type: 'number', min: 0, max: 120, placeholder: '입력하지 않아도 괜찮아요' }) + choices(group, 'residence', [['', '선택 안 함'], ['서울', '서울'], ['경기', '경기'], ['부산', '부산'], ['그 외', '그 외 지역']]) + choices(group, 'student', Object.entries(STUDENT_LABELS));
  if (compact) return personal;
  const interests = ['자연', '문화', '먹거리'].map((interest) => `<label class="choice"><input type="checkbox" name="interests" data-bind="${group}" value="${interest}"${state[group].interests.includes(interest) ? ' checked' : ''}>${interest}</label>`).join('');
  return personal + `<fieldset class="field"><legend>관심 있는 경험</legend><div class="choices">${interests}</div></fieldset>` + choices(group, 'walk', [['가볍게', '가볍게'], ['보통', '보통'], ['많이', '많이 걸어도 좋아요']]);
}
function summary(profile) {
  return `<div class="summary"><div class="summary-cell"><span>나이</span><strong>${profile.age === '' ? '미입력' : `${esc(profile.age)}세`}</strong></div><div class="summary-cell"><span>거주</span><strong>${esc(profile.residence || '미입력')}</strong></div><div class="summary-cell"><span>학생</span><strong>${STUDENT_LABELS[profile.student]}</strong><small>본인 입력</small></div></div>`;
}
const errorSlot = '<p class="error" data-error role="alert" tabindex="-1"></p>';
const region = () => REGIONS.find((item) => item.id === state.region);
const content = {
  home: () => `<p class="eyebrow">GROWING TRAVEL</p><h2 class="wf-heading">가볍게 떠나고,<br>나답게 채우는 하루.</h2><p class="intro">기차에서 내려 걷는 여행.<br>나에게 맞는 짧은 코스를 찾아보세요.</p><div class="surface"><span class="badge">코스 구성 예시</span><h3>역에서 시작하는 작은 여행</h3><div class="wire-image">출발역 → 정원 → 서가 → 도착역</div><p>혼자 1명, 대중교통과 도보</p><p class="hint">장소·동선·수치는 가상 시연 자료입니다.</p></div><div class="surface"><h3>여행 전, 혜택도 둘러보세요</h3><p>개인 설정 없이도 확인할 수 있어요.</p>${go('benefits', '혜택 먼저 보기', 'quiet')}</div>${go('trip', '입력 중인 여행 이어가기', 'quiet')}`,
  preferences: () => `<p class="eyebrow">여행 준비 1 / 4</p><h2 class="wf-heading">어떤 여행을 좋아하세요?</h2><p class="intro">개인 조건은 선택이에요. 비워 두어도 여행을 만들 수 있어요.</p>${personalFields('profileDraft')}${errorSlot}<p class="hint">거주지는 여행 출발지와 달라요. 실제 개인정보 대신 예시로 체험해 주세요.</p>`,
  trip: () => `<p class="eyebrow">여행 준비 2 / 4</p><h2 class="wf-heading">이번엔 얼마나 떠날까요?</h2>${input('trip', 'departure', { label: '출발역', placeholder: '예: 출발역' })}${input('trip', 'date', { label: '여행일', type: 'date' })}<div class="field-pair">${input('trip', 'hours', { label: '가능 시간 · 시간', type: 'number', min: 1, max: 24 })}${input('trip', 'budget', { label: '1인 예산 · 원', type: 'number', min: 0 })}</div><div class="field-pair">${input('trip', 'party', { label: '인원 · 명', type: 'number', min: 1, max: 20 })}${input('trip', 'walking', { label: '도보 한도 · km', type: 'number', min: 0, max: 50 })}</div><details class="surface"><summary>추가 비교 조건</summary><label class="choice"><input type="checkbox" name="benefitFirst" data-bind="trip"${state.trip.benefitFirst ? ' checked' : ''}>혜택도 함께 확인할래요</label><p class="hint">혜택은 별도 안내이며 코스 비용에서 차감하지 않아요.</p></details>${errorSlot}`,
  regions: () => `<p class="eyebrow">여행 준비 3 / 4</p><h2 class="wf-heading">어느 하루가 더 끌리나요?</h2><p class="intro">${esc(state.trip.departure)}, ${esc(state.trip.hours)}시간, ${esc(state.trip.party)}명</p><p class="hint">두 지역은 고정된 가상 비교 예시예요. 입력 조건으로 실제 적합도를 계산하지 않습니다.</p>${REGIONS.map((item) => `<article class="surface"><span class="badge">가상 지역</span><h3>${item.name}</h3><p>${item.tag}</p><div class="summary"><div class="summary-cell"><span>시간 예시</span><strong>${item.time}</strong></div><div class="summary-cell"><span>도보 예시</span><strong>${item.walk}</strong></div><div class="summary-cell"><span>비용 예시</span><strong>${item.cost}</strong></div></div><p class="hint">${item.reason}</p>${button('region', '이 지역에서 여행하기', { kind: 'primary', value: item.id })}</article>`).join('')}${state.trip.benefitFirst ? go('benefits', '별도 혜택 안내 확인') : ''}${go('trip', '여행 조건 수정', 'quiet')}`,
  experiences: () => `<p class="eyebrow">여행 준비 4 / 4 · ${region().name}</p><h2 class="wf-heading">담고 싶은 경험을 골라요</h2><p class="intro">선택한 ${state.selected.length}개 경험으로 동선을 만들어요.</p>${EXPERIENCES.map((item) => `<article class="surface experience-row"><span class="badge">${item.category} · 가상 경험</span><h3>${item.name}</h3><p>${item.time}, ${item.cost} · 예시</p><p class="hint"><strong>구성 이유</strong><br>${item.reason}</p><div class="actions">${button('evidence', '이유와 확인할 점', { value: item.id, kind: 'quiet' })}${button('toggle', state.selected.includes(item.id) ? '담았어요 · 빼기' : '코스에 담기', { value: item.id, pressed: state.selected.includes(item.id) })}</div></article>`).join('')}${errorSlot}`,
  course: () => `<p class="eyebrow">${state.reopened ? '저장한 당시 코스' : '코스 초안'} · 가상 시연</p><h2 class="wf-heading">${esc(state.title)}</h2><div class="notice">시연 예시, 실제 이동 미확인<br><small>경험을 바꾸어도 시간·비용을 자동 계산하지 않아요.</small></div><div class="timeline"><div class="timeline-stop"><span>출발</span><h3>${region().station}</h3></div>${state.selected.map((id, index) => { const item = EXPERIENCES.find((entry) => entry.id === id); return `<div class="timeline-leg">↓ 이동 시간 확인 필요</div><article class="timeline-stop"><span>${index + 1} · ${item.time} 체류 예시</span><h3>${item.name}</h3><p>${item.cost} · 가상 가격</p><div class="actions">${index > 0 ? button('up', '앞으로 옮기기', { value: id, kind: 'quiet' }) : ''}${button('remove', '빼기', { value: id, kind: 'quiet' })}${button('evidence', '이유 보기', { value: id, kind: 'quiet' })}</div></article>`; }).join('')}<div class="timeline-leg">↓ 복귀 이동 확인 필요</div><div class="timeline-stop"><span>도착</span><h3>${region().station}</h3></div></div>${go('experiences', '경험 더 고르기', 'quiet')}<label class="field"><span>코스 제목</span><input name="title" data-course="title" maxlength="60" value="${esc(state.title)}"></label><label class="choice"><input type="checkbox" name="acknowledged" data-course="acknowledged"${state.acknowledged ? ' checked' : ''}>가상 자료이며 실제 이동·영업 확인이 필요함을 확인했어요.</label>${errorSlot}<details class="surface"><summary>이 코스의 당시 개인 조건</summary>${summary(state.snapshot || state.profile)}<p class="hint">현재 내 설정과 별도로 보관합니다.</p></details>`,
  benefits: () => `<p class="eyebrow">여행과 별도로 확인하는 혜택</p><h2 class="wf-heading">내 조건부터 확인해요</h2>${summary(state.benefitProfile || state.profile)}${button('conditions', '비교 조건 수정', { kind: 'quiet' })}<div class="choices">${button('filter', '전체', { value: 'all', pressed: state.filter === 'all', kind: 'chip' })}${button('filter', '학생 조건 있음', { value: 'student', pressed: state.filter === 'student', kind: 'chip' })}</div><p class="hint">조건 후보와 공고 상태를 따로 표시하는 화면 예시예요. 현재 확인된 실제 혜택 목록이 아닙니다.</p>${state.filter === 'student' ? `<div class="empty"><h3>확인된 학생 조건 안내가 없어요</h3><p>대학생 입력만으로 혜택을 만들거나 수혜를 확정하지 않아요.</p>${button('filter', '전체 안내 보기', { value: 'all' })}</div>` : `<article class="ticket"><div class="ticket-top"><span class="badge">교통 · 공식 안내 자리</span><h3>청년 철도 혜택 안내</h3><p><strong>개인 조건: 추가 확인 필요</strong></p><p class="hint">이유<br>공식 조건과 신청 기준을 확인해야 해요. 미입력은 조건 불일치가 아닙니다.</p></div><div class="ticket-bottom"><p><strong>공고 상태: 현재 확인 필요</strong></p><p class="hint">공식 기간: 미확인<br>확인 기준일: 미확보<br>출처: 공식 안내 연결 전 와이어프레임</p>${button('benefit-detail', '조건과 공식 안내 보기', { kind: 'primary' })}</div></article>`}<p class="bottom-note">개인 수혜 확정이 아니며, 가상 코스 비용에 적용하지 않아요.</p>`,
  saved: () => `<h2 class="wf-heading">다시 꺼내 보는 나의 코스</h2><p class="intro">이번 실행에서 저장한 ${state.saved.length}개 코스</p>${state.saved.length ? state.saved.map((item, index) => `<article class="surface"><span class="badge">저장됨 · 가상 시연</span><h3>${esc(item.title)}</h3><p>${REGIONS.find((entry) => entry.id === item.region).name}, 경험 ${item.selected.length}개</p><p class="hint">당시 나이 ${item.profile.age === '' ? '미입력' : `${esc(item.profile.age)}세`}, 거주 ${esc(item.profile.residence || '미입력')}</p>${button('reopen', '코스 다시 열기', { kind: 'primary', value: String(index) })}</article>`).join('') : `<div class="empty"><div class="wire-image">내 여행 코스</div><h3>아직 저장한 코스가 없어요</h3><p>마음에 드는 경험을 담고<br>코스 저장하기를 눌러 주세요.</p>${go('home', '첫 여행 만들기', 'primary')}</div>`}<p class="bottom-note">이 와이어프레임은 메모리 시연입니다. 새로고침하면 저장한 코스가 초기화돼요.</p>`,
  settings: () => `<p class="eyebrow">현재 내 설정</p><h2 class="wf-heading">달라진 취향도 담아 주세요</h2><p class="intro">수정 후 저장하면 이번 실행에 반영돼요. 과거에 저장한 코스는 그대로예요.</p>${personalFields('profileDraft')}${errorSlot}<p class="hint">학교명·학생증은 받지 않아요. 새로고침하면 설정도 초기화됩니다.</p>`,
};
const footer = {
  home: () => go('preferences', '나에게 맞는 여행 찾기', 'primary'),
  preferences: () => button('preferences-next', '여행 조건 정하기', { kind: 'primary' }) + button('profile-save', '내 설정에 저장', { kind: 'quiet' }),
  trip: () => button('trip-next', '지역 비교하기', { kind: 'primary' }),
  regions: () => '', experiences: () => button('course', '선택한 경험으로 코스 보기', { kind: 'primary' }),
  course: () => button('save', state.reopened ? '수정 코스를 새로 저장하기' : '코스 저장하기', { kind: 'primary' }),
  benefits: () => '', saved: () => '', settings: () => button('profile-save', '내 설정 저장', { kind: 'primary' }),
};
function frame(id, mode) {
  const meta = SCREEN_META.find((screen) => screen.id === id);
  const previous = { preferences: 'home', trip: 'preferences', regions: 'trip', experiences: 'regions', course: 'experiences' }[id];
  const nav = [['home', '여행'], ['benefits', '혜택'], ['saved', '저장한 코스'], ['settings', '내 설정']];
  const currentNav = nav.some(([value]) => value === id) ? id : 'home';
  return `<section class="phone" data-screen="${id}" aria-labelledby="${mode}-${id}-title"><header class="phone-head">${previous ? go(previous, '이전', 'quiet') : '<span class="eyebrow">GROWING TRAVEL</span>'}<h2 id="${mode}-${id}-title">${meta.title}</h2></header><div class="phone-body">${state.notice ? `<p class="notice" role="status">${esc(state.notice)}</p>` : ''}${content[id]()}</div>${footer[id]() ? `<div class="phone-actions">${footer[id]()}</div>` : ''}<nav class="phone-nav" aria-label="주요 메뉴">${nav.map(([value, title]) => `<button type="button" class="button quiet" data-action="view" data-value="${value}"${currentNav === value ? ' aria-current="page"' : ''}>${title}</button>`).join('')}</nav></section>`;
}
function render(origin = null) {
  const positions = new Map([...document.querySelectorAll('.phone')].map((phone) => [phone.getAttribute('aria-labelledby'), {
    top: phone.querySelector('.phone-body').scrollTop,
    expanded: [...phone.querySelectorAll('details')].map((details) => details.open),
  }]));
  const originPhone = origin?.closest('.phone');
  const originRoot = originPhone?.closest('#board-root') ? board : app;
  const originScreen = originPhone?.dataset.screen;
  const routeControls = [...(originPhone?.querySelectorAll('.timeline-stop [data-action="evidence"]') || [])];
  const routeIndex = routeControls.findIndex((control) => control.dataset.value === origin?.dataset.value);
  const adjacentItems = [...routeControls.slice(routeIndex + 1), ...routeControls.slice(0, routeIndex).reverse()].map((control) => control.dataset.value);
  board.innerHTML = SCREEN_META.map((meta, index) => `<article class="screen-board-item"><div class="screen-label"><strong>${String(index + 1).padStart(2, '0')} ${meta.title}</strong><span>${meta.goal}</span></div>${frame(meta.id, 'board')}</article>`).join('');
  app.innerHTML = frame(active, 'app');
  board.hidden = !boardMode; app.hidden = boardMode; select.value = active;
  document.querySelector('#board-mode').setAttribute('aria-pressed', String(boardMode));
  document.querySelector('#app-mode').setAttribute('aria-pressed', String(!boardMode));
  document.querySelectorAll('.phone').forEach((phone) => {
    const position = positions.get(phone.getAttribute('aria-labelledby'));
    if (position) {
      phone.querySelectorAll('details').forEach((details, index) => { details.open = position.expanded[index] || false; });
      phone.querySelector('.phone-body').scrollTop = position.top;
    }
  });
  if (originPhone) {
    const phone = [...originRoot.querySelectorAll('.phone')].find((item) => item.dataset.screen === originScreen);
    const controls = [...phone.querySelectorAll('[data-action]')];
    const sameControl = controls.find((control) => control.dataset.action === origin.dataset.action && control.dataset.value === origin.dataset.value);
    const itemControl = controls.find((control) => control.dataset.action === 'evidence' && control.dataset.value === origin.dataset.value);
    const adjacentControl = adjacentItems.map((value) => controls.find((control) => control.dataset.action === 'evidence' && control.dataset.value === value)).find(Boolean);
    const fallback = controls.find((control) => control.dataset.action === 'view' && control.dataset.value === 'experiences');
    (sameControl || itemControl || adjacentControl || fallback)?.focus({ preventScroll: true });
  }
}
function navigate(view) {
  active = view; boardMode = false; history.replaceState(null, '', `#${view}`); render();
  app.querySelector('.phone-body').scrollTop = 0;
  const heading = app.querySelector('.phone-head h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
}
function showError(container, error) {
  const slot = container.querySelector('[data-error]'); slot.textContent = error.message;
  slot.id = `error-${container.closest('#board-root') ? 'board' : 'app'}-${container.dataset.screen || 'dialog'}`;
  container.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  const field = container.querySelector(`[name="${error.field}"]`);
  if (field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', slot.id); field.focus(); } else { slot.focus(); }
}
function openDialog(title, body, origin) {
  dialogOrigin = origin;
  dialog.innerHTML = `<header class="row"><h2 id="consumer-dialog-title">${title}</h2>${button('close', '닫기', { kind: 'quiet' })}</header>${body}`;
  dialog.showModal();
}
dialog.addEventListener('close', () => { if (dialogOrigin?.isConnected) dialogOrigin.focus(); else app.querySelector('.phone-head h2')?.focus(); });
document.addEventListener('input', (event) => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
  const group = field.dataset.bind;
  if (group) {
    if (field.name === 'interests') state[group].interests = field.checked ? [...new Set([...state[group].interests, field.value])] : state[group].interests.filter((value) => value !== field.value);
    else state[group][field.name] = field.type === 'checkbox' ? field.checked : field.value;
  }
  if (field.dataset.course) state[field.dataset.course] = field.type === 'checkbox' ? field.checked : field.value;
  document.querySelectorAll('[data-bind], [data-course]').forEach((peer) => {
    if (peer === field || peer.name !== field.name) return;
    const sameBinding = group ? peer.dataset.bind === group : field.dataset.course && peer.dataset.course === field.dataset.course;
    if (!sameBinding || (field.name === 'interests' && peer.value !== field.value)) return;
    if (field.type === 'checkbox') peer.checked = field.checked;
    else peer.value = field.value;
  });
});
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]'); if (!trigger) return;
  const container = trigger.closest('.phone') || dialog;
  const value = trigger.dataset.value;
  state.notice = '';
  const handlers = {
    view: () => navigate(value),
    'preferences-next': () => { const error = profileError(state.profileDraft); if (error) return showError(container, error); state.profile = copy(state.profileDraft); state.benefitProfile = null; state.conditionDraft = null; navigate('trip'); },
    'profile-save': () => { const error = profileError(state.profileDraft); if (error) return showError(container, error); state.profile = copy(state.profileDraft); state.benefitProfile = null; state.conditionDraft = null; state.notice = '내 설정을 이번 실행에 저장했어요. 과거 코스는 바뀌지 않았어요.'; render(trigger); },
    'trip-next': () => { const error = tripError(state.trip); if (error) return showError(container, error); navigate('regions'); },
    region: () => { state.region = value; state.snapshot = null; state.courseTrip = null; state.reopened = false; state.title = `${region().name}, 느리게 걷는 하루`; navigate('experiences'); },
    toggle: () => { state.selected = state.selected.includes(value) ? state.selected.filter((id) => id !== value) : [...state.selected, value]; render(trigger); },
    course: () => { if (!state.selected.length) return showError(container, { field: '', message: '코스에 담을 경험을 하나 이상 골라 주세요.' }); if (!state.reopened) { state.snapshot = copy(state.profile); state.courseTrip = copy(state.trip); } navigate('course'); },
    up: () => { const index = state.selected.indexOf(value); [state.selected[index - 1], state.selected[index]] = [state.selected[index], state.selected[index - 1]]; render(trigger); },
    remove: () => { state.selected = state.selected.filter((id) => id !== value); render(trigger); },
    save: () => {
      if (!state.title.trim()) return showError(container, { field: 'title', message: '코스 제목을 입력해 주세요.' });
      if (!state.selected.length) return showError(container, { field: '', message: '경험 더 고르기에서 경험을 하나 이상 담아 주세요.' });
      if (!state.acknowledged) return showError(container, { field: 'acknowledged', message: '가상 자료와 미확인 정보를 확인해 주세요.' });
      state.saved.push(copy({ title: state.title.trim(), selected: state.selected, region: state.region, profile: state.snapshot || state.profile, trip: state.courseTrip || state.trip }));
      state.notice = '코스를 이번 실행에 저장했어요. 아래에서 다시 열 수 있어요.'; state.acknowledged = false; navigate('saved');
    },
    reopen: () => { const saved = state.saved[Number(value)]; state.title = saved.title; state.selected = [...saved.selected]; state.region = saved.region; state.snapshot = copy(saved.profile); state.courseTrip = copy(saved.trip); state.reopened = true; state.acknowledged = false; navigate('course'); },
    evidence: () => { const item = EXPERIENCES.find((entry) => entry.id === value); openDialog(item.name, `<p class="badge">가상 경험 근거</p><h3>구성 이유</h3><p>${item.reason}</p><h3>출처와 확인할 점</h3><p>${item.evidence}</p><p class="hint">실제 후기·방문 인증·실시간 영업 정보가 아닙니다.</p>`, trigger); },
    filter: () => { state.filter = value; render(trigger); },
    'benefit-detail': () => openDialog('혜택 조건과 공식 안내', '<p class="badge">공식 안내 연결 전</p><h3>개인 조건: 추가 확인 필요</h3><p>나이·거주 시·도·학생 여부는 비교를 위한 선택 입력입니다. 현재 와이어프레임에는 확인된 공식 조건이 연결되어 있지 않아요.</p><h3>공고 상태: 현재 확인 필요</h3><p>공식 기간·출처·확인 기준일을 확보한 뒤 표시하는 영역입니다. 실제 신청 가능이나 수혜를 뜻하지 않습니다.</p><p class="notice">가상 코스 비용에는 적용하지 않아요.</p>', trigger),
    conditions: () => { state.conditionDraft ||= copy(state.benefitProfile || state.profile); openDialog('혜택 비교 조건', `<p class="intro">미입력도 괜찮아요. 본인 입력만으로 수혜를 확정하지 않아요.</p>${personalFields('conditionDraft', true)}${errorSlot}<div class="actions">${button('conditions-apply', '이번 비교에만 적용', { kind: 'primary' })}${button('conditions-save', '내 설정에 저장하고 비교')}</div>`, trigger); },
    'conditions-apply': () => applyConditions(false), 'conditions-save': () => applyConditions(true), close: () => dialog.close(),
  };
  function applyConditions(save) {
    const error = profileError(state.conditionDraft); if (error) return showError(dialog, error);
    state.benefitProfile = copy(state.conditionDraft);
    if (save) { state.profile = copy(state.conditionDraft); state.profileDraft = copy(state.profile); }
    dialog.close(); state.notice = save ? '내 설정에 저장하고 혜택 비교에 적용했어요.' : '이번 혜택 비교에만 적용했어요. 내 설정은 저장하지 않았어요.'; navigate('benefits');
  }
  handlers[trigger.dataset.action]();
});
select.innerHTML = SCREEN_META.map((meta) => `<option value="${meta.id}">${meta.title}</option>`).join('');
select.addEventListener('change', () => navigate(select.value));
document.querySelector('#board-mode').addEventListener('click', () => { boardMode = true; history.replaceState(null, '', location.pathname); render(); });
document.querySelector('#app-mode').addEventListener('click', () => navigate(active));
window.addEventListener('hashchange', () => { const target = location.hash.slice(1); if (SCREEN_META.some((screen) => screen.id === target)) navigate(target); else { boardMode = true; render(); } });
render();


