import { SCREEN_META, STATUS, SAMPLE_CONNECTIONS, SAMPLE_ACTIVITY } from './model.mjs';

const root = document.querySelector('#screen-root');
const notes = document.querySelector('#review-notes');
const feedback = document.querySelector('#feedback');
const connections = structuredClone(SAMPLE_CONNECTIONS);
const activity = structuredClone(SAMPLE_ACTIVITY);
const state = { view: 'overview', selected: 'route', filter: 'all', activityFilter: 'all', activityTarget: '', access: null, authenticated: false, add: { name: '', url: '', outcome: 'ready', checked: false, errors: {} } };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const selected = () => connections.find(connection => connection.id === state.selected);
const button = (label, action, tone = 'secondary') => `<button type="button" class="button ${tone}" data-action="${action}">${label}</button>`;
const badge = status => `<span class="state state-${STATUS[status].tone}">${STATUS[status].label}</span>`;
const announce = text => { feedback.textContent = text; };
const heading = (title, lead) => `<header class="view-head"><div><p class="eyebrow">${SCREEN_META.find(meta => meta.id === state.view).step}</p><h1 id="view-heading" class="view-title" tabindex="-1">${escape(title)}</h1><p class="lead">${lead}</p></div></header>`;
const back = () => `<div class="breadcrumb">${button('연결 목록', 'overview', 'quiet')}<span aria-hidden="true">/</span><span>${escape(selected().name)}</span></div>`;
const addRecord = (action, result, detail) => activity.unshift({ id: activity.length + 1, connectionId: state.selected, action, result, detail, time: '방금, 시연' });

function navigate(view) {
  if (state.view === 'access' && view !== 'access') state.access = null;
  if (view === 'access' && state.access === null) state.access = [...selected().enabled];
  state.view = view;
  announce('');
  if (location.hash.slice(1) !== view) history.pushState(null, '', `#${view}`);
  render();
  document.querySelector('#view-heading').focus();
}

function overview() {
  const visible = connections.filter(connection => state.filter === 'all' || connection.status !== 'ready');
  return `${heading('MCP 연결', '여행 서비스에 참고할 데이터 연결을 관리합니다. 모든 연결과 상태는 가상 예시입니다.')}
    <div class="section-head"><label class="field">표시할 연결<select data-field="filter"><option value="all" ${state.filter === 'all' ? 'selected' : ''}>전체 연결 (${connections.length})</option><option value="attention" ${state.filter === 'attention' ? 'selected' : ''}>확인이 필요한 연결</option></select></label>${button('연결 추가', 'add', 'primary')}</div>
    <section class="surface" aria-label="연결 목록"><div class="row-list">${visible.map(connection => `<article class="connection-row"><div><h2><button type="button" class="button quiet" data-action="detail" data-id="${connection.id}">${escape(connection.name)}</button></h2><p>${escape(connection.purpose)}</p><p class="field-help">${STATUS[connection.status].reason}</p></div><div>${badge(connection.status)}<p class="field-help">${escape(connection.checkedAt)}</p></div></article>`).join('') || '<div class="empty"><h2>확인이 필요한 연결이 없습니다</h2><p>전체 연결에서 사용 범위를 확인할 수 있습니다.</p></div>'}</div></section>
    <p class="field-help">연결 준비 상태와 실제 자료의 정확성·최신성은 별개입니다. 시각 예시 기준: 2026-10-27 KST.</p>`;
}

function add() {
  const draft = state.add;
  return `${heading('연결 추가', '이름과 원격 HTTP 주소를 입력하고, 확인 결과를 검토한 뒤 저장합니다.')}
    <form id="add-form" class="form-grid" novalidate><section class="surface"><h2>연결 정보</h2>
    <label class="field" for="connection-name">연결 이름<input id="connection-name" name="name" maxlength="60" value="${escape(draft.name)}" placeholder="예: 지역 안내 MCP" aria-invalid="${Boolean(draft.errors.name)}" aria-describedby="name-help name-error"></label><p id="name-help" class="field-help">목록에서 구분할 이름을 입력하세요.</p><p id="name-error" class="field-error">${draft.errors.name || ''}</p>
    <label class="field" for="connection-url">서버 주소<input id="connection-url" name="url" type="url" value="${escape(draft.url)}" placeholder="https://service.example.invalid/mcp" aria-invalid="${Boolean(draft.errors.url)}" aria-describedby="url-help url-error"></label><p id="url-help" class="field-help">원격 HTTP 방식만 다룹니다. http:// 또는 https:// 주소를 입력하세요. 비밀번호·토큰은 입력하지 마세요.</p><p id="url-error" class="field-error">${draft.errors.url || ''}</p>
    <label class="field" for="mock-outcome">확인 결과 시연<select id="mock-outcome" name="outcome">${['ready', 'auth_needed', 'error'].map(status => `<option value="${status}" ${draft.outcome === status ? 'selected' : ''}>${STATUS[status].label}</option>`).join('')}</select></label><p class="field-help">실제 서버에 요청하지 않습니다. 선택한 결과를 화면에 표시합니다.</p></section>
    ${draft.checked ? `<section id="check-result" class="notice ${draft.outcome === 'ready' ? '' : 'notice-warning'}" aria-label="연결 확인 결과"><h2>${badge(draft.outcome)} 확인 결과 시연</h2><p>${STATUS[draft.outcome].reason}</p><p>입력한 주소로 통신하지 않았습니다. 저장하면 현재 시연의 연결 목록에만 추가됩니다.</p></section>` : ''}
    <div class="sticky-actions">${button('취소', 'overview')}<button class="button ${draft.checked ? 'secondary' : 'primary'}" type="submit">연결 확인</button>${draft.checked ? button('연결 저장', 'save-connection', 'primary') : ''}</div></form>`;
}

function detail() {
  const connection = selected();
  const status = STATUS[connection.status];
  return `${back()}${heading(connection.name, escape(connection.purpose))}<section class="surface"><div class="section-head"><h2>연결 상태</h2>${badge(connection.status)}</div><p class="code">${escape(connection.url)}</p><p class="field-help">마지막 확인: ${escape(connection.checkedAt)} · 시각 예시 기준 2026-10-27 KST</p><div class="summary-grid">${[['연결', status.connection], ['인증', status.auth], ['도구 발견', status.discovery]].map(([label, value]) => `<div class="summary-cell"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p class="field-help">모든 상태는 시연 값입니다. 준비됨도 실제 호출·서버 권한을 보증하지 않습니다.</p></section>
    <div class="actions">${button('도구·접근 설정', 'access', 'primary')}${button('다시 확인(시연)', 'recovery')}${button('활동 보기', 'target-activity', 'quiet')}</div>
    <section class="surface"><h2>발견된 도구</h2>${connection.status === 'ready' ? `<ul class="row-list">${connection.tools.map(tool => `<li class="tool-row"><div><strong>${escape(tool.name)}</strong><p>${escape(tool.description)}</p></div><span class="state">${connection.enabled.includes(tool.id) ? '앱에서 사용' : '앱에서 제외'}</span></li>`).join('')}</ul>` : '<div class="empty"><p>도구 목록이 아직 확인되지 않았습니다.</p><p class="field-help">인증 또는 재확인 후 시연용 도구가 표시됩니다.</p></div>'}</section>
    ${connection.id === 'benefit' ? '<section aria-label="MVP 혜택 미리보기"><h2>MVP 혜택 화면 미리보기</h2><article class="coupon"><div class="coupon-top"><p class="eyebrow">개인 조건 비교 영역</p><h3>나이·거주·학생 조건</h3><p>개인 수혜 여부는 별도 공식 조건과 비교합니다.</p></div><div class="coupon-bottom"><p class="eyebrow">공고·기간 확인 영역</p><p>연결 성공은 출처의 최신성이나 개인 자격 충족을 뜻하지 않습니다. 공고 기간과 확인 기준일을 별도로 확인합니다.</p></div></article></section>' : ''}`;
}

function access() {
  const connection = selected();
  const available = connection.status === 'ready';
  return `${back()}${heading('도구·접근 설정', `${escape(connection.name)}에서 이 앱이 사용할 도구를 선택합니다.`)}
    <div class="notice"><strong>앱 허용 목록 ≠ 서버 권한</strong><p>여기서의 선택은 이 앱 내부 사용 범위입니다. 서버 인증·권한을 부여하거나 취소하지 않습니다. 도구 설명도 안전성 보증이 아닙니다.</p></div>
    <section class="surface"><h2>사용할 도구</h2>${available ? connection.tools.map(tool => `<label class="check-row"><input type="checkbox" data-tool="${tool.id}" ${state.access.includes(tool.id) ? 'checked' : ''}><span><strong>${escape(tool.name)}</strong><span class="field-help">${escape(tool.description)}<br>입력 범위 예시: ${escape(tool.scope)}</span></span></label>`).join('') : '<div class="empty"><p>도구 목록을 확인한 다음 사용 범위를 설정할 수 있습니다.</p></div>'}<p id="access-count" class="field-help">${available ? `${state.access.length}개 선택 · 저장 전 변경은 이 화면에서만 유지됩니다.` : '인증 또는 재확인이 필요합니다.'}</p></section>
    <div class="sticky-actions">${button('취소', 'cancel-access')}${available ? button('변경 저장', 'save-access', 'primary') : button('연결 확인하기', 'recovery', 'primary')}</div>`;
}

function activityView() {
  const rows = activity.filter(record => (state.activityFilter === 'all' || record.result === state.activityFilter) && (state.activityTarget === '' || record.connectionId === state.activityTarget));
  return `${heading('활동 기록', '연결 확인과 설정 변경의 가상 기록입니다. 도구 실행 기록이나 실제 감사 로그가 아닙니다. 시각 예시 기준: 2026-10-27 KST.')}
    <div class="field-pair"><label class="field">결과<select data-field="activityFilter">${[['all', '전체 결과'], ['success', '성공'], ['error', '오류']].map(([id, label]) => `<option value="${id}" ${state.activityFilter === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field">대상 연결<select data-field="activityTarget"><option value="">전체 연결</option>${connections.map(connection => `<option value="${connection.id}" ${state.activityTarget === connection.id ? 'selected' : ''}>${escape(connection.name)}</option>`).join('')}</select></label></div>
    <section class="surface"><h2>최근 확인</h2><div class="row-list">${rows.map(record => `<article class="connection-row"><div><p class="eyebrow">${record.time} · ${record.action}</p><h3>${escape(connections.find(connection => connection.id === record.connectionId).name)}</h3><p>${record.detail}</p><span class="state state-${record.result === 'success' ? 'ready' : 'attention'}">${record.result === 'success' ? '성공' : '오류'}</span></div><button type="button" class="button ${record.result === 'error' ? 'secondary' : 'quiet'}" data-action="${record.result === 'error' ? 'recovery' : 'detail'}" data-id="${record.connectionId}">${record.result === 'error' ? '오류 진단' : '연결 상세'}</button></article>`).join('') || '<div class="empty"><p>선택한 조건의 기록이 없습니다.</p></div>'}</div></section><p class="field-help">기록을 선택해도 이전 작업을 재실행하지 않습니다.</p>`;
}

function recovery() {
  const connection = selected();
  const needsAuth = connection.status === 'auth_needed' && !state.authenticated;
  const ready = connection.status === 'ready';
  return `${back()}${heading('연결 복구', `${escape(connection.name)}의 상태를 확인하고 다음 조치를 진행합니다.`)}
    <section class="notice ${ready ? '' : 'notice-warning'}"><h2>${ready ? '연결 준비 상태입니다' : needsAuth ? '인증 단계가 필요합니다' : state.authenticated ? '재확인을 진행하세요' : '연결 상태를 아직 알 수 없습니다'}</h2><p>${ready ? '가상 확인 결과입니다. 실제 연결이나 도구 실행은 수행하지 않았습니다.' : needsAuth ? '가상 인증 단계를 완료한 다음 연결과 도구 목록을 다시 확인합니다.' : '서버 주소·접근 환경을 확인하는 단계를 시연합니다. 미확인 상태를 인증 오류로 단정하지 않습니다.'}</p><p class="code">${escape(connection.url)}</p></section>
    <ol class="step-list"><li class="step"><strong>1. 대상 확인</strong><p>연결 이름과 주소가 의도한 대상인지 확인</p></li><li class="step"><strong>2. 필요한 단계 진행</strong><p>${needsAuth ? '인증 단계 시연 선택' : '인증 필요 여부와 응답 상태 구분'}</p></li><li class="step"><strong>3. 결과 재확인</strong><p>연결·인증·도구 발견을 각각 확인</p></li></ol>
    <div class="sticky-actions">${button('연결 상세', 'detail', ready ? 'primary' : 'secondary')}${needsAuth ? button('인증 단계 시연', 'mock-auth', 'primary') : button('다시 확인(시연)', 'recheck', ready ? 'secondary' : 'primary')}</div><p class="field-help">실제 로그인 창·OAuth·네트워크 요청을 열지 않으며 도구 호출이나 쓰기 작업을 재시도하지 않습니다.</p>`;
}

const views = { overview, add, detail, access, activity: activityView, recovery };
function render() {
  root.innerHTML = views[state.view]();
  const meta = SCREEN_META.find(screen => screen.id === state.view);
  notes.innerHTML = `<p class="eyebrow">화면 설계 주석</p><h2>이 화면의 목표</h2><p>${meta.goal}</p><h3>정보 우선순위</h3><ol>${meta.priorities.map(priority => `<li>${priority}</li>`).join('')}</ol><h3>핵심 행동</h3><p>${meta.primary}</p><h3>배치 이유</h3><p>${meta.placement}</p><h3>확인할 상태</h3><p>${meta.states.join(' · ')}</p>`;
  document.querySelectorAll('[data-view]').forEach(control => {
    if (control.dataset.view === state.view) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  });
  document.title = `${meta.title} · MCP 관리 와이어프레임`;
}

function checkDraft() {
  const draft = state.add;
  draft.errors = {};
  if (!draft.name.trim()) draft.errors.name = '연결 이름을 입력하세요.';
  if (draft.name.trim().length > 60) draft.errors.name = '이름은 60자 이내로 입력하세요.';
  const url = URL.parse(draft.url.trim());
  if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname) draft.errors.url = 'http:// 또는 https://로 시작하는 원격 주소를 입력하세요.';
  else if (url.username || url.password || url.search || url.hash) draft.errors.url = '인증 정보·쿼리·해시가 없는 서버 주소를 입력하세요.';
  draft.checked = Object.keys(draft.errors).length === 0;
  render();
  if (draft.checked) announce('선택한 확인 결과를 표시했습니다. 아직 저장하지 않았습니다.');
  else { document.querySelector(`#connection-${Object.keys(draft.errors)[0]}`).focus(); announce('입력 내용을 확인하세요. 첫 오류 항목으로 이동했습니다.'); }
}

const actions = {
  overview: () => navigate('overview'), add: () => navigate('add'), detail: () => navigate('detail'), access: () => navigate('access'),
  recovery: () => { state.authenticated = false; navigate('recovery'); },
  'target-activity': () => { state.activityTarget = state.selected; navigate('activity'); },
  'save-connection': () => {
    if (!state.add.checked) return;
    const draft = state.add;
    state.selected = `connection-${connections.length + 1}`;
    connections.push({ id: state.selected, name: draft.name.trim(), url: draft.url.trim(), purpose: '새로 추가한 가상 연결', status: draft.outcome, checkedAt: '방금, 시연', enabled: [], tools: [{ id: 'sample_lookup', name: '자료 조회', description: '연결 확인 후 발견된 예시 도구', scope: '예시 검색어' }] });
    addRecord('연결 정보 저장', 'success', '구성 저장 완료 · 연결 상태(시연): ' + STATUS[draft.outcome].label);
    state.add = { name: '', url: '', outcome: 'ready', checked: false, errors: {} };
    navigate('detail'); announce('연결을 이번 시연 메모리에 저장했습니다. 새로고침하면 사라집니다.');
  },
  'cancel-access': () => { navigate('detail'); announce('변경을 취소했습니다. 저장된 앱 허용 목록을 유지합니다.'); },
  'save-access': () => { selected().enabled = [...state.access]; addRecord('앱 허용 목록 저장', 'success', `${state.access.length}개 도구 선택`); navigate('detail'); announce('앱 허용 목록을 이번 시연 메모리에 저장했습니다. 서버 권한은 변경하지 않았습니다.'); },
  'mock-auth': () => { state.authenticated = true; render(); document.querySelector('[data-action="recheck"]').focus(); announce('인증 단계 시연을 완료했습니다. 다시 확인을 눌러 결과를 확인하세요.'); },
  recheck: () => { selected().status = 'ready'; selected().checkedAt = '방금, 시연'; state.authenticated = false; addRecord('연결 재확인 시연', 'success', '연결·인증·도구 발견 준비됨'); render(); document.querySelector('#view-heading').focus(); announce('재확인 시연 완료. 실제 연결·인증·도구 실행은 수행하지 않았습니다.'); },
};

document.addEventListener('click', event => {
  const control = event.target.closest('button[data-action], button[data-view]');
  if (!control) return;
  if (control.dataset.id) { state.selected = control.dataset.id; state.access = null; state.authenticated = false; }
  if (control.dataset.view && Object.hasOwn(views, control.dataset.view)) navigate(control.dataset.view);
  else if (Object.hasOwn(actions, control.dataset.action)) actions[control.dataset.action]();
});
document.addEventListener('submit', event => { if (event.target.id === 'add-form') { event.preventDefault(); checkDraft(); } });
document.addEventListener('input', event => {
  const control = event.target;
  if (control.closest('#add-form') && ['name', 'url', 'outcome'].includes(control.name)) {
    state.add[control.name] = control.value;
    if (state.add.checked) {
      state.add.checked = false;
      document.querySelector('[data-action="save-connection"]').remove();
      document.querySelector('#check-result').remove();
      document.querySelector('#add-form [type="submit"]').className = 'button primary';
      announce('입력이 변경되었습니다. 연결 확인을 다시 진행하세요.');
    }
  }
});
document.addEventListener('change', event => {
  const control = event.target;
  if (control.dataset.field) { state[control.dataset.field] = control.value; render(); document.querySelector(`[data-field="${control.dataset.field}"]`).focus(); }
  if (control.dataset.tool) {
    state.access = control.checked ? [...state.access, control.dataset.tool] : state.access.filter(id => id !== control.dataset.tool);
    document.querySelector('#access-count').textContent = `${state.access.length}개 선택 · 아직 저장하지 않았습니다.`;
    announce('도구 선택이 변경되었습니다. 변경 저장을 눌러 적용하세요.');
  }
});
window.addEventListener('popstate', () => { const view = location.hash.slice(1); if (Object.hasOwn(views, view)) navigate(view); });
window.addEventListener('hashchange', () => { const view = location.hash.slice(1); if (view !== state.view && Object.hasOwn(views, view)) navigate(view); });
navigate(Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'overview');
