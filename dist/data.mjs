// Every place, activity, condition, and claim below is invented for this local demo.
// No real visits, reviews, opening hours, prices, or safe routes are asserted.
export const INTERESTS = Object.freeze([
  { id: 'nature', label: '산책과 자연' },
  { id: 'quiet', label: '조용한 쉼' },
  { id: 'culture', label: '전시와 취향' },
  { id: 'food', label: '먹는 즐거움' },
  { id: 'craft', label: '작은 만들기' },
  { id: 'photo', label: '사진과 풍경' },
]);
export const REGIONS = Object.freeze(['가상 온유동', '가상 바람마을']);

function experience(value) {
  const evidence = [
    { id: `${value.id}-activity`, claim: value.summary, sourceLabel: '가상 시연 카드 · 실제 방문 자료 아님' },
    { id: `${value.id}-context`, claim: value.visitContext, sourceLabel: '가상으로 설정한 조건 · 실제 후기 아님' },
    { id: `${value.id}-duration`, claim: `시연용 활동 시간 ${value.durationMinutes}분. 실제 소요 시간은 확인되지 않았습니다.`, sourceLabel: '가상 시연 설정값' },
    { id: `${value.id}-access`, claim: value.stairs ? '가상 설정에 계단이 포함됩니다.' : '가상 설정에는 계단이 없습니다. 실제 접근성은 미확인입니다.', sourceLabel: '가상 시연 설정값 · 접근성 검증 아님' },
  ];
  return { ...value, synthetic: true, accessScope: 'demo-public', provenance: { sourceType: 'synthetic', label: '가상 자료 · 시연용', observedAt: null, verificationLevel: 'unknown' }, evidence };
}

export const EXPERIENCES = Object.freeze([
  experience({
    id: 'demo-garden', title: '안개정원에서 천천히 걷기',
    summary: '작은 정원 길을 따라 걷다가 벤치에서 잠깐 쉬는 가상 경험이에요.',
    region: '가상 온유동', tags: ['nature', 'quiet', 'photo'], durationMinutes: 45,
    visitContext: '가상 조건 · 가을 평일 오후 / 혼자 또는 함께 / 도보',
    positives: ['걸음 사이에 쉬는 시간을 넣는 설정', '풍경을 바라보는 가벼운 활동'],
    drawbacks: ['비를 피할 실내 공간은 설정되지 않음', '현재 날씨·길 상태는 미확인'],
    companions: ['solo', 'together'], mobility: ['walk', 'transit'], stairs: false, art: 'garden',
  }),
  experience({
    id: 'demo-library', title: '느린 서가에서 한 장 읽기',
    summary: '읽고 싶은 책을 골라 창가에 앉아보는 가상 쉼의 경험이에요.',
    region: '가상 온유동', tags: ['quiet', 'culture'], durationMinutes: 50,
    visitContext: '가상 조건 · 비 오는 오후 / 혼자 / 실내',
    positives: ['혼자 집중하는 시간에 맞춘 설정', '실내에서 조용히 머무는 활동'],
    drawbacks: ['좌석이 적다는 가상 설정', '실제 좌석·영업 여부는 미확인'],
    companions: ['solo', 'together'], mobility: ['walk', 'transit'], stairs: false, art: 'library',
  }),
  experience({
    id: 'demo-table', title: '햇살 식탁에서 한 끼 쉬어가기',
    summary: '작은 식탁에 앉아 천천히 한 끼를 즐기는 가상 식사 경험이에요.',
    region: '가상 온유동', tags: ['food', 'quiet'], durationMinutes: 60,
    visitContext: '가상 조건 · 평일 점심 / 혼자 또는 함께 / 실내',
    positives: ['혼자 앉는 자리가 있다는 가상 설정', '식사 시간을 넉넉히 두는 구성'],
    drawbacks: ['메뉴·가격·대기 시간은 제공하지 않음', '알레르기·식이 조건 적합성 미확인'],
    companions: ['solo', 'together'], mobility: ['walk', 'transit'], stairs: false, art: 'table',
  }),
  experience({
    id: 'demo-gallery', title: '다락 전시실의 작은 이야기',
    summary: '계단을 올라 작은 전시를 둘러보는 가상 문화 경험이에요.',
    region: '가상 온유동', tags: ['culture', 'photo'], durationMinutes: 40,
    visitContext: '가상 조건 · 주말 오후 / 혼자 또는 함께 / 계단 있는 실내',
    positives: ['짧은 시간에 둘러보는 전시 설정', '사진과 이야기를 함께 보는 활동'],
    drawbacks: ['가상 설정에 계단이 포함됨', '전시 일정·촬영 허용 여부는 미확인'],
    companions: ['solo', 'together'], mobility: ['walk', 'transit'], stairs: true, art: 'gallery',
  }),
  experience({
    id: 'demo-workshop', title: '종이공방에서 엽서 만들기',
    summary: '종이와 색을 골라 작은 엽서를 만드는 가상 활동이에요.',
    region: '가상 바람마을', tags: ['craft', 'culture'], durationMinutes: 90,
    visitContext: '가상 조건 · 오후 / 친구와 함께 / 실내',
    positives: ['함께 손을 움직이며 대화하는 설정', '작은 결과물을 만들어보는 활동'],
    drawbacks: ['가상 활동 시간이 90분으로 긴 편', '예약 가능 여부·재료비는 미확인'],
    companions: ['together'], mobility: ['walk', 'transit'], stairs: false, art: 'workshop',
  }),
  experience({
    id: 'demo-river', title: '바람 물길에서 빛 담기',
    summary: '물가를 따라 천천히 걸으며 빛의 변화를 보는 가상 경험이에요.',
    region: '가상 바람마을', tags: ['nature', 'photo'], durationMinutes: 70,
    visitContext: '가상 조건 · 해 지기 전 / 혼자 또는 함께 / 도보',
    positives: ['풍경을 천천히 살피는 가상 동선', '걷기와 사진 관심을 함께 연결'],
    drawbacks: ['일부 계단이 있다는 가상 설정', '어두운 시간의 길 상태·방문 안전 미확인'],
    companions: ['solo', 'together'], mobility: ['walk'], stairs: true, art: 'river',
  }),
]);
