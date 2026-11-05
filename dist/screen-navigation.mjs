import { resolveScreen, navigationTab, parentScreen } from './navigation.mjs';
import { t, onLang } from './i18n.mjs';

const screenPanels = Object.freeze({ home:'home-panel', profile:'profile-panel', settings:'profile-panel', trip:'trip-panel', regions:'regions-panel', experiences:'experience-screen', course:'course-panel', saved:'saved-view', benefits:'benefits-view', pet:'pet-panel', ai:'ai-panel', 'ai-results':'ai-results-panel', arrival:'arrival-panel', dex:'dex-panel', map:'map-panel', start:'start-panel', follow:'follow-panel' });
const screenTitles = Object.freeze({ home:'여행 시작', profile:'내 여행 취향', settings:'내 설정', trip:'이번 여행 조건', regions:'지역 비교', experiences:'경험 고르기', course:'나의 여행 코스', saved:'저장한 코스', benefits:'나에게 맞는 혜택', pet:'펫 고르기', ai:'여행 조건', 'ai-results':'추천 결과', arrival:'구 도착', dex:'동네 친구 도감', map:'살아 있는 지도', start:'처음 시작', follow:'코스 따라가기' });
const travelSteps = Object.freeze(['profile','trip','regions','experiences','course']);
const $ = (id) => document.getElementById(id);
const depth = (screen) => (screen === 'home' ? 0 : 1 + depth(parentScreen(screen)));

// P47: a deeper screen slides in from the right, going back slides the other way, and screens on the same level
// cross-fade. Browsers without View Transitions, or with reduced motion, change at once (the CSS fade stays).
export function navigationDirection(from, to) {
  const [a, b] = [depth(from), depth(to)];
  return b > a ? 'forward' : b < a ? 'back' : 'fade';
}
function withTransition(from, to, update) {
  if (from === to || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return; }
  document.documentElement.dataset.nav = navigationDirection(from, to);
  let applied = false;
  const transition = document.startViewTransition(() => { applied = true; update(); });
  transition.ready.catch(() => {});
  // The update waits for the next rendered frame; if rendering is paused, skip the animation so the new screen still shows.
  setTimeout(() => { if (!applied) transition.skipTransition(); }, 250);
}

// Navigation uses the existing state and callbacks; it never writes profile or course storage.
export function createScreenNavigation({ state, availability, enterProfile, refreshSaved, renderBenefits }) {
  function updateNavigation() {
    const ready = availability();
    const busy = state.saving || state.requesting;
    document.querySelectorAll('.step-link').forEach((node) => {
      const target = node.dataset.screenTarget;
      node.disabled = busy || (target === 'regions' && !ready.comparisonReady) || (target === 'experiences' && !ready.recommendationsReady && !ready.hasCourse) || (target === 'course' && !ready.hasCourse);
      if (target === state.screen) node.setAttribute('aria-current','step');
      else node.removeAttribute('aria-current');
    });
    const step = travelSteps.indexOf(state.screen) + 1;
    $('journey-progress').hidden = !step;
    document.querySelector('.journey-steps').hidden = !step;
    if (step) {
      $('journey-progress').setAttribute('aria-valuenow',String(step));
      $('journey-progress').setAttribute('aria-valuetext',`${step}/5 ${screenTitles[state.screen]}`);
      $('journey-progress').style.setProperty('--progress',`${step * 20}%`);
    }
    const activeTab = navigationTab(state.screen);
    for (const name of ['discover','saved','profile','benefits']) {
      const node = $(`${name}-tab`);
      node.disabled = busy;
      node.classList.toggle('active', activeTab === name);
      if (activeTab === name) node.setAttribute('aria-current','page');
      else node.removeAttribute('aria-current');
    }
    $('app-back').disabled = state.screen === 'home' || busy;
    $('course-shortcut').textContent = `선택한 경험으로 코스 보기 · ${state.ids.length}개`;
    $('course-shortcut').disabled = !ready.hasCourse || busy;
    $('course-back-experiences').disabled = busy;
    $('view-saved').hidden = !state.hasSavedCurrent;
    $('view-saved').disabled = busy;
    $('home-start').disabled = busy;
    $('home-resume').hidden = !state.travelStarted;
    $('home-resume').disabled = busy;
    $('home-resume').textContent = state.lastTravelScreen === 'course' ? '만들던 코스 이어보기' : '입력 중인 여행 이어가기';
    const settings = state.screen === 'settings';
    $('profile-heading').textContent = settings ? '달라진 취향도 담아 주세요' : '어떤 여행을 좋아하세요?';
    $('profile-eyebrow').textContent = settings ? '현재 내 설정' : '여행 준비 1 / 5';
    $('profile-intro-copy').textContent = settings ? '바뀐 취향을 저장해 다음 여행에도 사용하세요.' : '좋아하는 것부터 골라 주세요. 개인 조건은 선택이에요.';
    $('profile-next').hidden = settings;
    $('profile-save').textContent = settings ? '내 설정 저장' : '내 설정에 저장';
    $('profile-save').classList.toggle('primary', settings);
    $('profile-save').classList.toggle('subtle', !settings);
  }

  // D53: a language chosen on the first start renames the screen at once.
  onLang(() => { $('screen-caption').textContent = t(`screen.${state.screen}`, screenTitles[state.screen]); });
  let shown = false;
  function goScreen(requested, { replace = false, focus = true, allowBusy = false } = {}) {
    if (!allowBusy && (state.saving || state.requesting)) {
      history.replaceState({ screen:state.screen }, '', `#${state.screen}`);
      return;
    }
    const target = resolveScreen(requested, availability());
    if (target === 'profile' || target === 'settings') enterProfile(target);
    const from = shown ? state.screen : target;
    shown = true;
    state.screen = target;
    if (travelSteps.includes(target)) {
      state.lastTravelScreen = target;
      state.travelStarted = true;
    }
    const fragment = `#${target}`;
    if (replace) history.replaceState({screen:target},'',fragment);
    else if (location.hash !== fragment) history.pushState({screen:target},'',fragment);
    // Everything the eye sees changes inside the transition; with one, it runs a frame later than the state above.
    withTransition(from, target, () => {
      document.querySelector('.app-frame').dataset.screen = target;
      $('discover-view').hidden = ['home','saved','benefits','pet','ai','ai-results','arrival','dex','map','start','follow'].includes(target);
      $('demo-note').hidden = ['home','benefits','pet','ai','ai-results','arrival','dex','map','start','follow'].includes(target);
      for (const id of new Set(Object.values(screenPanels))) $(id).hidden = id !== screenPanels[target];
      $('screen-caption').textContent = t(`screen.${target}`, screenTitles[target]);
      $('navigation-notice').textContent = target !== requested ? '앞 단계의 입력과 선택을 먼저 확인해 주세요. 저장한 코스는 하단 메뉴에서 열 수 있어요.' : '';
      updateNavigation();
      if (target === 'saved') refreshSaved();
      if (target === 'benefits') renderBenefits();
      window.scrollTo({top:0,behavior:'auto'});
      if (focus) {
        const heading = $(screenPanels[target]).querySelector('h1,h2');
        heading.setAttribute('tabindex','-1');
        heading.focus({preventScroll:true});
      }
    });
  }
  return { goScreen, updateNavigation };
}
