// Fictional regional examples and official reference links are separate data types.
// No official benefit is evaluated against an invented destination.
export const SYNTHETIC_BENEFITS = Object.freeze([
  { id: 'demo-transport', regionId: 'onyu', title: '가상 청년 역 연결 지원', category: '교통', minAge: 19, maxAge: 29, residenceRegion: null, startsOn: '2026-01-01', endsOn: '2026-12-31', conditions: '입력 만 나이 19~29세 · 2026년 여행일 · 가입·예산 조건은 확인 필요', synthetic: true, sourceType: 'synthetic', sourceLabel: '창작한 혜택 · 신청하거나 사용할 수 없는 시연 예시' },
  { id: 'demo-culture', regionId: 'onyu', title: '가상 전시 산책 혜택', category: '문화', minAge: 19, maxAge: 24, residenceRegion: '서울', startsOn: '2026-10-01', endsOn: '2026-11-30', conditions: '입력 만 나이 19~24세 · 거주 시·도 서울 · 여행일 2026-10-01~11-30', synthetic: true, sourceType: 'synthetic', sourceLabel: '창작한 혜택 · 신청하거나 사용할 수 없는 시연 예시' },
  { id: 'demo-travel', regionId: 'baram', title: '가상 바람마을 여행 지원', category: '여행', minAge: 20, maxAge: 29, residenceRegion: null, startsOn: '2026-10-01', endsOn: '2026-11-15', conditions: '입력 만 나이 20~29세 · 여행일 2026-10-01~11-15 · 예산 조건 확인 필요', synthetic: true, sourceType: 'synthetic', sourceLabel: '창작한 혜택 · 신청하거나 사용할 수 없는 시연 예시' },
  { id: 'demo-lodging', regionId: 'baram', title: '가상 청년 숙박 안내', category: '숙박', minAge: 19, maxAge: 34, residenceRegion: null, requiresOvernight: true, startsOn: '2026-01-01', endsOn: '2026-12-31', conditions: '입력 만 나이 19~34세 · 1박 이상 필요. 현재 시연은 당일 코스로 숙박 조건 불충족', synthetic: true, sourceType: 'synthetic', sourceLabel: '창작한 혜택 · 신청하거나 사용할 수 없는 시연 예시' },
]);

const official = (value) => Object.freeze({ synthetic: false, sourceType: 'official_reference', checkedAt: '2026-10-24', statusLabel: '공식 조건 확인 필요', regionApplicability: 'not_evaluated', ...value });
export const OFFICIAL_BENEFITS = Object.freeze([
  official({ id: 'official-youth', title: '청소년드림', category: '교통', provider: '코레일', kind: '운영기관 할인', url: 'https://korail.go.kr/ticket/discountSystem/youth', verificationLevel: 'search_index_only', summary: '공식 검색 색인에 24세까지, 회원·대상 인증 및 대상 열차 조건 안내.', limitations: '직접 원문 완전 열람 실패. 현재 할인율·판매·좌석·개별 적용 미확인. 정부 현금지원이 아닙니다.' }),
  official({ id: 'official-cheerup', title: '힘내라청춘', category: '교통', provider: '코레일', kind: '운영기관 할인', url: 'https://korail.go.kr/ticket/discountSystem/cheerUp', verificationLevel: 'search_index_only', summary: '공식 검색 색인에 25~33세, 회원·대상 인증 및 대상 열차 조건 안내.', limitations: '직접 원문 완전 열람 실패. 현재 할인율·판매·좌석·개별 적용 미확인. 정부 현금지원이 아닙니다.' }),
  official({ id: 'official-railro', title: '내일로 YOUTH', category: '여행', provider: '코레일', kind: '유료 패스', url: 'https://www.korail.go.kr/tour/freeTravel/railro/passIntro', verificationLevel: 'search_index_only', summary: '공식 검색 색인에 29세 이하, 연속 7일/선택 3일 유형 안내.', limitations: '현재 가격·판매·좌석 조건 미확인. 무료 지원금이 아니며 당일 여행에서 항상 저렴한 것은 아닙니다.' }),
  official({ id: 'official-kpass', title: 'K-패스', category: '교통', provider: '한국교통안전공단', kind: '정부·지자체 지원', url: 'https://main.kotsa.or.kr/portal/contents.do?menuCode=01080300', verificationLevel: 'body_read', summary: '참여 지자체 주민등록 만 19세 이상, 청년 기준 만 19~34세. 카드·가입·등록과 월 이용 기준에 따른 익월 환급 안내.', limitations: '개인 사용 이력·지역 추가 조건 미확인. 이 출처에서 KTX/SRT 개별 적용 여부는 확인하지 못했습니다. 여행 기차표 즉시 할인으로 계산하지 않습니다.' }),
  official({ id: 'official-culture', title: '2026 청년문화예술패스', category: '문화', provider: '문화체육관광부', kind: '정부·지자체 지원', url: 'https://www.mcst.go.kr/site/s_policy/govPolicy/performView.jsp?pSeq=1127', verificationLevel: 'body_read', summary: '2026-08-26 공고에서 2006~2007년생, 공연·전시·영화·도서 분야 안내.', limitations: '20대 전체 대상이 아닙니다. 현재 접수·지역별 잔여 예산·개별 발급·해당 행사 적용은 확인하지 못했습니다.' }),
]);

const labels = { candidate: '입력 조건상 후보', needs_info: '조건 확인 필요', ineligible: '알려진 조건 불일치', expired: '여행일 기준 기간 종료', not_started: '여행일 기준 시작 전' };
export function evaluateBenefits(profile, trip, regionId) {
  return SYNTHETIC_BENEFITS.filter((benefit) => benefit.regionId === regionId).map((benefit) => {
    const reasons = [];
    let status = 'candidate';
    if (trip.date < benefit.startsOn) { status = 'not_started'; reasons.push(`선택한 여행일은 가상 이용 기간 ${benefit.startsOn}보다 앞서요.`); }
    else if (trip.date > benefit.endsOn) { status = 'expired'; reasons.push(`선택한 여행일에는 가상 이용 기간 ${benefit.endsOn}이 지났어요.`); }
    else {
      let missing = false;
      let mismatch = false;
      if (profile.age === null) { missing = true; reasons.push('만 나이를 입력하지 않아 연령 조건을 판단하지 않았어요.'); }
      else if (profile.age < benefit.minAge || profile.age > benefit.maxAge) { mismatch = true; reasons.push(`입력 나이가 가상 조건 ${benefit.minAge}~${benefit.maxAge}세와 달라요.`); }
      else reasons.push(`입력 나이가 가상 조건 ${benefit.minAge}~${benefit.maxAge}세 범위에 들어요.`);
      if (benefit.residenceRegion) {
        if (!profile.residenceRegion) { missing = true; reasons.push('혜택 기준 거주 지역을 입력하지 않았어요.'); }
        else if (profile.residenceRegion !== benefit.residenceRegion) { mismatch = true; reasons.push(`가상 거주 조건 ${benefit.residenceRegion}와 달라요.`); }
        else reasons.push(`입력 거주 지역이 가상 조건 ${benefit.residenceRegion}와 같아요.`);
      }
      if (benefit.requiresOvernight) { mismatch = true; reasons.push('1박 이상이 필요한 가상 혜택이며 현재 시연은 당일 코스예요.'); }
      status = mismatch ? 'ineligible' : missing ? 'needs_info' : 'candidate';
    }
    reasons.push('창작한 시연 예시입니다. 실제 지원·수혜 확정이 아니며 코스 비용에서 차감하지 않아요.');
    return { ...benefit, status, statusLabel: labels[status], reasons };
  });
}
