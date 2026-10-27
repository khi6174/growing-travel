export const SCREEN_META = [
  { id: 'overview', title: 'MCP 연결', step: '01 / 현황', goal: '주의가 필요한 연결을 찾고 다음 조치를 선택한다.', priorities: ['연결별 상태와 사용 목적', '확인이 필요한 이유', '새 연결 추가'], primary: '연결 추가', placement: '목록 필터 행 오른쪽, 모바일에서는 필터 다음', states: ['준비됨', '인증 필요', '미확인', '필터 결과 없음'] },
  { id: 'add', title: '연결 추가', step: '02 / 연결 준비', goal: '연결 정보를 입력하고 결과를 확인한 뒤 명시적으로 저장한다.', priorities: ['이름과 원격 HTTP 주소', '선택한 시연 결과', '확인 결과와 저장 여부'], primary: '연결 확인 후 연결 저장', placement: '입력 및 결과 아래 고정 행동 영역', states: ['입력 전', '필드 오류', '준비됨', '인증 필요', '연결 오류'] },
  { id: 'detail', title: '연결 상세', step: '03 / 상태 확인', goal: '연결·인증·도구 발견을 구분하고 필요한 관리 화면으로 이동한다.', priorities: ['선택한 연결과 세 가지 상태', '발견된 도구와 적용 범위', '혜택 안내에 미치는 한계'], primary: '도구·접근 설정', placement: '상태 요약 다음', states: ['준비됨', '인증 필요', '도구 미확인'] },
  { id: 'access', title: '도구·접근 설정', step: '04 / 사용 범위', goal: '이 앱에서 사용할 도구를 선택하고 변경을 명시적으로 저장한다.', priorities: ['앱 허용 목록과 서버 권한의 차이', '도구별 선택과 변경 내용', '저장 또는 취소'], primary: '변경 저장', placement: '도구 목록 아래 고정 행동 영역', states: ['저장된 설정', '저장 전 변경', '사용 도구 없음', '도구 목록 미확인'] },
  { id: 'activity', title: '활동 기록', step: '05 / 기록 확인', goal: '가상 확인 기록에서 문제를 찾아 해당 연결의 복구로 이동한다.', priorities: ['기록별 결과와 대상', '필터와 발생 순서', '오류 진단으로 이동'], primary: '오류 진단', placement: '오류 기록의 상세 행동', states: ['전체', '성공', '오류', '결과 없음'] },
  { id: 'recovery', title: '연결 복구', step: '06 / 다음 조치', goal: '인증 필요와 원인 미확인을 구분하고 안전한 재확인 절차를 시연한다.', priorities: ['선택한 연결의 문제', '인증 단계와 재확인 순서', '복구 결과와 상세 복귀'], primary: '인증 단계 시연 후 다시 확인(시연)', placement: '진단·단계 설명 아래', states: ['인증 필요', '원인 미확인', '재확인 대기', '복구 시연 완료'] },
];

export const STATUS = {
  ready: { label: '준비됨', tone: 'ready', connection: '응답 확인', auth: '인증 단계 완료', discovery: '도구 발견 완료', reason: '선택한 앱 허용 목록을 확인하세요.' },
  auth_needed: { label: '인증 필요', tone: 'attention', connection: '응답 확인', auth: '인증 필요', discovery: '인증 후 확인', reason: '인증 단계가 끝나야 도구 목록을 확인할 수 있습니다.' },
  unverified: { label: '미확인', tone: 'unknown', connection: '미확인', auth: '미확인', discovery: '미확인', reason: '아직 확인 결과가 없습니다. 주소와 연결 상태를 확인하세요.' },
  error: { label: '연결 오류', tone: 'attention', connection: '응답 확인 실패', auth: '미확인', discovery: '미확인', reason: '응답을 확인하지 못한 가상 결과입니다. 원인은 아직 알 수 없습니다.' },
};

export const SAMPLE_CONNECTIONS = [
  { id: 'route', name: '경로 정보 MCP', purpose: '대중교통·도보 경로 참고', url: 'https://routes.example.invalid/mcp', status: 'ready', checkedAt: '오늘 14:32, 예시', enabled: ['route_search'], tools: [{ id: 'route_search', name: '경로 조회', description: '출발·도착 구간의 경로를 조회하는 가상 도구', scope: '출발역·도착역' }, { id: 'route_duration', name: '이동 시간 조회', description: '구간별 예상 소요 시간을 조회하는 가상 도구', scope: '선택 구간' }] },
  { id: 'benefit', name: '공식 혜택 MCP', purpose: '혜택 안내 출처 확인 보조', url: 'https://benefits.example.invalid/mcp', status: 'auth_needed', checkedAt: '오늘 14:29, 예시', enabled: ['benefit_search'], tools: [{ id: 'benefit_search', name: '혜택 안내 조회', description: '혜택 공고 링크를 조회하는 가상 도구', scope: '검색어·지역' }, { id: 'benefit_source', name: '출처 정보 조회', description: '공고의 출처 정보를 조회하는 가상 도구', scope: '공고 식별자' }] },
  { id: 'places', name: '지역·경험 MCP', purpose: '지역·경험 탐색 참고', url: 'https://places.example.invalid/mcp', status: 'unverified', checkedAt: '확인 기록 없음', enabled: [], tools: [{ id: 'place_search', name: '경험 후보 조회', description: '지역 경험 후보를 조회하는 가상 도구', scope: '지역·관심사' }] },
];

export const SAMPLE_ACTIVITY = [
  { id: 3, connectionId: 'route', result: 'success', action: '연결 확인', detail: '도구 목록 확인', time: '오늘 14:32, 예시' },
  { id: 2, connectionId: 'benefit', result: 'error', action: '연결 확인', detail: '인증 단계 필요', time: '오늘 14:29, 예시' },
  { id: 1, connectionId: 'places', result: 'error', action: '연결 확인', detail: '확인 결과 없음', time: '오늘 14:27, 예시' },
];
