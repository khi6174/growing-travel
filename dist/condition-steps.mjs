import { WALK_CHOICES, TIME_OF_DAY, durationLabel, validHours, josa } from './ai-conditions.mjs';

// D42/P58: the conditions screen asks one thing at a time, like a Toss form. Steps 1·2 move on by themselves after
// a tap; step 3 holds two answers (인원·걷기) and step 4 shows everything before 추천 받기. No DOM access here.
export const CONDITION_STEPS = Object.freeze([
  { id: 'departure', fields: ['departure'], question: '어디서 출발해요?', hint: '주소·역·건물·가게 이름으로 찾거나 역을 바로 골라요.', auto: true },
  { id: 'hours', fields: ['hours'], question: '시간은 얼마나 있어요?', hint: '오가는 시간까지 포함해서 골라 주세요.', auto: true },
  { id: 'party', fields: ['partySize', 'walkLevel'], question: '몇 명이서, 얼마나 걸을까요?', hint: '인원은 나를 포함해서 세요.', auto: false },
  { id: 'time', fields: ['timeOfDay'], question: '언제 출발해요?', hint: '지금 시각으로 골라 뒀어요. 확인하고 추천을 받아 보세요.', auto: false },
]);
export const LAST_STEP = CONDITION_STEPS.length - 1;

export const clampStep = (index) => Math.min(LAST_STEP, Math.max(0, Number.isInteger(index) ? index : 0));
export const stepDirection = (from, to) => (to > from ? 'forward' : to < from ? 'back' : 'none');
export function stepOfField(field) { return CONDITION_STEPS.findIndex((step) => step.fields.includes(field)); }
// The earliest step holding one of these error fields, or -1 when none of them belongs to a step.
export function firstErrorStep(fields = {}) {
  const steps = Object.keys(fields).map(stepOfField).filter((index) => index >= 0);
  return steps.length ? Math.min(...steps) : -1;
}
export function stepErrors(fields = {}, index) {
  const own = CONDITION_STEPS[index]?.fields ?? [];
  return Object.fromEntries(Object.entries(fields).filter(([field]) => own.includes(field)));
}

// Short labels for what has been answered so far; an empty string means not answered (or not valid) yet.
export function answerLabels({ departure, hours, partySize, walkLevel, timeOfDay } = {}) {
  const walk = WALK_CHOICES.find((choice) => choice.level === walkLevel);
  const people = Number.isInteger(partySize) && partySize >= 1 ? (partySize === 1 ? '혼자' : `${partySize}명`) : '';
  return {
    departure: departure || '',
    hours: validHours(hours) ? durationLabel(hours) : '',
    people,
    walk: walk ? walk.label : '',
    party: people && walk ? `${people} · ${walk.label} 걷기` : '',
    time: TIME_OF_DAY.find((slot) => slot.id === timeOfDay)?.label ?? '',
  };
}

// What the pet says on each step, in its own tone from data/pets.json (골든·코기 반말, 시바·비숑 존댓말, 백구 격식체).
// These are screen lines written by the team, not AI output.
const myeon = (label) => josa(label, '이면', '면');
const PET_LINES = Object.freeze({
  golden: {
    departure: () => '신나는 활동 여행 가자! 어디서 출발해?',
    hours: (a) => `${a.departure}에서 출발! 시간은 얼마나 있어?`,
    party: (a) => `${myeon(a.hours)} 신나게 놀 수 있어! 몇 명이서 가?`,
    time: (a) => `${a.people}, ${a.walk} 걷기! 언제 출발할까?`,
    ready: () => '준비 끝! 추천 받기를 눌러 줘!',
    oops: () => '앗, 이것만 알려 줘!',
  },
  shiba: {
    departure: () => '천천히 쉬러 가요. 어디서 출발할까요?',
    hours: (a) => `${a.departure}에서 출발해요. 시간은 얼마나 있나요?`,
    party: (a) => `${myeon(a.hours)} 여유롭겠네요. 몇 분이서 가나요?`,
    time: (a) => `${a.people}, ${a.walk} 걷기. 좋아요. 언제 출발할까요?`,
    ready: () => '준비됐어요. 추천 받기를 눌러 주세요.',
    oops: () => '이것만 골라 주세요.',
  },
  corgi: {
    departure: () => '맛있는 거 먹으러 가자! 어디서 출발해?',
    hours: (a) => `${a.departure} 출발! 먹으러 다닐 시간은 얼마나 돼?`,
    party: (a) => `${a.hours}! 몇 명이서 먹으러 가?`,
    time: (a) => `${a.people}, ${a.walk} 걷기 접수! 언제 출발해?`,
    ready: () => '준비 완료! 추천 받기 누르면 바로 찾아 줄게!',
    oops: () => '앗, 이거 하나만 골라 줘!',
  },
  bichon: {
    departure: () => '예쁜 곳 담으러 가요. 어디서 출발할까요?',
    hours: (a) => `${a.departure}에서 출발해요. 얼마나 머물 수 있을까요?`,
    party: (a) => `${myeon(a.hours)} 사진 많이 남길 수 있어요. 몇 분이서 가세요?`,
    time: (a) => `${a.people}, ${a.walk} 걷기로 할게요. 언제 출발할까요?`,
    ready: () => '다 됐어요. 추천 받기를 눌러 주세요.',
    oops: () => '이것만 골라 주시면 돼요.',
  },
  baekgu: {
    departure: () => '역사 여행을 안내하겠습니다. 어디서 출발하시겠습니까?',
    hours: (a) => `${a.departure}에서 출발하시는군요. 시간은 얼마나 되십니까?`,
    party: (a) => `${a.hours}, 알겠습니다. 몇 분이서 가시는지요?`,
    time: (a) => `${a.people}, ${a.walk} 걷기로 정하겠습니다. 언제 출발하시겠습니까?`,
    ready: () => '준비되었습니다. 추천 받기를 눌러 주십시오.',
    oops: () => '이 부분을 골라 주십시오.',
  },
});
const FALLBACK_LINES = Object.freeze({
  departure: () => '어디서 출발할까요?',
  hours: (a) => `${a.departure}에서 출발해요. 시간은 얼마나 있나요?`,
  party: (a) => `${a.hours}. 몇 명이서 가나요?`,
  time: (a) => `${a.people}, ${a.walk} 걷기. 언제 출발할까요?`,
  ready: () => '준비됐어요. 추천 받기를 눌러 주세요.',
  oops: () => '이것만 골라 주세요.',
});
// `moment` is a step id, 'ready' (step 4 answered) or 'oops' (a check failed). Missing answers fall back to the
// step's plain question so a line never shows an empty label.
export function petLine(petId, moment, labels = {}) {
  const lines = PET_LINES[petId] ?? FALLBACK_LINES;
  const needs = { hours: ['departure'], party: ['hours'], time: ['people', 'walk'] }[moment] ?? [];
  if (needs.some((key) => !labels[key])) return CONDITION_STEPS.find((step) => step.id === moment)?.question ?? '';
  return (lines[moment] ?? FALLBACK_LINES[moment] ?? (() => ''))(labels);
}
