export const SCREEN_META = [
  { id: 'home', title: '여행 시작', goal: '가볍게 시작하고 혜택도 바로 발견', priorities: ['여행 제안', '초안 이어가기', '독립 혜택 진입'], primary: '나에게 맞는 여행 찾기', placement: '하단 고정' },
  { id: 'preferences', title: '내 여행 취향', goal: '선택 정보와 여행 취향 입력', priorities: ['선택 개인 조건', '관심', '걷기 선호'], primary: '여행 조건 정하기', placement: '하단 고정' },
  { id: 'trip', title: '이번 여행 조건', goal: '이번 여행의 현실적인 범위 정하기', priorities: ['출발과 날짜', '시간과 예산', '동행과 도보'], primary: '지역 비교하기', placement: '하단 고정' },
  { id: 'regions', title: '지역 비교', goal: '시간·도보·비용을 같은 기준으로 비교', priorities: ['조건 요약', '지역별 부담', '선택 이유'], primary: '이 지역에서 여행하기', placement: '각 지역 카드 하단' },
  { id: 'experiences', title: '경험 고르기', goal: '이유를 확인하고 코스에 담기', priorities: ['경험 후보', '추천 이유', '선택 상태'], primary: '선택한 경험으로 코스 보기', placement: '하단 고정' },
  { id: 'course', title: '나의 여행 코스', goal: '역에서 시작하는 동선을 수정하고 저장', priorities: ['동선', '미확인 이동 정보', '명시적 저장'], primary: '코스 저장하기', placement: '하단 고정' },
  { id: 'benefits', title: '나에게 맞는 혜택', goal: '개인 조건과 공고 상태를 구분해 확인', priorities: ['내 조건 3칸', '조건 후보', '공식 안내와 확인 한계'], primary: '조건과 공식 안내 보기', placement: '혜택 쿠폰 하단' },
  { id: 'saved', title: '저장한 코스', goal: '저장한 당시 코스를 다시 열기', priorities: ['저장 목록', '당시 조건', '재열람'], primary: '코스 다시 열기', placement: '저장 카드 하단' },
  { id: 'settings', title: '내 설정', goal: '현재 개인 조건을 명시적으로 저장', priorities: ['선택 개인 조건', '취향', '저장 상태'], primary: '내 설정 저장', placement: '하단 고정' },
];

export const REGIONS = [
  { id: 'green', name: '온유동', station: '온유역', tag: '산책과 작은 서가', time: '4시간', walk: '3.2km', cost: '32,000원', reason: '역 주변에 산책과 독서 경험을 묶은 구성 예시' },
  { id: 'river', name: '바람마을', station: '바람역', tag: '강변과 문화 산책', time: '5시간', walk: '4.6km', cost: '41,000원', reason: '문화 공간을 둘러보며 머무는 구성 예시' },
];

export const EXPERIENCES = [
  { id: 'garden', name: '느린 정원 걷기', category: '자연', time: '50분', cost: '무료', reason: '잠깐 멈춰 풍경을 보는 산책', evidence: '가상 정원의 완만한 산책로 설정을 사용한 화면 예시입니다. 실제 경사·휴무·날씨·안전은 확인하지 않았습니다.' },
  { id: 'books', name: '골목 서가에서 한 시간', category: '문화', time: '60분', cost: '8,000원', reason: '혼자 조용히 머무는 독서 시간', evidence: '가상 서가의 혼자 앉는 자리와 음료 가격을 가정했습니다. 실제 영업·좌석·가격·예약 여부는 미확인입니다.' },
  { id: 'market', name: '작은 시장 한 바퀴', category: '먹거리', time: '40분', cost: '12,000원', reason: '짧게 둘러보고 한 끼 쉬어가기', evidence: '가상 시장의 먹거리 탐색 예시입니다. 실제 운영일·대기·혼자 이용·식이 조건은 미확인입니다.' },
];

export const INITIAL_PROFILE = { age: '', residence: '', student: '', interests: ['자연', '문화'], walk: '가볍게' };
export const INITIAL_TRIP = { departure: '출발역 예시', date: '2026-11-07', hours: '6', budget: '50000', party: '1', walking: '4', benefitFirst: false };
export const INITIAL_SAVED = { title: '예시 코스 · 온유동의 하루', region: 'green', selected: ['garden', 'books'], profile: { ...INITIAL_PROFILE, age: '22', residence: '서울', student: 'yes' }, trip: { ...INITIAL_TRIP } };
export const STUDENT_LABELS = { '': '선택 안 함', yes: '대학생', no: '대학생 아님' };

export function profileError(profile) {
  if (profile.age !== '' && (!/^\d+$/.test(profile.age) || Number(profile.age) > 120)) return { field: 'age', message: '만 나이는 0~120의 정수로 입력하거나 비워 주세요.' };
  return null;
}

export function tripError(trip) {
  if (!trip.departure.trim()) return { field: 'departure', message: '이번 여행의 출발역을 입력해 주세요.' };
  if (!trip.date) return { field: 'date', message: '여행일을 골라 주세요.' };
  for (const [field, min, max, label] of [['hours', 1, 24, '가능 시간'], ['budget', 0, 10000000, '1인 예산'], ['party', 1, 20, '인원'], ['walking', 0, 50, '도보 한도']]) {
    const value = Number(trip[field]);
    if (trip[field] === '' || !Number.isFinite(value) || value < min || value > max || (field === 'party' && !Number.isInteger(value))) return { field, message: `${label}: ${min}~${max} 범위${field === 'party' ? '의 정수' : ''}를 입력해 주세요.` };
  }
  return null;
}

