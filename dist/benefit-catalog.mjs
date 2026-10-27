import { OFFICIAL_BENEFITS } from './benefits.mjs';
import { RESIDENCE_REGIONS } from './profile.mjs';

// Official information snapshots. Never used for synthetic itinerary eligibility or discounts.
// Source evidence and access limits: docs/11_BENEFITS_CATALOG_SOURCES.md.
const catalog = (value) => Object.freeze({ synthetic:false, sourceType:'official_reference', checkedAt:'2026-10-24', verificationLevel:'body_read', schedule:'unverified', ...value });
export const BENEFIT_CATALOG = Object.freeze([
  catalog({ id:'official-stay-2026', title:'2026 대한민국 숙박세일 페스타', category:'숙박', kind:'정부·관광 지원', provider:'한국관광공사', url:'https://ktostay.visitkorea.or.kr/', schedule:'bounded',
    matchRules:Object.freeze({verified:true,age:{birthYearMax:2006},extraChecks:['출생연도와 본인 인증','예약할 숙박업소·여행 사용 지역·입실일','할인권 잔여 수량·중복 사용 여부']}),
    period:Object.freeze({label:'발급·예약·입실 기간', start:'2026-09-22', end:'2026-11-08'}),
    summary:'참여 온라인 여행사에서 국내 등록 숙박업소 예약에 사용하는 할인권 안내입니다.',
    eligibility:'공고상 2006년 출생자까지 · 비수도권 중 세종·충북 제외 · 1인 1매 · 대실 제외. 참여사와 숙박 조건 확인이 필요해요.',
    limitations:'오전 10시 선착순 발급이며 소진될 수 있습니다. 오늘의 잔여 수량은 조회하지 않았어요. 대학생 여부나 입력 만 나이만으로 대상 확정이 되지 않습니다.' }),
  catalog({ id:'official-culture-2026', title:'2026 청년문화예술패스 추가 발급', category:'문화', kind:'정부·지자체 지원', provider:'문화체육관광부', url:'https://www.korea.kr/news/policyNewsView.do?newsId=148969837', schedule:'bounded',
    matchRules:Object.freeze({verified:true,age:{birthYears:[2006,2007]},extraChecks:['정확한 출생연도·국적·본인 인증','기존 발급 이력 및 지역별 잔여 발급','대상 공연·전시·영화·도서와 사용 기한']}),
    period:Object.freeze({label:'추가 발급 신청 기간', start:'2026-08-10', end:'2026-11-30'}), usePeriod:'2026-12-31까지',
    summary:'공연·전시·영화·도서 이용을 지원하는 문화패스의 추가 발급 공고입니다.',
    eligibility:'2006·2007년생 대상. 출생연도·이전 지원 이력·지역별 발급 조건을 공식 안내에서 확인해야 해요. 대학생 전용 사업은 아닙니다.',
    limitations:'지역별 예산에 따라 조기 마감될 수 있으며 현재 잔여 발급 현황은 확인하지 못했어요. 공고 기간 안이어도 신청 가능이나 수혜를 보장하지 않습니다.' }),
  catalog({id:'official-mmca-seoul',title:'국립현대미술관 서울 무료관람',category:'문화',kind:'국립기관 관람 혜택',provider:'국립현대미술관',url:'https://www.mmca.go.kr/visitingInfo/seoulInfo.do',schedule:'ongoing',
    summary:'공식 관람 안내의 연령·대학생 무료관람 조건을 비교합니다. 서울은 관람 장소이며 서울 거주자만을 위한 혜택이 아닙니다.',
    eligibility:'만 24세 이하 또는 만 65세 이상 또는 대학생(학부생). 해당되는 무료 대상과 필요한 증빙을 공식 안내에서 확인해 주세요.',
    limitations:'대학생 입력만으로 학부생 여부나 증빙이 확인되지는 않습니다. 실제 전시별 적용·운영·발권 조건은 별도 확인이 필요해요.',
    matchRules:Object.freeze({verified:true,anyOf:[{age:{max:24}},{age:{min:65}},{student:{required:true,requiresUndergraduateCheck:true}}],extraChecks:['신분증 또는 학부생 증빙 등 해당 자격 확인','관람할 전시의 무료 적용·운영일·발권 조건']}),
  }),
  ...OFFICIAL_BENEFITS.filter((item) => item.id !== 'official-culture').map((item) => catalog({ ...item,
    schedule:item.id === 'official-kpass' ? 'ongoing' : 'unverified',
    matchSourceUrl:item.id === 'official-kpass' ? 'https://www.korea.kr/news/policyFocusView.do?newsId=148960648&pkgId=49500831' : item.url,
    matchRules:Object.freeze(item.id === 'official-kpass' ? {verified:true,age:{min:19},residence:{allowedRegions:RESIDENCE_REGIONS},extraChecks:['실제 주민등록 주소·국적 등 가입 자격','카드 발급·등록·월 이용 기준·대상 교통수단','지역별 추가 환급 조건']} : {verified:false,extraChecks:['공식 원문으로 현재 판매·연령 기준 재확인','대상 인증·좌석·이용일별 판매 조건']}),
    eligibility:item.id === 'official-kpass' ? '참여 지자체 주민등록 만 19세 이상 · 카드·가입·등록 및 월 이용 기준. 학생 여부와 별개로 확인해 주세요.' : '연령·회원 인증·판매 및 열차 조건을 공식 안내에서 확인해 주세요. 대학생 여부로 적용을 확정하지 않습니다.',
  })),
]);

export function seoulToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map((key) => parts.find((part) => part.type === key).value).join('-');
}
const validDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
export function benefitStatus(benefit, today = seoulToday()) {
  const unknown = {code:'needs_check',label:'진행 확인 필요'};
  if (!validDay(today) || benefit.synthetic !== false || benefit.sourceType !== 'official_reference' || benefit.verificationLevel !== 'body_read') return unknown;
  if (benefit.schedule === 'ongoing') return {code:'ongoing_info',label:'상시 제도 안내 · 이용 조건 확인'};
  const period = benefit.period;
  if (benefit.schedule !== 'bounded' || !period || !validDay(period.start) || !validDay(period.end) || period.start > period.end) return unknown;
  if (today < period.start) return {code:'upcoming',label:'공고 기간 시작 전'};
  if (today > period.end) return {code:'ended',label:'공고 기간 종료'};
  return {code:'in_period',label:'공고 기간 중 · 마감 여부 확인 필요'};
}
export function selectBenefits({category = 'all', status = 'all', today = seoulToday(), items = BENEFIT_CATALOG} = {}) {
  const order = {in_period:0,ongoing_info:1,needs_check:2,upcoming:3,ended:4};
  return items.filter((item) => item.synthetic === false && item.sourceType === 'official_reference')
    .filter((item) => (category === 'all' || item.category === category) && (status === 'all' || benefitStatus(item,today).code === status))
    .sort((a,b) => order[benefitStatus(a,today).code] - order[benefitStatus(b,today).code]);
}
