const node = (tag, className = '', text) => {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const duration = (value) => Number.isFinite(value) ? `${value}분` : '미확인';
export const isRealJourney = (snapshot) => snapshot?.contractVersion === 'real-journey-v1';
export function placeLink(url, label) {
  const link = node('a', 'text-button', `${label} (새 창)`);
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
export function realRegionCard(region, choose) {
  const card = node('article', 'region-card real-region-card');
  card.append(node('span', 'small-label', region.railLabel), node('h3', '', region.name), node('p', 'region-station', region.station), node('p', 'muted', region.description));
  card.append(node('p', 'region-place-count', `조건에 맞는 장소 ${region.eligibleExperienceIds.length}곳`), choose);
  card.append(node('p', 'field-help', region.eligibleExperienceIds.length ? '열차 시각과 이동 시간은 코스에서 확인해요.' : region.reasons.join(' '))); return card;
}
export function realPlaceDetails(place, reasons) {
  const content = document.createDocumentFragment();
  const heading = node('h2', '', place.title); heading.id = 'evidence-heading'; heading.tabIndex = -1;
  content.append(node('span', 'small-label', place.region), heading, node('p', 'intro', place.summary));
  for (const reason of reasons) content.append(node('p', '', reason.summary));
  const facts = node('dl', 'place-facts');
  for (const [label, text] of [['주소', place.address], ['운영 안내', place.opening.label], ['입장 안내', place.admission.label], ['머무를 계획', `${place.durationMinutes}분 · 여행 계획을 위한 시간이에요.`]]) {
    facts.append(node('dt', '', label), node('dd', '', text));
  }
  content.append(facts, node('p', 'field-help', '운영 일정과 보행 여건은 방문 전에 다시 확인해 주세요.'), placeLink(place.source.url, place.source.label), node('p', 'field-help', `${place.source.checkedAt} 자료 확인`));
  return content;
}
export function realJourneySummary(snapshot) {
  const content = document.createDocumentFragment();
  const { estimate, tripSnapshot } = snapshot;
  content.append(node('p', 'route-verification', estimate.totalMinutes === null ? '이동 시간을 확인하면 하루 일정을 완성할 수 있어요.' : '직접 입력한 이동 시간을 반영한 계획이에요.'));
  const travel = estimate.knownTravelMinutes > 0 ? `입력한 이동 ${duration(estimate.knownTravelMinutes)}` : '이동시간 미입력';
  content.append(node('p', 'route-limits', `머무는 시간 ${duration(estimate.activityMinutes)}, ${travel}, 여행 가능 ${duration(tripSnapshot.availableMinutes)}`));
  if (Object.values(snapshot.checks).includes('unmet')) content.append(node('p', 'field-error route-alert', '입력한 시간이나 예산을 넘는 항목이 있어요. 장소 또는 여행 조건을 조정해 주세요.'));
  const details = node('details', 'course-detail'); details.append(node('summary', '', '출발 전 확인'));
  const warnings = node('ul', 'route-warnings'); snapshot.warnings.forEach((text) => warnings.append(node('li', '', text)));
  details.append(warnings, placeLink('https://www.korail.com/', '열차 시각·운임 확인')); content.append(details);
  const points = [snapshot.departureSnapshot, snapshot.regionSnapshot, ...snapshot.placeSnapshots];
  const sourced = points.filter((point) => point.geoSource);
  if (sourced.length) {
    const attribution = node('details', 'course-detail'); attribution.append(node('summary', '', '지도 위치 안내'), node('p', 'field-help', '지도는 대표 위치를 연결해요. 출입구와 승차 위치는 지도에서 확인해 주세요.'));
    const sources = node('ul');
    for (const point of sourced) {
      const item = node('li'); item.append(node('span', '', `${point.title ?? point.station ?? point.label}: `), placeLink(point.geoSource.url, point.geoSource.label)); sources.append(item);
    }
    attribution.append(sources);
    if (sourced.some((point) => point.geoSource.label.includes('OpenStreetMap'))) attribution.append(placeLink('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors'));
    content.append(attribution);
  }
  return content;
}
export function realTimeline(snapshot, controls) {
  const timeline = node('ol', 'course-timeline real-course-timeline'); timeline.setAttribute('aria-label', '출발역부터 돌아오는 역까지 여행 동선');
  timeline.append(controls.station(snapshot.legs[0].from, '출발'));
  snapshot.legs.forEach((leg) => {
    const row = node('li', `route-connection${leg.minutes === null ? ' route-unknown' : ''}`);
    const marker = node('span', 'route-marker route-marker-transit'); marker.setAttribute('aria-hidden', 'true');
    const info = node('div', 'route-connection-info');
    info.append(node('span', 'route-mode', leg.minutes === null ? '이동 시간 확인 필요' : `이동 ${duration(leg.minutes)} · 직접 입력`), node('small', 'route-leg-caption', `${leg.from} → ${leg.to}`));
    const links = node('div', 'route-map-links'); links.append(placeLink(leg.routeUrl, leg.linkKind === 'search' ? '지도에서 장소 찾기' : '대중교통 길찾기'));
    const local = leg.fromId !== snapshot.departureSnapshot.id && leg.toId !== snapshot.departureSnapshot.id;
    if (local && leg.walkUrl && leg.walkUrl !== leg.routeUrl) links.append(placeLink(leg.walkUrl, leg.linkKind === 'search' ? '도착 장소 찾기' : '도보 길찾기'));
    info.append(links);
    const details = node('details', 'route-time-editor'); details.append(node('summary', '', '이동시간 입력'));
    const label = node('label', 'field-label', `${leg.from} → ${leg.to} (분)`);
    const input = node('input'); input.type = 'number'; input.min = '1'; input.max = '1440'; input.step = '1'; input.inputMode = 'numeric'; input.value = leg.minutes ?? ''; input.dataset.legId = leg.id; input.setAttribute('aria-label', `${leg.from}에서 ${leg.to} 이동시간`);
    label.append(input); const message = node('p', 'field-error'); message.setAttribute('role', 'alert');
    const apply = node('button', 'button subtle', '시간 반영'); apply.type = 'button'; apply.disabled = controls.busy;
    apply.addEventListener('click', () => {
      if (input.validity.badInput || (input.value !== '' && (!Number.isInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > 1440))) { message.textContent = '1~1,440분을 입력하거나 비워 주세요.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      controls.updateTime(leg.id, input.value === '' ? null : Number(input.value));
    });
    input.disabled = controls.busy;
    details.append(label, node('p', 'field-help', '지도에서 확인한 계획 시간이에요. 비우면 미확인으로 돌아갑니다.'), message, apply); info.append(details); row.append(marker, info); timeline.append(row);
    const index = snapshot.experienceIds.indexOf(leg.toExperienceId);
    if (index >= 0) timeline.append(controls.experience(leg.toExperienceId, index));
    else timeline.append(controls.station(leg.to, leg.toId === snapshot.departureSnapshot.id ? '여행 마무리' : '지역 이동의 시작과 복귀'));
  });
  return timeline;
}
