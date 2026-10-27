# 실제 근교 여행 적용 계약

사용자 요청: 실제 여행지·대중교통 동선과 저장, 여행자용 문구·디자인 확정. 선택 지역은 서울 출발 춘천·가평·강릉. 기존 동선/쿠폰 방향을 유지한다. 이 문서는 구현 선택이며 실시간 교통 API 연결 완료를 뜻하지 않는다.

## 데이터와 모듈 경계

- 기존 data.mjs/domain.mjs/journey.mjs 출력은 그대로 보존한다. 이전 저장본과 저장 요청 이력의 검증 결과가 바뀌면 안 된다.
- root owns `real-catalog.mjs`: REAL_PLACES, REAL_REGIONS, REAL_DEPARTURES, REAL_CATALOG_VERSION. 실제 출처를 확인한 목록만 작성한다.
- REAL_PLACES shape: 기존 경험 필드 id/title/summary/region/tags/durationMinutes/visitContext/positives/drawbacks/companions/mobility/stairs/art/evidence에 synthetic:false, accessScope:'official-public', regionId, address, location:{lat,lng}, source:{url,label,checkedAt}, admission:{amount,label}, opening:{label,closedWeekdays}, durationKind:'planning'을 추가한다. durationMinutes는 머무를 계획 시간이며 공식 소요 시간이 아니다. 좌표/요금/계단 미확인은 null이다. art는 실제 장소 사진 대신 추상 category를 사용한다.
- REAL_REGIONS shape: id/name/station(string)/stationLocation:{lat,lng}/stationAddress/description/railLabel/source:{url,label,checkedAt}/defaultExperienceIds. 지역 IDs real-chuncheon, real-gapyeong, real-gangneung.
- REAL_DEPARTURES shape: id/label/location:{lat,lng}, IDs cheongnyangni, seoul, yongsan. 기본 청량리역. 다른 출발역은 환승 가능성을 길찾기에서 확인한다.
- backend worker owns new `travel-domain.mjs`, `travel-journey.mjs`, `travel-links.mjs`, tests/real-travel*.test.mjs and storage.mjs의 검증 import만. 기존 domain/journey는 수정하지 않는다. 새 모듈은 기존 함수 시그니처를 유지하고 실제/가상 계약으로 분기한다.
- app worker owns app.mjs, screen-navigation.mjs only. 새 모듈을 import해 실제 자료가 기본이 되고 과거 가상 코스는 그대로 재열람한다. 필요 시 새 view helper 파일로 분리 가능. root는 index.html/traveler.css/DESIGN/문서를 소유한다.

## 계약과 계산

새 계약은 real-travel-v1 / real-journey-v1. 여행 조건 필드/선택적 개인 설정을 유지한다. 실제 장소의 주소·운영 안내·공식 출처와 저장 당시 조건을 스냅샷으로 보관한다. 검증은 현재 카탈로그로 저장본을 다시 만들어 비교하지 않고 엄격한 구조·ID/좌표/URL·합계·순서 계약을 검사한다. 기존 storage 키/버전/중복 요청/충돌/읽기 후 확인 동작은 보존한다.

추천은 관심과 장소 체류 계획으로 고르되 왕복 이동 시간을 모르므로 전체 일정이 충분하다고 확정하지 않는다. 알려진 정기 휴무는 선택일과 비교하고 자동 추천에서 제외한다. 계단 없음이 확인되지 않은 장소를 접근성 보장으로 표시하지 않는다. 미확인 이동 시간·교통비는 null이며 0으로 더하지 않는다. 공식 혜택은 비용에서 차감하지 않는다.

실제 동선은 출발역 → 지역역 → 선택 장소들 → 지역역 → 출발역으로 구성한다. 각 leg에는 stable id/fromId/toId/toExperienceId/from/to/mode/minutes/routeUrl/source를 둔다. 지역 내 구간은 도보 및 대중교통 길찾기 모두 제공 가능. 이름만으로 경험을 연결하지 않는다. 지도 링크는 좌표가 있을 때 카카오 공식 /link/by/traffic 또는 /walk 구문, 없으면 장소 검색으로 명확히 구분한다. 경춘선 역간 링크는 공식 /link/by/subway/seoul 구문을 사용할 수 있다. 날짜별 열차 시각·좌석·운임은 코레일에서 확인하며 현재 앱이 실시간으로 조회했다고 표시하지 않는다.

`travelOverrides`는 optional mapping leg.id -> {minutes:number}이며 사용자가 지도에서 확인해 입력한 계획 시간이다. 새 동선에서는 일치하는 구간만 반영하고 순서 변경으로 사라진 구간의 값은 합산하지 않는다. 표시 출처는 '직접 입력'. 미입력 구간이 있으면 총시간은 null, knownTravelMinutes는 부분합이다. 과거 저장본을 열 때 해당 overrides를 복원한다.

## 화면 기준

Layout: 공통 - 여행 결정과 실행 -> 기존 중앙 모바일 shell + document scroll + 고정 주 행동/하단 탐색 유지. 각 화면은 한 행동을 강조한다.
Layout: 지역 - 도시/기차 접근/머무를 장소 수/선택 -> 간결한 비교 카드. 미확인 가상 총액 대신 실제로 판단할 정보를 쓴다.
Layout: 코스 - 출발·장소·복귀 -> ordered timeline, 각 구간의 길찾기와 선택적 시간 입력. 장소 주소/운영은 상세에 모은다.

상단의 개발·시연·규칙 엔진·계약·근거 ID·스냅샷 등 기술 문구를 제거한다. 새 실제 코스에는 가상 표지나 생성 장소 사진을 재사용하지 않는다. 과거 가상 코스에는 '이전 예시 코스'와 필요한 짧은 구분을 유지한다. 현재성·휴무·예산 미확인처럼 여행 결정에 필요한 정보는 삭제하지 않고 한 줄 안내/장소 상세/공식 안내로 배치한다.

검증: 기존85개 회귀, 실제/가상 혼합 저장 이력, null합계, 날짜휴무, 링크인코딩, 순서변경/사용자 입력시간, 실제 3개 지역 UI선택·편집·저장·새로고침·과거본 재열람, 390/1440과 CTA/대비. 실제 교통시간 검증과 URL 열림을 구분한다.
