export const REAL_CATALOG_VERSION = 'seoul-nearby-2026-10-27';
const checkedAt = '2026-10-27';
const source = (url, label) => ({ url, label, checkedAt });
const chuncheon = (id) => `https://www.chuncheon.go.kr/tour/destination/all-tour/detail/?tourId=${id}`;
const railSource = source('https://www.korail.com/ticket/train/stationGuide/station/view?stationSeq=10280346', '코레일 역 안내');

export const REAL_DEPARTURES = Object.freeze([
  { id: 'cheongnyangni', label: '청량리역', location: { lat: 37.5806, lng: 127.04826 }, geoSource: source('https://mapcarta.com/16036830', 'OpenStreetMap · Mapcarta') },
  { id: 'seoul', label: '서울역', location: { lat: 37.554722222222, lng: 126.97083333333 }, geoSource: source('https://www.wikidata.org/wiki/Q20415', '서울역 대표 위치 · Wikidata') },
  { id: 'yongsan', label: '용산역', location: { lat: 37.52995, lng: 126.96483 }, geoSource: source('https://mapcarta.com/16010320', 'OpenStreetMap · Mapcarta') },
]);

export const REAL_REGIONS = Object.freeze([
  { id: 'real-chuncheon', name: '춘천', station: '춘천역 관광안내소', stationLocation: { lat: 37.884669, lng: 127.717005 }, stationAddress: '강원특별자치도 춘천시 공지로 591', geoSource: source('https://www.data.go.kr/en/data/15013112/standard.do', '공공데이터포털 · 관광안내소'), description: '소양강을 따라 걷고, 강변에서 쉬는 하루', railLabel: 'ITX-청춘 · 경춘선', source: railSource, defaultExperienceIds: ['real-soyang-statue', 'real-soyang-art-circle', 'real-soyang-skywalk'] },
  { id: 'real-gapyeong', name: '가평', station: '가평역', stationLocation: { lat: 37.81452, lng: 127.51076 }, stationAddress: '경기도 가평군 가평읍 문화로 13-42', geoSource: source('https://mapcarta.com/N5881583288', 'OpenStreetMap · Mapcarta'), description: '섬 산책과 옛 기차역의 음악 공간', railLabel: 'ITX-청춘 · 경춘선', source: railSource, defaultExperienceIds: ['real-jaraseom', 'real-music1939'] },
  { id: 'real-gangneung', name: '강릉', station: '강릉역', stationLocation: { lat: 37.7644, lng: 128.89952 }, stationAddress: '강릉역', geoSource: source('https://mapcarta.com/W528445587', 'OpenStreetMap · Mapcarta'), description: '옛 철길과 시장을 잇는 원도심 산책', railLabel: '강릉선 KTX', source: source('https://www.kric.go.kr/jsp/board/portal/sub05/res/themeEssayDetail.jsp?board_seq=2815', '철도산업정보센터 노선 소개'), defaultExperienceIds: ['real-wolhwa', 'real-gangneung-market', 'real-gangneung-government'] },
]);

function place(value) {
  const region = REAL_REGIONS.find((item) => item.id === value.regionId);
  return Object.freeze({
    ...value, region: region.name, synthetic: false, accessScope: 'official-public', durationKind: 'planning',
    companions: ['solo', 'together'], mobility: ['walk', 'transit'], stairs: null, art: 'place',
    visitContext: value.address, positives: [], drawbacks: ['당일 운영과 이동편은 출발 전에 확인해 주세요.'],
    evidence: [{ id: `${value.id}-official`, claim: `${value.title}의 주소와 방문 안내`, sourceLabel: value.source.label, url: value.source.url, checkedAt }],
  });
}

export const REAL_PLACES = Object.freeze([
  place({ id: 'real-soyang-statue', regionId: 'real-chuncheon', title: '소양강처녀상', summary: '소양강과 다리를 바라보며 강변을 걷는 곳.', tags: ['nature', 'quiet', 'photo'], durationMinutes: 30,
    address: '강원특별자치도 춘천시 영서로 2675', location: { lat: 37.8938902, lng: 127.7252823 }, source: source(chuncheon(331), '춘천시 관광'),
    admission: { amount: null, label: '야외 관람 · 현장 안내 확인' }, opening: { label: '야외 공간 · 날씨와 현장 통제 확인', closedWeekdays: [] } }),
  place({ id: 'real-soyang-art-circle', regionId: 'real-chuncheon', title: '소양아트서클', summary: '수변 산책 중 잠시 쉬어 가는 원형 광장.', tags: ['nature', 'quiet', 'culture', 'photo'], durationMinutes: 30,
    address: '강원특별자치도 춘천시 당간지주길 79-8', location: { lat: 37.893806, lng: 127.726972 }, source: source(chuncheon(334), '춘천시 관광'),
    admission: { amount: 0, label: '무료' }, opening: { label: '상시 개방', closedWeekdays: [] } }),
  place({ id: 'real-soyang-skywalk', regionId: 'real-chuncheon', title: '소양강스카이워크', summary: '투명한 바닥 위에서 소양강 풍경을 보는 곳.', tags: ['nature', 'photo'], durationMinutes: 40,
    address: '강원특별자치도 춘천시 영서로 2663', location: { lat: 37.8932779661552, lng: 127.723663635731 }, source: source(chuncheon(216), '춘천시 관광'),
    admission: { amount: 2000, label: '2,000원 · 상품권 지급 안내는 현장 확인' }, opening: { label: '화요일 휴무 · 악천후 운영 중단 가능', closedWeekdays: [2], sourceUrl: 'https://rev.cuc.or.kr/' } }),
  place({ id: 'real-jaraseom', regionId: 'real-gapyeong', title: '자라섬', summary: '강과 잔디, 나무를 따라 여유롭게 걷는 섬.', tags: ['nature', 'quiet', 'photo'], durationMinutes: 60,
    address: '경기도 가평군 가평읍 자라섬로 60', location: { lat: 37.82086770299424, lng: 127.52085760205225 }, source: source('https://access.visitkorea.or.kr/ms/detail.do?cotId=d5f5fc80-0cec-4a3e-826d-d93f32e61108', '한국관광공사'),
    admission: { amount: null, label: '행사·캠핑·시설 이용료 별도 확인' }, opening: { label: '상시 개방 · 행사 구역 별도 확인', closedWeekdays: [] } }),
  place({ id: 'real-music1939', regionId: 'real-gapyeong', title: '음악역1939', summary: '옛 가평역 부지에 자리한 음악 문화공간.', tags: ['culture', 'quiet', 'photo'], durationMinutes: 45,
    address: '경기도 가평군 가평읍 석봉로 100', location: { lat: 37.8252914303424, lng: 127.512977749513 }, geoSource: source('https://share.gg.go.kr/facilityListO/view?eshare=1&facilityId=F0009&instiCode=1290001', '경기도 공유서비스'), source: source('https://music1939.gp.go.kr/about.php', '음악역1939'),
    admission: { amount: null, label: '공연·영화·시설별 확인' }, opening: { label: '공연·전시 일정 확인', closedWeekdays: [] } }),
  place({ id: 'real-wolhwa', regionId: 'real-gangneung', title: '월화거리', summary: '옛 철길을 따라 원도심과 시장을 잇는 산책길.', tags: ['culture', 'nature', 'quiet', 'photo'], durationMinutes: 40,
    address: '강원특별자치도 강릉시 경강로 2113 일대', location: { lat: 37.755846288051, lng: 128.897418452855 }, geoSource: source('https://access.visitkorea.or.kr/ms/detail.do?cotId=b9560f37-c615-48dd-8c66-28bb6dbae173', '한국관광공사'), source: source('https://english.visitkorea.or.kr/svc/contents/contentsView.do?dataSetId=264&menuSn=929&vcontsId=249838', '한국관광공사'),
    admission: { amount: null, label: '거리 산책 · 점포 이용료 별도' }, opening: { label: '산책 구간·점포 운영은 현장 확인', closedWeekdays: [] } }),
  place({ id: 'real-gangneung-market', regionId: 'real-gangneung', title: '강릉중앙시장', summary: '원도심 산책 사이에 먹거리를 고르는 시장.', tags: ['food', 'culture', 'photo'], durationMinutes: 60,
    address: '강원특별자치도 강릉시 금성로 21', location: { lat: 37.7539965365165, lng: 128.898632282517 }, source: source('https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=459&vcontsId=66096', '한국관광공사'),
    admission: { amount: null, label: '식비·구매비 별도' }, opening: { label: '08:30–21:00 안내 · 점포별 상이', closedWeekdays: [] } }),
  place({ id: 'real-gangneung-government', regionId: 'real-gangneung', title: '강릉대도호부관아', summary: '강릉 원도심의 역사와 건축을 둘러보는 곳.', tags: ['culture', 'quiet', 'photo'], durationMinutes: 45,
    address: '강원특별자치도 강릉시 임영로131번길 6', location: { lat: 37.7532215015504, lng: 128.892094048853 }, source: source('https://kq.visitkorea.or.kr/kfes/detail/fstvlDetail.do?cntntsNm=%EA%B0%95%EB%A6%89%EB%AC%B8%ED%99%94%EC%9C%A0%EC%82%B0%EC%95%BC%ED%96%89&fstvlCntntsId=1f47bee8-d195-40a2-81eb-a5aeca10fb81', '한국관광공사 장소 안내'),
    admission: { amount: null, label: '방문 전 관람 안내 확인' }, opening: { label: '관람시간·휴무 확인 필요', closedWeekdays: [] } }),
]);
