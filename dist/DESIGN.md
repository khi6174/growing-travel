# Growing Travel MVP 디자인 적용 기준

2026-10-27 D23 / P27. 승인한 [여행자용 와이어프레임](../wireframes/traveler-service/DESIGN.md)을 기존 동작에 적용한다. 새 메모리 시연으로 대체하지 않는다. 동선·쿠폰의 시각 방향을 유지하며 실제 가상 계산, 공식 혜택 출처, 명시적 저장과 과거 스냅샷을 보존한다.

## 사용자와 정보 우선순위

20대 혼자·무차량·기차/대중교통·도보 여행자. 홈에서 여행을 시작하고 취향 → 여행 조건 → 지역 → 경험 → 코스로 진행한다. 혜택·저장한 코스·내 설정은 하단에서 독립적으로 접근한다. 설정과 여행 취향은 같은 폼을 문맥에 맞게 보여 중복 입력·저장 상태를 만들지 않는다.

홈은 여행 시작, 입력 화면은 현재 단계와 다음 행동, 지역은 비교 수치와 선택 이유, 경험은 내용·근거·담기, 코스는 역에서 시작해 돌아오는 동선·편집·저장, 혜택은 개인 조건과 공고 상태를 먼저 보여준다.

## 시각 토큰

기존 `styles.css` 뒤에 `traveler.css`를 읽는다. 새 적용 규칙은 이 파일로 모으고 이전 원본·이력은 보존한다. 흑연 #202124, 보조 #62656D, 코발트 #3651E8, 강조 배경 #EEF1FD, 흰색 #FFFFFF, 바탕 #ECEEF1, 내부 바탕 #F5F6F8, 구분선 #DFE2E9, 입력선 #8E9197을 사용한다. 오류는 #A62B25. 공간은 4/8/12/16/20/24/32/40px, 제목 24/28/32px, 본문·버튼 14/16px, 메타 11/12/13px. 글꼴은 Malgun Gothic, Segoe UI. 카드20px, 입력12px, 태그6px, 탐색24px, 주 버튼999px. 조작 높이는 최소44px, 주 행동52px.

## 배치와 스크롤

Layout: 앱 전체 - 한 화면에서 한 단계 판단 -> content-limiter + document stack; scroll owner: document; fixed regions: sticky header and bottom navigation; anti-patterns: 2중 본문 스크롤, 고정 버튼에 가린 마지막 필드, 넓은 데스크톱 운영자 화면.

Layout: 주 행동 - 긴 폼에서도 다음 행동 발견 -> fixed action bar; scroll owner: document; action sits above bottom navigation with trailing content clearance; anti-patterns: 모든 보조 버튼을 고정, 다른 폼의 입력을 제출, 확인란을 읽을 수 없게 가림.

하단 탐색 뒤에는 흰 배경을 두어 버튼 사이로 스크롤 본문이 비치지 않게 한다. 터치와 키보드 조작을 받지 않는 장식층이며, 본문 끝 여백은 그대로 유지한다. 반복 간격·글자·모서리·조작 크기는 기존 `--refine-*`, `--radius-*`와 필요한 `--travel-*` 토큰을 공유한다. 토큰 치환은 775개 일반 선언의 해석값을 바꾸지 않음을 별도로 확인했다.

Layout: 코스 - 역·이동·경험·복귀 순서 읽기 -> ordered timeline + stack; scroll owner: document; anti-patterns: 동선과 편집의 별도 화면 분리, 미확인 구간을 0분으로 표시, 실제 혜택을 가상 비용에서 차감.

Layout: 혜택 - 개인 조건과 공고 판단을 구분 -> ticket + disclosure; scroll owner: document, modal details owns its overlay scroll; anti-patterns: 쿠폰을 신청 확정으로 소개, 지역·경험 카드에 반원 홈 재사용.

최대 폭520px의 모바일 앱을 큰 화면에서 중앙에 둔다. 홈·취향·여행 조건·지역·경험·코스·혜택·저장·내 설정의 9개 문맥을 연결한다. 주요 CTA는 입력 뒤/후보 설명 뒤/하단 메뉴 위라는 와이어프레임 위치 원칙을 따른다. 브라우저 저장 계약에 맞춰 분 단위·나이1~120·인원1~6은 유지한다.

## 구성과 상태

공통: site-header, journey-progress/steps, primary-action-bar, bottom-nav, field-pair, condition-summary, region-stats, experience-card, course-timeline, benefit-ticket, dialogs. 선택은 코발트 잉크와 옅은 면, 초점은3px 링, 오류는 입력과 연결된 설명으로 표시한다. 입력은 화면 이동으로 버리지 않는다. 긴 출처·이유는 펼침 영역으로 보존한다.

station/garden/bookstore PNG는 기존에 생성한 가상 시연 자료다. 새 장소 사진이나 실제 방문 증거를 만들지 않는다. 이미지 외의 입력·카드·버튼·동선은 모두 실제 DOM이다. 다크 테마는 이번에 추가하지 않는다.

## 검증

동일4177 origin의 기존 저장본 재열람, 새 코스 저장·새로고침, 설정/과거 조건 분리, 독립 혜택, 오류 초점, 하단 버튼과 마지막 필드, 390/1440 화면을 확인한다. 검사와 한계는 [구현 기록](../plans/12_WIREFRAME_TO_MVP.md)에 분리한다. 실제 후기·실시간 경로·예약·결제·배포는 포함하지 않는다.
