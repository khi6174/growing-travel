# Growing Travel · Codex 전달 (디자인 2차) — 여기서 시작

작성: 2026-10-26 (Asia/Seoul). Claude 디자인 캔버스에서 정리한 최종 디자인안을 Codex가 로컬 시연(`dist/`)과 비교·반영할 수 있게 묶었다. 디자인 제안과 화면 원본이며 구현 완료·실기기 검사·최종 브랜드 승인 자료가 아니다.

## 이 전달의 위치

- 1차 전달: [디자인 개발 전달](../claude/DESIGN_HANDOFF_2026-10-26.md). Codex는 이 문서로 D18·P22 작업을 했고 결과는 [디자인 구현 기록](../../plans/09_DESIGN_IMPLEMENTATION.md)에 있다. 당시에는 비공개 캔버스의 원본과 화면을 받지 못했다.
- 2차 전달(이 폴더): 캔버스 화면 **원본 HTML 23개**와 **화면 사진 21장**을 함께 준다. 1차 이후 사용자가 승인한 시각 수정과, 디자인 스킬로 점검해 고친 접근성 항목이 들어 있다.
- 우선순위: 사용자의 최신 직접 지시 → [결정 장부](../../docs/00_DECISIONS_AND_SOURCES.md)의 D 항목 → 이 폴더의 [디자인 명세](DESIGN_SPEC.md) → 화면 사진·원본 → 1차 전달 문서. 사진과 명세가 다르면 명세와 원본 HTML을 따른다.

## 폴더 구성

| 경로 | 내용 |
| --- | --- |
| [00_START_HERE.md](00_START_HERE.md) | 이 안내 |
| [PASTE_THIS_REQUEST.txt](PASTE_THIS_REQUEST.txt) | Codex에 붙여 넣을 요청문 |
| [DESIGN_SPEC.md](DESIGN_SPEC.md) | 색·글꼴·간격·모서리, 컴포넌트, 문구 규칙, 접근성, 화면별 설명 |
| `screens/` | 화면 사진 21장(PNG). 휴대폰 화면은 390px 폭을 2배로 찍었다 |
| `source/` | 캔버스 대지 원본 23개(`.dc.html`). 인라인 스타일이라 색·크기·간격 값을 그대로 읽을 수 있다 |
| [MANIFEST.json](MANIFEST.json) | 파일별 크기와 SHA-256 |

압축본: [Growing_Travel_Codex_Design_2026-10-26.zip](../Growing_Travel_Codex_Design_2026-10-26.zip) (이 폴더와 같은 내용).

## 1차 전달 이후 바뀐 점 (Codex 구현과 비교할 것)

사용자 승인(2026-10-26, Claude 세션)으로 캔버스에 반영했다. 결정 장부에는 아직 D 항목으로 기록하지 않았다.

1. **내 조건 요약**: ‘만 23세 · 서울 · 대학생’ 한 줄 대신 ‘나이 / 거주 / 학생’ 이름표와 값 3칸. 학생 값 아래에 ‘본인 입력’.
2. **가운뎃점 줄이기**: 메타 문장은 쉼표로 잇는다(예: “공고 기간 중, 11-08까지, 마감 확인”). ‘맞는 이유’ 같은 이름표는 문장 앞 점이 아니라 문장 위 한 줄.
3. **화살표 대신 문장**: “만 23세라서 ‘만 24세 이하’ 조건에 맞아요.” 실제 순서를 보여 주는 경로(안개정원 → 느린 서가 → 햇살 식탁)만 화살표 유지.
4. **티켓 반원 홈**: 혜택 카드의 절취선 양끝에만 반원 홈. 지역·저장 코스 카드는 점선만.
5. **모서리 위계**: 카드 20 / 입력·안내 상자·요약칸 12 / 태그 6 / 하단 메뉴 24 / 버튼 알약형.
6. **테두리 #8E9197, 최소 글자 12px**: 입력·칩·선택지 테두리는 흰 바탕 약 3.2:1. 11px 이하 글자 없음.
7. **접근성·상호작용(웹 인터페이스 규칙 점검)**: 보이는 포커스 링(코발트 3px), 하단 메뉴·시트 아래 안전 영역 여백, 입력 `name`·`autocomplete`, 시트 `overscroll-behavior: contain`, 숫자 `tabular-nums`, 제목 `text-wrap: balance`, `prefers-reduced-motion` 존중.
8. **입력 오류 때 버튼**: 조건 시트에서 오류가 있어도 적용·저장 버튼을 비활성으로 막지 않는다. 누르면 첫 오류 필드로 포커스를 옮기고 안내 문구를 보여 준다. [구현 기록](../../plans/09_DESIGN_IMPLEMENTATION.md)의 현재 동작(버튼 비활성)과 다르다.

코발트 `#3651E8`과 글꼴은 그대로 둔다(사용자 결정). 캔버스는 Google Fonts의 Gothic A1을 썼지만, Codex 구현처럼 외부 글꼴 없이 로컬 대체 글꼴을 써도 된다.

## 화면 사진 목록

| 번호 | 화면 | 원본 |
| --- | --- | --- |
| [01](screens/01_IA_FLOW.png) | 정보 구조와 핵심 흐름(초기 색) | `source/IAFlow.dc.html` |
| [02](screens/02_BENEFIT_LIST.png) | 혜택 목록 · 요약 카드와 펼치기(처음 상태: 국립현대미술관 펼침) | `source/BenefitListCompact.dc.html` |
| [03](screens/03_STATE_CANDIDATE.png) | 상태 · 후보 있음(가상 혜택 A) | `source/StateCandidate.dc.html` |
| [04](screens/04_STATE_NEEDS_INFO.png) | 상태 · 미입력, 추가 확인만 | `source/StateEmpty.dc.html` |
| [05](screens/05_STATE_MISMATCH_UNSAVED.png) | 상태 · 알려진 조건 불일치 + 저장 전 안내 | `source/StateMismatch.dc.html` |
| [06](screens/06_STATE_NOT_CURRENT.png) | 상태 · 현재 기간 아님 | `source/StateEnded.dc.html` |
| [07](screens/07_STATE_FILTER_EMPTY.png) | 상태 · 필터 결과 0개 | `source/StateNoResult.dc.html` |
| [08](screens/08_STATE_LOAD_ERROR.png) | 상태 · 불러오기 오류 | `source/StateError.dc.html` |
| [09](screens/09_CONDITION_SHEET.png) | 조건 수정 시트 | `source/ConditionSheet.dc.html` |
| [10](screens/10_CONDITION_SHEET_ERROR.png) | 조건 수정 시트 · 입력 오류 | `source/ConditionSheetError.dc.html` |
| [11](screens/11_REASON_DETAIL.png) | 조건 이유 상세(국립현대미술관) | `source/ReasonDetail.dc.html` |
| [12](screens/12_STUDENT_ROUTE.png) | 학생 경로 표시가 있는 목록 | `source/StudentChip.dc.html` |
| [13](screens/13_STUDENT_FILTER_ON.png) | ‘학생 조건 있음’ 필터 적용 | `source/StudentChipOn.dc.html` |
| [14](screens/14_TRIP_CONDITIONS.png) | 여행 2/5 · 여행 조건 | `source/TripConditions.dc.html` |
| [15](screens/15_TRIP_REGIONS.png) | 여행 3/5 · 지역·혜택 비교 | `source/TripRegions.dc.html` |
| [16](screens/16_TRIP_EXPERIENCES.png) | 여행 4/5 · 경험 추천·근거 | `source/TripExperiences.dc.html` |
| [17](screens/17_TRIP_COURSE.png) | 여행 5/5 · 코스 편집·저장 | `source/TripCourse.dc.html` |
| [18](screens/18_TRIP_COURSE_SAVE_ERROR.png) | 코스 저장 실패 | `source/TripCourseError.dc.html` |
| [19](screens/19_SAVED_COURSES.png) | 저장한 코스 · 저장 완료 | `source/SavedCourses.dc.html` |
| [20](screens/20_COMPONENTS.png) | 컴포넌트와 색·글꼴·간격 정리 | `source/Components.dc.html` |
| [21](screens/21_REFINEMENT.png) | 스킬 점검 결과와 시각 개선 제안(1~4 반영, 5·6 보류) | `source/Refinement.dc.html` |

`source/Handoff.dc.html`은 1차 전달 문서와 같은 내용의 대지라 사진을 따로 만들지 않았다.

## 사진·원본 읽는 법

- 사진은 원본 HTML을 이 PC의 Edge 헤드리스로 렌더링해 찍었다(390×844 기준, 2배). 비공개 캔버스 화면 자체를 찍은 것은 아니다. 혜택 목록(02)은 대화형 대지라 처음 상태(국립현대미술관 펼침)를 정적으로 렌더링했다.
- 원본의 `<x-dc>`·`<helmet>`·`<sc-for>`·`<sc-if>`·`{{ }}`는 캔버스 도구의 템플릿 문법이다. 스타일 값과 마크업 구조를 참고하고 그대로 앱에 옮기지 않는다.
- 휴대폰 화면은 스크롤 중 한 구간이다. 화면 아래쪽이 하단 메뉴에 가려 보이면 원본에서 나머지 내용을 확인한다.
- 사진 속 나이·지역·코스 이름은 가상 입력이고, 여행 장소·동선·가격·지역 혜택은 가상 자료다. 공식 혜택 7개는 2026-10-24 확인 자료이며 이후 공고를 다시 확인하지 않았다.

## 작업할 때 지킬 것

[작업 기준](../../AGENTS.md)을 따른다. 특히 기존 파일을 통째로 교체하지 않고, 사용자 결정(D)·구현 제안(P)·미확정(Q)을 구분하며, 수행한 검사만 결과로 보고한다. 배포·유료 가입·Git 커밋·푸시·외부 신청은 하지 않는다. 자동 검사는 `node --test tests/*.test.mjs`, 문서 검사는 `node scripts/check-docs.mjs`다.
