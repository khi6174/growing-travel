# 03. 데이터 및 AI 계약

상태: CODEX_START와 PDF S05를 반영한 기준 초안. 별도 전달 패키지 docs 원문 미확보. 아래는 D01·D06~D08을 구현하기 위한 **논리 계약 제안**(P02~P13)이다. DB 스키마·API 경로·라이브러리·AI 제공사·모델은 확정하지 않는다. [결정 장부](00_DECISIONS_AND_SOURCES.md)의 Q03~Q08을 확인한다.

## 공통 의미

- ID는 논리 식별자다. 생성 방식은 기술 선택 후 결정한다.
- 시각은 시간대가 있는 형식으로, 소요 시간은 분, 거리와 금액은 단위·통화와 함께 표현한다.
- 누락/알 수 없음, 명시적으로 상관없음, 값 0을 구분한다. 미확인 시간·가격을 0으로 채우지 않는다.
- 가상 여부, 자료 출처, 방문 확인 수준, 공개·활용 권한은 서로 다른 속성이다.
- 추천 반영은 검색·정렬·설명에 필요한 정보 활용을 의미한다. 모델 재학습이나 외부 제공사의 학습 동의를 뜻하지 않는다.

## 논리 데이터

| 대상 | 핵심 필드 제안 | 불변 조건 |
| --- | --- | --- |
| TravelContext | contextId, regionText?, destinationStatus, availableMinutes, interests, optionalBudget, companions, mobility, accessibility, avoid, version | 첫 흐름은 양의 가능 시간·관심 필수 제안. 목적지 미정 허용. 지역·날짜·시간대·이동 근거가 없으면 해당 적합 여부는 unknown |
| Experience | experienceId, activitySummary, placeRef?, visitContext, positives, drawbacks, durationEstimate?, provenance, synthetic, evidenceRefs, accessScope | 방문 당시 계절·시간·날씨·동행·이동 조건 포함. 출처와 가상 여부 보존. 현재 운영정보와 분리. 타인 비공개 자료 제외 |
| Evidence | evidenceId, sourceType, sourceLocator?, observedAt?, claimScope, verificationLevel, accessScope | 어느 사실을 뒷받침하는지 명시. 참조 존재·접근 권한을 검증. 생성된 설명은 검증 증거가 아님 |
| RecommendationRun | requestId, contractVersion, contextSnapshot, allowedExperienceIds, results, generatedAt, engineKind, status | 결과는 요청의 허용 후보만 참조. engineKind는 rules/model 등 실제 수행 경로만 기록 |
| Course | courseId, ownerRef, title, orderedItems, contextSnapshot, estimate, feasibility, sourceRequestId, version, savedAt | 빈 항목 금지. 사용자 순서 보존. 저장이 예약·방문·공개를 뜻하지 않음 |
| CourseItem | experienceId, order, displaySnapshot, evidenceRefs, synthetic, durationEstimate?, transitionEstimate? | 가상 표시와 불확실성 보존. 공개 철회 자료의 본문을 무기한 복제하지 않음 |
| TravelRecord | recordId, ownerRef, courseId?, experienceId?, occurredAt?, visitContext, reflection, mediaRefs?, positives, drawbacks, originalPlan?, changeReason?, relatedExperienceIds?, satisfaction?, visibility | 기본 private. 선택 자료 최소 수집. AI 정리 초안·작성자 확인 상태 구분. 타인 비공개 접근 금지 |
| PublicationConsent | consentId, recordId, ownerRef, publicFields, allowRecommendationReuse, status, grantedAt?, revokedAt?, version | 공개된 필드와 재사용 허용 범위만 사용. 기록 소유자의 명시적 변경이 필요 |
| VisitConfirmation | confirmationId, recordId, claimedVisitAt?, actorRef, method, evidenceRefs, level | 작성자 자기 보고와 외부 자료 확인을 구분. 가상 자료를 실방문 확인으로 승격 금지 |
| PreferenceUse | useId, ownerRef, sourceRecordIds, contextVersion, purpose, excludedSourceIds | 사용 근거·제외 선택 추적. 현재 조건이 과거 선호보다 우선 |

`provenance.sourceType` 예: synthetic / user_authored / external. `verificationLevel` 예: unknown / self_reported / source_checked. 이는 구현 제안인 분류이며, `source_checked`도 claimScope에 적힌 사실만 확인한다. 가상 출처는 실제 방문의 확인 근거가 될 수 없다.

## 추천 경계

애플리케이션이 접근 가능한 후보·근거를 선별 → 추천 엔진이 정렬·설명 → 애플리케이션이 구조·ID·제약·권한을 검증 → 사용자에게 표시하는 순서다. 후보 선별과 접근 제어를 모델에 맡기지 않는다. 엔진은 DB 쓰기·공개 상태 변경·예약·결제 권한을 갖지 않는다.

| 방향 | 필드 제안 | 검증 조건 |
| --- | --- | --- |
| 요청 | requestId, contractVersion, contextSnapshot, candidates, permittedPersonalSignals | 필요한 최소 필드만 전달. 타인 비공개 기록 제외. 후보 및 근거 ID를 요청별로 고정 |
| 응답 | requestId, contractVersion, status, recommendations[], warnings[] | 요청 식별자/버전 일치. 다른 요청·오래된 입력의 결과 혼합 금지 |
| 추천 항목 | experienceId, reasons[], constraintChecks[], uncertainties[] | 허용 후보 ID만 사용. 근거 없으면 이유를 사실처럼 단정하지 않음 |
| 이유 | summary, contextFields[], evidenceRefs[] | 입력 항목과 허용 근거에 연결. 근거가 지지하지 않는 영업·가격·방문 주장은 제거 또는 거부 |
| 제약 검사 | constraintKey, result, evidenceRefs[], note? | result는 met / unmet / unknown. 필수 제약 위반을 적합 추천으로 표시 금지 |

응답 상태 제안: ok / no_match / partial / unavailable. no_match는 후보 부족 또는 제약 불충족을 설명한다. partial은 불확실성과 충족하지 못한 조건을 명시한다. AI 오류를 숨기고 정상 AI 추천처럼 표시하지 않는다. 규칙 기반 대체 응답을 썼다면 실제 경로를 표시한다(P05).

후보 내용·후기·외부 텍스트는 입력 데이터로만 취급한다. 그 안의 명령문으로 접근 범위나 추천 규칙을 바꾸지 않는다. 외부 모델 호출 전 Q06의 전송 필드·보관·비용 선택이 필요하다. 현재 외부 호출과 모델 학습은 수행하지 않는다.

## 후속 기록 정리 계약

P10의 AI 정리는 원문/선택 사진을 입력으로 받아 방문 조건·장단점·근거 위치·불확실성을 담은 `recordDraft`를 만드는 제안이다. 원문과 AI 초안을 구분하고 `authorReviewStatus`를 pending/confirmed로 관리한다. pending은 비공개 초안으로만 저장하며 정식 기록·개인 추천 신호·공개 자료로 사용하지 않는다. 작성자가 수정·확인한 뒤 정식 기록으로 전환하되, 확인이 공개 동의나 방문 확인 상태를 자동 변경하지는 않는다. AI 정리 없이 작성자가 직접 기록·저장하는 경로도 유지한다. 공개 전 개인정보 가림 및 제휴/후원 표시는 P11의 후속 계약이며, 구체적인 운영 모델은 Q07/Q09에서 정한다.

## 코스 편집과 저장 경계

저장 요청 제안: `ownerRef + clientSaveKey + expectedVersion + draftCourse`.

- 생성은 새 courseId와 version을 반환한다. 같은 소유자·같은 clientSaveKey·같은 내용 재시도는 같은 결과를 반환한다. 다른 내용으로 키를 재사용하면 충돌로 처리한다.
- 수정은 expectedVersion을 확인한다. 충돌 시 사용자 초안을 보존하고 최신본 확인·다시 적용 경로를 제공한다.
- ownerRef는 신뢰 가능한 실행 경계에서 결정한다. 사용자 입력 문자열만 믿고 타인의 코스를 열거나 수정하지 않는다. 로컬 시연일 경우 단일 사용자 범위와 한계를 명시한다(Q04).
- 저장 후 재조회에서 제목·선택·순서·가상 표시·근거·가정이 유지돼야 한다. 재시작 후 유지 범위와 새로고침 동작은 Q04에서 결정하여 검사에 반영한다.
- 총 시간은 활동과 이동 추정치를 합산한다. 이동 시간이 없으면 합계는 부분 추정/unknown이며 충분히 가능하다고 표시하지 않는다. 시간 초과·unknown 초안은 경고를 확인한 뒤 저장 가능하게 하는 제안이며, 빈 코스·알 수 없는 참조는 거부한다.

오류 분류 제안: INVALID_CONTEXT, NO_MATCH, INVALID_REFERENCE, ENGINE_UNAVAILABLE, SAVE_FAILED, VERSION_CONFLICT, ACCESS_DENIED. 화면은 복구 가능한 행동을 제공하며 개인정보나 내부 키를 오류 내용으로 노출하지 않는다.

## 공개·철회·방문 후 확인

사용자 기록을 다른 여행자의 추천에 재사용하는 조건 제안: `visibility = public` AND `consent.status = active` AND `allowRecommendationReuse = true` AND 요청한 필드가 `publicFields`에 포함됨. 내 비공개 확정 기록은 나의 추천용 신호로만 사용한다. 외부·공공 정보와 팀 직접 확인 자료는 이 사용자 공개 동의 조건 대신 Q05의 이용 권한·출처·확인 범위를 적용한다. 모든 자료는 데이터 저장 계층과 후보 생성 경계에서 접근 조건을 확인한다.

철회 후 새로운 조회·다른 사람의 새 추천에서 해당 본문을 제외한다. 캐시·추천 스냅샷·이미 저장된 코스도 접근 시 권한을 다시 확인하고, 철회된 개인 내용은 표시하지 않는 것을 제안한다. 저장된 순서와 비개인 메타데이터는 유지할 수 있으나, 철회된 근거는 접근 불가로 표시한다. 이미 공유·내보낸 사본 회수 보장을 하지 않는다. 삭제 범위·처리 시점·보관은 Q07에서 확정한다.

방문 체크는 self_reported이다. 별도 자료로 특정 사실을 확인하더라도 후기 전체의 진실성, 만족, 현재 영업을 자동 보증하지 않는다. 위치 추적이나 영수증 수집은 현재 결정하지 않았다(Q08).

## 첫 구현에서의 적용 범위

TravelContext, Experience, Evidence, RecommendationRun, Course, CourseItem을 우선 구현한다(P01). TravelRecord, PublicationConsent, VisitConfirmation, PreferenceUse 및 recordDraft는 후속 계약이다. 첫 시연 데이터에 비공개 타인 기록을 넣지 않으며, 향후 확장을 위해 출처·가상 여부·접근 범위 필드를 유지한다. [첫 과제](../plans/02_FIRST_VERTICAL_SLICE.md)와 [완료 기준](05_ACCEPTANCE_TESTS.md)을 함께 사용한다.

## D12 개인 설정·여행 조건 확장

아래는 P18의 로컬 시연 계약이며 운영 서비스의 최종 데이터베이스·개인정보 정책이 아니다. 실제 필드와 실행 결과는 [확장 기록](../plans/04_PROFILE_TRIP_DEMO.md)에서 확인한다.

| 자료 | 필드/범위 | 경계 |
| --- | --- | --- |
| 개인 설정 | 선택적인 입력 만 나이·거주 지역, 관심, 걷기 허용량 | 성별·정밀 주소·신분증 수집 없음. 혜택용 거주지와 여행 출발역을 별도로 보관. 저장은 명시적 선택이며 현재 화면에서만 사용 가능 |
| 이번 여행 조건 | 가상 출발역, 여행일, 가능 시간, 1인 예산, 인원, 도보 한도, 계단 회피 | 인원 기본 1명. 형식·범위 검증. 과거 입력을 현재 프로필 변경으로 조용히 갱신하지 않음 |
| 가상 지역·동선 | 지역·역·구간·가상 시간·가격·도보량·출처 유형 | 모든 계산값은 시연 설정. 실제 경로·교통편·안전·귀가 가능성의 근거가 아님. 알 수 없는 값은 unknown |
| 가상 지역 혜택 | 교통·숙박·여행·문화 예시, 연령/거주/기간 조건, 후보/불일치/확인 필요 상태 | 실제 지원 사업이 아님. 입력 조건상 후보도 적용 확정이 아님. 조건·신청/사용 기간을 구분하고 할인액 자동 차감 없음 |
| 공식 혜택 안내 | 명칭·분류·공식 URL·확인일·확인 수준·미확인 사항 | 별도 안내 자료. 가상 지역에 적용하지 않으며 프로필만으로 수혜·현재 신청 가능을 판정하지 않음 |
| 코스의 journeySnapshot | 당시 개인 설정·여행 조건·선택 지역·가상 동선/비용·혜택 비교 스냅샷 | 신규 코스의 선택 확장. 기존 저장본에는 없어도 유효. 실제 데이터로 승격하지 않고 재열람 시 당시 조건과 현재 정보의 차이를 알림 |

기존 코스 저장 키와 버전/중복 요청 경계를 유지한다. 개인 설정은 별도 저장 키를 사용하므로 설정 저장·삭제가 코스 목록을 초기화하지 않는다. 설정 삭제는 코스에 보존한 과거 입력 스냅샷까지 지우는 전체 개인정보 삭제 기능을 뜻하지 않는다. 손상된 설정이나 코스를 자동 덮어쓰지 않으며, 실패 시 현재 편집값을 유지한다. 기존 코스의 journeySnapshot 부재는 오류가 아니라 확장 전 저장 형식이다.

추천·동선·혜택 비교는 규칙 기반이고 외부 AI에 개인 설정을 전송하지 않는다. 실제 후기·별점·게시판 데이터 및 공개 API는 이 확장에 포함하지 않는다.

## D14 혜택 목록·대학생 여부 확장

P20은 기존 로컬 데이터 계약에 선택적 필드와 독립 공식 안내를 추가하는 구현 선택이다. 운영 자격 인증·새 계정·외부 AI 호출을 도입하지 않는다.

| 자료 | 이번 계약 | 보존·표시 경계 |
| --- | --- | --- |
| 개인 설정의 `studentStatus` | `unspecified` / `student` / `not_student`. 선택하지 않으면 `unspecified` | 자기 보고다. 나이로 대학생을 추정하지 않고 학교명·학생증·재학 증빙을 수집하지 않음. 허용하지 않은 값은 오류로 처리 |
| 기존 개인 설정 | 대학생 필드가 없는 기존 설정도 읽을 수 있음 | 누락은 미입력으로 해석. 기존 키·나머지 설정 유지. 읽기만으로 저장 자료를 갱신하지 않음 |
| 기존 코스의 `profileSnapshot` | 필드가 없는 과거 스냅샷과 대학생 여부가 있는 새 스냅샷을 구분 | 과거 원형과 검증 경계 유지. 현재 설정 변경으로 과거 코스 내용을 자동 재작성하지 않음. 수정·저장 후 재열람 호환을 검사 |
| 공식 혜택 목록 | 명칭·분류·공식 URL·확인일·확인 수준·기간·대상 조건·제약/미확인 사항 | 가상 혜택과 독립. 기간 정보가 확인된 경우에만 기준일과 비교해 진행 상태를 표시. 신청 기간·이용 기간의 의미를 섞지 않음 |
| 진행 상태 | 공식 기간상 진행 중 / 예정 / 종료 / 현재 확인 필요를 구분하는 표시 규칙 | 정적 확인일 이후 조기 종료·잔여 수량·예산 소진은 별도 확인. 기간이 없거나 불명확하면 현재 모집을 추정하지 않음. 화면 상태명·내부 필드명은 구현 선택 |

대학생 여부는 실제 기관의 학생 자격 정의를 대신하지 않는다. 재학생·휴학생·대학원생 등 인정 범위와 증빙은 혜택마다 다르므로 이 값 하나로 신청 가능·수혜 확정을 반환하지 않는다. 사용자 미입력도 불일치가 아닌 확인 필요다. 공식 혜택 표시가 가상 지역 적용·가상 예산 차감·자동 신청·예약으로 이어지지 않는다.

혜택 목록 열람은 개인 설정의 유효성이나 여행 추천 단계와 독립적이다. 실제 운영용 갱신 담당·검증 주기·조기 종료 감지·자격 인증은 Q10에 남긴다. 구현·호환 검사의 실제 결과는 [혜택·대학생 설정 기록](../plans/06_BENEFITS_STUDENT.md)에 기록한다.

## D15 개인 조건 비교 계약 — P21

공식 혜택에 붙는 비교 규칙은 공식 자료가 뒷받침하는 개인 조건만 담는다. 가상 지역 혜택과 별개의 계약이며, 외부 모델이 자격을 추정하거나 저장·신청을 실행하지 않는다. 표시 결과는 읽기 시 계산하고, 기존 코스의 당시 혜택·개인 설정 스냅샷을 새로운 결과로 덮어쓰지 않는다.

| 대상 | 구현 계약 | 경계 |
| --- | --- | --- |
| 비교 입력 | `age`, `residenceRegion`, `studentStatus`와 한국 기준일 | 선택 값 누락과 불일치 구분. 여행 출발지·목적지를 거주지로 사용하지 않음 |
| `matchRules` | 근거 확인 여부, 나이 범위 또는 출생연도, 거주 조건/추가 지역 확인, 학생 조건, 나머지 확인 목록 | 근거가 없으면 규칙을 추측하지 않음. 상세 구조는 로컬 구현 선택 |
| `evaluateBenefitMatch` | `status`, `label`, `reasons`, `missingFields`, `checks`, `remainingChecks` | `checks`의 비교 결과는 `met / unmet / unknown / not_used`. 이 결과는 기관의 공식 심사가 아님 |
| 개인별 `status` | `candidate / needs_info / not_matched / not_current` | 각각 조건이 맞는 후보 / 추가 확인 필요 / 알려진 조건 불일치 / 현재 기간 아님. `eligible`, `approved` 같은 확정 표현을 반환하지 않음 |
| 공고 상태 | 기존 `benefitStatus`의 기간·상시 안내·확인 필요 | 개인별 상태와 별개. 신청 종료를 사용 기한으로 연장하지 않고 종료된 혜택을 현재 후보로 올리지 않음 |
| `rankBenefits` | 상태 순서에 따라 새 배열 반환, 각 항목에 개인별 비교 결과 포함 | 입력 개인 설정·공식 자료·저장 자료를 변경하지 않음. 현재 필터 안에서 후보→추가 확인→불일치→기간 아님 순서 |

확인된 조건 불일치는 `not_matched`, 필요한 정보나 근거 부족은 `needs_info`로 구분한다. `candidate`여도 가입·본인/재학 인증·과거 수혜·잔여 예산·사용처 같은 남은 확인 사항을 함께 반환한다. 학생 자기 보고는 서류 인증이 아니며 학생 조건이 없는 사업은 학생 여부를 사용하지 않았다고 설명한다. 출생연도 기준은 만 나이와 동일하지 않으므로, 가능한 출생연도 범위가 대상과 확실히 겹치지 않는 경우를 제외하면 출생연도 추가 확인을 남긴다. 해당 추론 경계와 자료 변경은 자동 검사 및 출처 기록으로 관리한다.

공식 조건의 AND/OR 관계를 보존한다. 예를 들어 나이 조건 또는 학부생 조건 중 하나로 가능한 사업은 나이 경로가 맞으면 학생 여부 미입력·비대학생 때문에 탈락시키지 않는다. 반대로 일반적인 대학생 자기 보고가 ‘학부생’ 조건까지 확정하는 것은 아니므로, 연령 경로에 맞지 않는 대학생에게는 학부생 여부·증빙 추가 확인을 남긴다.

확인된 학생 전용 사업·시군구 참여 목록 등이 없으면 그 필드로 임의 우대를 하지 않는다. 학교명·생년월일·정밀 주소를 이번 비교 기능 때문에 새로 수집하지 않는다. 운영에서 필요한 추가 입력·증빙·보관은 Q10의 후속 결정이다.
