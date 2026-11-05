// D48/P65: placeholder drawings of the 25 동네 친구, drawn from each friend's `look` in data/gu_friends.json until the
// team settles the final art (명세 5, Q12). Each one is a different object from its district, never an animal (명세 2-3).
// Shapes are plain data so tests can read them; nothing here animates, so the 도감 stays cheap to draw.
const SVG = 'http://www.w3.org/2000/svg';
const INK = '#2b2b2b';
const BLUSH = '#f08a80';
const n = (value) => Math.round(value * 100) / 100;
const P = (d, fill = 'none', more = {}) => ['path', { d, fill, ...more }];
const C = (cx, cy, r, fill, more = {}) => ['circle', { cx, cy, r, fill, ...more }];
const E = (cx, cy, rx, ry, fill, more = {}) => ['ellipse', { cx, cy, rx, ry, fill, ...more }];
const R = (x, y, width, height, fill, more = {}) => ['rect', { x, y, width, height, fill, ...more }];
const S = (color, width = 0.7) => ({ stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
const L = (x1, y1, x2, y2, color, width = 0.7) => ['line', { x1, y1, x2, y2, ...S(color, width) }];
const line = (d, color, width = 0.7) => P(d, 'none', S(color, width));

// Eyes, mouth and cheeks around (x, y): every friend gets its own mix so no two faces read the same.
function face({ x = 20, y = 22, gap = 4, eyes = 'dot', mouth = 'smile', cheeks = BLUSH, ink = INK, r = 1.2 } = {}) {
  const out = [];
  const [a, b] = [n(x - gap), n(x + gap)];
  const arc = (cx, up) => line(`M${n(cx - 1.4)} ${n(y + (up ? 0.5 : -0.3))}q1.4 ${up ? -1.8 : 1.4} 2.8 0`, ink, 0.75);
  if (eyes === 'dot') out.push(C(a, y, r, ink), C(b, y, r, ink));
  if (eyes === 'happy') out.push(arc(a, true), arc(b, true));
  if (eyes === 'closed') out.push(arc(a, false), arc(b, false));
  if (eyes === 'wide') for (const cx of [a, b]) out.push(C(cx, y, n(r + 0.8), '#fff', S(ink, 0.4)), C(n(cx + 0.25), n(y + 0.2), n(r * 0.75), ink));
  if (eyes === 'sleepy') out.push(P(`M${n(a - 1.6)} ${n(y - 0.4)}h3.2a1.6 1.6 0 0 1 -3.2 0Z`, ink), C(b, y, r, ink));
  if (eyes === 'shy') out.push(C(a, n(y + 0.5), 0.9, ink), C(b, n(y + 0.5), 0.9, ink));
  if (eyes === 'smug') out.push(line(`M${n(a - 1.5)} ${y}h3`, ink, 0.8), line(`M${n(b - 1.5)} ${y}h3`, ink, 0.8), C(a, n(y + 0.8), 0.6, ink), C(b, n(y + 0.8), 0.6, ink));
  const m = n(y + 3.2);
  if (mouth === 'smile') out.push(line(`M${n(x - 1.5)} ${m}q1.5 1.4 3 0`, ink));
  if (mouth === 'open') out.push(P(`M${n(x - 1.8)} ${m}q1.8 2.8 3.6 0Z`, ink));
  if (mouth === 'grin') out.push(P(`M${n(x - 2.6)} ${n(m - 0.3)}q2.6 3.4 5.2 0Z`, ink));
  if (mouth === 'flat') out.push(line(`M${n(x - 1.4)} ${n(m + 0.4)}h2.8`, ink));
  if (mouth === 'o') out.push(E(x, n(m + 0.6), 1.1, 1.3, ink));
  if (mouth === 'pout') out.push(line(`M${n(x - 1.2)} ${n(m + 0.8)}q1.2 -1 2.4 0`, ink));
  if (mouth === 'wobble') out.push(line(`M${n(x - 1.6)} ${n(m + 0.4)}q.8 .8 1.6 0q.8 -.8 1.6 0`, ink));
  if (cheeks) out.push(E(n(a - 1.7), n(y + 2.2), 1.6, 1, cheeks, { opacity: 0.85 }), E(n(b + 1.7), n(y + 2.2), 1.6, 1, cheeks, { opacity: 0.85 }));
  return out;
}
// A five-pointed star centred on (cx, cy) with outer radius `big` and inner radius `small`.
function star(cx, cy, big, small) {
  const points = Array.from({ length: 10 }, (_, k) => {
    const angle = ((-90 + k * 36) * Math.PI) / 180;
    const radius = k % 2 ? small : big;
    return `${n(cx + radius * Math.cos(angle))} ${n(cy + radius * Math.sin(angle))}`;
  });
  return `M${points.join('L')}Z`;
}

export const FRIEND_SHAPES = Object.freeze({
  // 종로 기와단: 수막새 얼굴 위에 휜 기와지붕, 흰 수염과 지팡이
  giwadan: [
    L(34, 22, 37, 38, '#7a5a3a', 1.1), line('M34 22q-.4 -2.6 2 -2.6', '#7a5a3a', 1.1),
    P('M4 12Q20 2 36 12L36 16Q20 7 4 16Z', '#3d4a5c'), line('M4 16Q20 7 36 16', '#7d8ba0', 0.6),
    C(4.5, 14, 1.8, '#3d4a5c'), C(35.5, 14, 1.8, '#3d4a5c'),
    C(20, 25, 10.5, '#9fb0c4', S('#3d4a5c', 0.8)), C(20, 25, 8.4, 'none', { ...S('#3d4a5c', 0.45), 'stroke-dasharray': '1.6 1.2' }),
    P('M14.6 29.2q5.4 7 10.8 0q-1 4.6 -5.4 5.6q-4.4 -1 -5.4 -5.6Z', '#f4f6f8', S('#c9d2dc', 0.4)),
    ...face({ y: 23.2, gap: 3.6, eyes: 'happy', mouth: 'smile', cheeks: false, ink: '#1f2a38' }),
  ],
  // 중구 봉수등: 불꽃 머리, 연기 꼬리, 등잔 받침
  bongsudeung: [
    line('M29 9q4 -2 3 -6q3 3 0 7', '#b9bec7', 1), C(33.4, 3.2, 1.2, '#d5d9df'), C(36, 6, 0.9, '#d5d9df'),
    P('M13 30h14l-2 7h-10Z', '#8a5a2b'), R(11.5, 28.4, 17, 2.4, '#6b4220', { rx: 1 }),
    P('M20 4C25 10 30 14 30 21A10 9 0 0 1 10 21C10 15 15 11 20 4Z', '#ff8a3d', S('#d9621c', 0.6)),
    P('M20 11C23 15 25 17 25 21A5 5 0 0 1 15 21C15 17 17 15 20 11Z', '#ffd35c'),
    L(5, 12, 8, 13.4, '#ff8a3d', 0.9), L(4.5, 17, 7.6, 17.4, '#ff8a3d', 0.9),
    ...face({ y: 19.6, gap: 3.2, eyes: 'wide', mouth: 'open', cheeks: false, ink: '#7a2e0a', r: 0.9 }),
  ],
  // 용산 철교바람: 차표를 쥔 소용돌이 바람, 기찻길 줄무늬 꼬리
  cheolgyobaram: [
    line('M8 27Q3 30 1.5 37', '#6db6e0', 1.4), L(1.6, 31.6, 4.6, 33, '#6db6e0', 0.6), L(1, 34.6, 3.8, 35.6, '#6db6e0', 0.6),
    P('M7 22C7 13 14 8 22 9C30 10 34 16 33 22C32 29 26 33 19 32C12 31 7 28 7 22Z', '#d6eef9', S('#6db6e0', 0.8)),
    line('M12 26q8 4 14 -2', '#6db6e0', 0.8), line('M15 13q6 -2.5 11 1.5', '#a9d8ef', 0.8), line('M28 18q2 3 0 6', '#a9d8ef', 0.8),
    R(27, 25.5, 9, 6, '#ffe08a', { ...S('#c79a2a', 0.5), rx: 0.8, transform: 'rotate(-12 31.5 28.5)' }),
    L(29.6, 26, 30.4, 31, '#c79a2a', 0.4),
    ...face({ x: 19.5, y: 18.5, gap: 3.6, eyes: 'happy', mouth: 'open' }),
  ],
  // 은평 한옥창: 문살 사이로 눈만 빼꼼 보이는 창호지 문, 문고리
  hanokchang: [
    R(9, 4, 22, 33, '#8b5e3c', { rx: 1.2 }), R(11, 6, 18, 29, '#f6efdc'),
    L(15, 6, 15, 35, '#8b5e3c', 0.8), L(20, 6, 20, 14, '#8b5e3c', 0.8), L(20, 25, 20, 35, '#8b5e3c', 0.8), L(25, 6, 25, 35, '#8b5e3c', 0.8),
    L(11, 13, 29, 13, '#8b5e3c', 0.8), L(11, 26, 29, 26, '#8b5e3c', 0.8), L(11, 31, 29, 31, '#8b5e3c', 0.8),
    C(26.8, 21, 1.5, 'none', S('#c9a04a', 0.7)), C(13.2, 21, 1.5, 'none', S('#c9a04a', 0.7)),
    ...face({ y: 17.8, gap: 2.6, eyes: 'dot', mouth: 'wobble', r: 1.15 }),
  ],
  // 서대문 기억돌: 이끼 눈썹이 난 화강암 조약돌, 날짜 눈금
  gieokdol: [
    P('M6 27C5 18 12 11 21 11C30 11 35 18 34 26C33 33 27 36 20 36C12 36 7 33 6 27Z', '#a7abb0', S('#6d7278', 0.7)),
    C(11, 30, 0.6, '#7d8288'), C(28.5, 31, 0.7, '#7d8288'), C(25, 15, 0.5, '#7d8288'), C(11, 21, 0.5, '#7d8288'), C(31, 21, 0.6, '#7d8288'),
    line('M12.6 19.6q3 -2.4 6 -.6', '#5f8f3e', 1.6), line('M21.4 19q3 -1.8 6 .6', '#5f8f3e', 1.6),
    L(25.6, 31.4, 25.6, 33.4, '#6d7278', 0.5), L(27.6, 30.8, 27.6, 32.8, '#6d7278', 0.5), L(29.6, 29.8, 29.6, 31.8, '#6d7278', 0.5),
    ...face({ y: 23, gap: 4.4, eyes: 'dot', mouth: 'flat', cheeks: false, ink: '#33373b', r: 1 }),
  ],
  // 마포 음표등: 통통한 8분음표, 꼬리 깃발
  eumpyodeung: [
    R(25, 3, 2.6, 26, '#2c3e66'), P('M27.6 3q8 3 7 12q-2 -5 -7 -6Z', '#2c3e66'),
    E(17, 29.5, 10.5, 7.8, '#3f5f9e', { transform: 'rotate(-20 17 29.5)' }),
    L(4, 16, 6, 14, '#f2b84b', 0.8), L(3, 21, 5.5, 21, '#f2b84b', 0.8), L(35, 22, 37.5, 23, '#f2b84b', 0.8),
    C(13.6, 28.8, 1.7, '#fff'), C(20.2, 26.6, 1.7, '#fff'), C(13.9, 29, 0.85, '#1b2540'), C(20.5, 26.8, 0.85, '#1b2540'),
    line('M14.2 32.6q3.8 2.8 7.4 -1.8', '#fff', 0.9), E(10.6, 32.4, 1.6, 1, '#f2b84b'),
  ],
  // 성동 벽돌공: 목장갑, 귀에 꽂은 목수 연필, 붉은 벽돌
  byeokdolgong: [
    R(29, 4, 2, 10, '#f2c94c', { transform: 'rotate(28 30 9)' }), P('M33.1 12.6l-1.6 2.6l.2 -3Z', '#3a2a1a'),
    R(8, 11, 24, 21, '#b5523b', { ...S('#8a3624', 0.6), rx: 1.6 }),
    L(8, 17.5, 32, 17.5, '#d98b74', 0.5), L(8, 26.5, 32, 26.5, '#d98b74', 0.5), L(14, 11, 14, 17.5, '#d98b74', 0.5), L(26, 11, 26, 17.5, '#d98b74', 0.5),
    L(11, 26.5, 11, 32, '#d98b74', 0.5), L(20, 26.5, 20, 32, '#d98b74', 0.5), L(29, 26.5, 29, 32, '#d98b74', 0.5),
    E(6.6, 27, 3, 3.4, '#f4f1e8', S('#bdb6a3', 0.5)), E(33.4, 27, 3, 3.4, '#f4f1e8', S('#bdb6a3', 0.5)),
    R(11, 32, 5, 3, '#6b4a3a', { rx: 1 }), R(24, 32, 5, 3, '#6b4a3a', { rx: 1 }),
    line('M14.4 19.6h3.2', '#3a1a12', 0.9), line('M22.4 19.6h3.2', '#3a1a12', 0.9),
    ...face({ y: 21.8, gap: 4, eyes: 'dot', mouth: 'flat', cheeks: '#e9a08f', ink: '#3a1a12', r: 1 }),
  ],
  // 광진 물결띠: 파란 물결과 노란 불빛이 꼬인 리본, 흔드는 끝
  mulgyeolddi: [
    line('M18 26q-3 6 -1 11', '#3a8fd6', 2.4), line('M22 26q4 5 1 11', '#f2c94c', 2.4),
    P('M20 21C12 10 3 12 4.5 21C6 30 13 31 20 21Z', '#3a8fd6'), P('M20 21C28 10 37 12 35.5 21C34 30 27 31 20 21Z', '#3a8fd6'),
    line('M6.5 18q6 -6 12 1', '#f2c94c', 1.4), line('M33.5 18q-6 -6 -12 1', '#f2c94c', 1.4),
    line('M2.4 13.6q-1.4 -2 .4 -3.6', '#3a8fd6', 1.2), line('M37.6 13.6q1.4 -2 -.4 -3.6', '#3a8fd6', 1.2),
    E(20, 21.5, 6.2, 6.4, '#5aa6e6', S('#2c6fb0', 0.6)),
    ...face({ y: 20.6, gap: 2.4, eyes: 'happy', mouth: 'open', cheeks: '#f2c94c', r: 0.9 }),
  ],
  // 동대문 감초: 지그재그로 접은 약봉투, 삐죽 나온 감초 뿌리, 팔자 눈썹
  yakchobongtu: [
    line('M27 10L32 1', '#8a5a2b', 2), line('M29.6 5.4l2.6 .6', '#8a5a2b', 0.8),
    P('M9 12L31 12L33 39L7 39Z', '#d8b98a', S('#8a6a3e', 0.6)),
    P('M9 12l2.75 -3l2.75 3l2.75 -3l2.75 3l2.75 -3l2.75 3l2.75 -3l2.75 3', '#c9a774', S('#8a6a3e', 0.5)),
    R(15, 30.5, 10, 6, '#f6efe2', { ...S('#8a6a3e', 0.4), rx: 0.6 }), L(17, 33.5, 23, 33.5, '#b5523b', 0.6),
    line('M13.4 20l3 1', '#4a3520', 0.7), line('M26.6 20l-3 1', '#4a3520', 0.7),
    ...face({ y: 23.4, gap: 4.4, eyes: 'dot', mouth: 'pout', cheeks: '#e6a07a', ink: '#4a3520' }),
  ],
  // 중랑 장미아치: 장미 넝쿨 아치 몸, 꽃 왕관, 활짝 편 넝쿨 팔
  jangmiachi: [
    line('M14 17Q8.5 23 8.5 38', '#4f8a3a', 3), line('M26 17Q31.5 23 31.5 38', '#4f8a3a', 3),
    line('M14 19q-6 -2 -10.5 -7', '#4f8a3a', 1.4), line('M26 19q6 -2 10.5 -7', '#4f8a3a', 1.4),
    E(5.4, 13.4, 1.8, 1, '#7fbf5a', { transform: 'rotate(40 5.4 13.4)' }), E(34.6, 13.4, 1.8, 1, '#7fbf5a', { transform: 'rotate(-40 34.6 13.4)' }),
    C(8.6, 28, 1.9, '#ff6f91'), C(31.4, 25, 1.9, '#ff6f91'), C(9, 35, 1.5, '#f28aa6'),
    C(20, 13, 7.6, '#e2557a', S('#b83a5e', 0.6)), line('M14.6 10q5.4 -3.6 10.8 0', '#b83a5e', 0.6), line('M15.6 17.4q4.4 2.6 8.8 0', '#b83a5e', 0.5),
    C(15, 5.4, 2, '#f28aa6'), C(20, 3.8, 2.3, '#ff6f91'), C(25, 5.4, 2, '#f28aa6'),
    ...face({ y: 12.4, gap: 2.8, eyes: 'wide', mouth: 'o', cheeks: '#ffc2d1', r: 0.8 }),
  ],
  // 성북 돌담이: 凹 모양 여장 성벽 조각, 등 뒤에 숨긴 붓
  seonggwakdoldam: [
    L(31, 24, 37.5, 8, '#7a5a3a', 1.2), P('M37.5 8l1.6 -3.4l-2.8 -.6Z', '#2b2b2b'), C(38.4, 3.4, 0.8, '#5b8def'),
    P('M5 37V14h5v-5h6v5h8v-5h6v5h5V37Z', '#cfc7b6', S('#8a8170', 0.7)),
    L(5, 25, 35, 25, '#a39a87', 0.5), L(5, 31, 35, 31, '#a39a87', 0.5), L(13, 25, 13, 31, '#a39a87', 0.5), L(27, 25, 27, 31, '#a39a87', 0.5), L(20, 31, 20, 37, '#a39a87', 0.5),
    line('M14.2 15.8h3.4', '#3d3a33', 0.8), line('M22.4 15.8h3.4', '#3d3a33', 0.8),
    ...face({ y: 18.2, gap: 4.1, eyes: 'dot', mouth: 'smile', ink: '#3d3a33', r: 1 }),
  ],
  // 강북 봉우리: 구름 모자를 쓴 뾰족 바위, 반장 완장
  bongwoori: [
    P('M3 37L17 9Q20 4 23 9L37 37Z', '#9aa1a8', S('#666d74', 0.7)), line('M21 12L18.4 21L22 28', '#7e858c', 0.5),
    P('M12 10.4a4 4 0 0 1 6 -4.4a5 5 0 0 1 9 1a4 4 0 0 1 2 7.4h-15a3 3 0 0 1 -2 -4Z', '#fff', S('#c7ced6', 0.6)),
    P('M6.6 31L10.4 23L12.8 24.2L9 32.2Z', '#d2463c'),
    line('M14.2 19.4l4 1.4', '#2b2b2b', 0.9), line('M25.8 19.4l-4 1.4', '#2b2b2b', 0.9),
    ...face({ y: 22.6, gap: 3.6, eyes: 'dot', mouth: 'open', cheeks: false }),
  ],
  // 도봉 창포잎: 길쭉한 붓꽃 잎 몸, 보라 꽃 한 송이, 팔짱
  changpoip: [
    P('M20 39C10.5 31 10.5 14 20 3C29.5 14 29.5 31 20 39Z', '#5f9e4f', S('#3f6e33', 0.6)), L(20, 6, 20, 37, '#8cc47a', 0.6),
    P('M25.6 7.4q4.4 -4.4 6.8 1q-3.4 3.2 -6.8 -1Z', '#8a5cc7'), P('M25.6 7.4q-1 -5.6 4.4 -5.4q.8 4.6 -4.4 5.4Z', '#a77be0'), P('M25.6 7.4q-5 -1 -4.6 -5q4.4 .4 4.6 5Z', '#9b6fd6'), C(26, 6.6, 1, '#f2c94c'),
    line('M12.6 27.6q7.4 4.4 14.8 0', '#3f6e33', 1.8), line('M12.6 30.8q7.4 -4.4 14.8 0', '#3f6e33', 1.8),
    ...face({ y: 19.4, gap: 3.4, eyes: 'smug', mouth: 'pout', cheeks: '#f7b1c1' }),
  ],
  // 노원 철길별: 레일 위에 걸터앉은 노란 별 조각, 졸린 반달눈
  cheolgilbyeol: [
    R(4, 33, 2.2, 5, '#7a5a3a'), R(13, 33, 2.2, 5, '#7a5a3a'), R(22, 33, 2.2, 5, '#7a5a3a'), R(31, 33, 2.2, 5, '#7a5a3a'),
    R(1.5, 33.6, 37, 1.6, '#8a8f96'), R(1.5, 36.4, 37, 1, '#a4a9b0'),
    P(star(20, 20, 14.5, 6.6), '#ffd34d', S('#d9a21b', 0.8)),
    line('M30.4 4.4h3l-3 3h3', '#9aa4c8', 0.7), line('M34.6 1.4h2l-2 2h2', '#9aa4c8', 0.5),
    ...face({ y: 19.6, gap: 3, eyes: 'sleepy', mouth: 'o', cheeks: '#f6a96b', r: 1.1 }),
  ],
  // 양천 정수탑: 둥근 물탑, 꼭대기 분수, 타일 무늬
  jeongsutap: [
    L(13, 29, 10.6, 38, '#7d8a99', 1.4), L(27, 29, 29.4, 38, '#7d8a99', 1.4), L(20, 31, 20, 38, '#7d8a99', 1.4), L(11.6, 34, 28.4, 34, '#7d8a99', 0.7),
    line('M20 12.4V5', '#7fd0f0', 1.2), line('M20 6q-4 -3.2 -6.2 2', '#7fd0f0', 0.9), line('M20 6q4 -3.2 6.2 2', '#7fd0f0', 0.9), C(13.6, 9.2, 0.7, '#7fd0f0'), C(26.4, 9.2, 0.7, '#7fd0f0'),
    E(20, 21.6, 12, 9.8, '#86bde0', S('#3f6f8f', 0.7)), P('M13.6 13.4q6.4 -3.4 12.8 0Z', '#3f6f8f'),
    line('M8.2 22.8q11.8 4.4 23.6 0', '#3f6f8f', 0.5),
    R(11.4, 25.4, 2, 2, '#c9e6f6'), R(15.4, 26.6, 2, 2, '#c9e6f6'), R(22.6, 26.6, 2, 2, '#c9e6f6'), R(26.6, 25.4, 2, 2, '#c9e6f6'),
    ...face({ y: 18.8, gap: 3.6, eyes: 'dot', mouth: 'smile', r: 1.1 }),
  ],
  // 강서 씨앗봉: 새싹 더듬이 두 개, 반쯤 열린 꼬투리 사이 동그란 눈
  ssiatbong: [
    line('M17 9.4q-2 -4 -5 -5', '#4f8a3a', 0.9), E(11.4, 3.8, 2.3, 1.2, '#9bd36f', { transform: 'rotate(-30 11.4 3.8)' }),
    line('M23 9.4q2 -4 5 -5', '#4f8a3a', 0.9), E(28.6, 3.8, 2.3, 1.2, '#9bd36f', { transform: 'rotate(30 28.6 3.8)' }),
    P('M20 8C30 10 34 20 31 29C28 36 12 36 9 29C6 20 10 10 20 8Z', '#7fbf5a', S('#4f8a3a', 0.7)),
    P('M11.6 21.4Q20 13.6 28.4 21.4Q20 29.4 11.6 21.4Z', '#eaf6da', S('#4f8a3a', 0.5)),
    ...face({ y: 21.4, gap: 3.4, eyes: 'wide', mouth: 'o', cheeks: '#f4b183', r: 1.1 }),
  ],
  // 구로 톱니: 회로 무늬 은색 톱니바퀴, 초시계 눈
  gongdantopni: [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => R(17.6, 4.4, 4.8, 5, '#9aa3b0', { rx: 0.8, transform: `rotate(${deg} 20 20.5)` })),
    C(20, 20.5, 12.2, '#b8c0cc', S('#6e7787', 0.7)),
    line('M10.6 16.6h3.6v3.2h2.6', '#5f8fbf', 0.55), C(16.8, 19.8, 0.6, '#5f8fbf'), line('M29.4 24.6h-3.4v2.8h-2.4', '#5f8fbf', 0.55), C(23.6, 27.4, 0.6, '#5f8fbf'),
    C(20, 19, 5.2, '#f2f5f8', S('#6e7787', 0.8)), L(20, 14.6, 20, 15.6, '#6e7787', 0.5), L(24.4, 19, 23.4, 19, '#6e7787', 0.5), L(15.6, 19, 16.6, 19, '#6e7787', 0.5),
    L(20, 19, 20, 15.8, INK, 0.7), L(20, 19, 22.4, 20.4, INK, 0.7), C(20, 19, 1.4, INK), C(20.4, 18.6, 0.45, '#fff'),
    line('M18.2 27.4h3.6', INK, 0.8),
  ],
  // 금천 실타래: 바늘이 꽂힌 털실 뭉치, 꼬리처럼 따라오는 실
  siltare: [
    line('M9.4 29.4q-6.4 4 -4.4 8.2q2.2 2 6.4 -.4', '#e0708a', 1.1),
    C(20, 20, 12.4, '#e0708a', S('#b04a64', 0.7)),
    line('M9.6 14q10 6 20.6 -2', '#f4a3b5', 0.8), line('M8.4 20.6q11.6 7 23 -1', '#f4a3b5', 0.8), line('M11 28q9 4 17.6 -3.4', '#f4a3b5', 0.8), line('M15 8.6q-3 10 2.4 21.6', '#f4a3b5', 0.8), line('M25.4 9q3.4 9 -1.2 21', '#f4a3b5', 0.8),
    L(25.4, 2.6, 33.4, 14.2, '#9aa4b0', 1.1), E(25.9, 3.4, 0.5, 0.9, '#fff', { transform: 'rotate(-34 25.9 3.4)' }),
    ...face({ y: 19.6, gap: 3.6, eyes: 'happy', mouth: 'open', cheeks: '#ffd0da' }),
  ],
  // 영등포 여의등: 윤슬이 비치는 유리 빌딩 조각, 창문 불빛 눈, 사원증
  yeouideung: [
    line('M3 38.4q3 -1.2 6 0q3 1.2 6 0', '#5a8fb8', 0.6), line('M25 38.4q3 -1.2 6 0q3 1.2 6 0', '#5a8fb8', 0.6),
    P('M10 37V8L20 3.6L30 8V37Z', '#8fb8e8', S('#4a6f9e', 0.7)), line('M12 31L28 12', '#d6e8fb', 1.6),
    R(13, 9.6, 2.4, 2.4, '#e6f1fd'), R(17, 9.6, 2.4, 2.4, '#e6f1fd'), R(21, 9.6, 2.4, 2.4, '#e6f1fd'), R(25, 9.6, 2.4, 2.4, '#e6f1fd'),
    R(13, 32, 2.4, 2.4, '#e6f1fd'), R(24.6, 32, 2.4, 2.4, '#e6f1fd'),
    R(14.4, 15.6, 3.4, 3.4, '#ffe27a', { rx: 0.4 }), R(22.2, 15.6, 3.4, 3.4, '#ffe27a', { rx: 0.4 }), C(16.1, 17.4, 0.85, INK), C(23.9, 17.4, 0.85, INK),
    line('M18.6 21.2q1.4 1.2 2.8 0', INK, 0.7),
    line('M15.4 23.4L20 27.4L24.6 23.4', '#d2463c', 0.7), R(18, 27, 4, 5, '#fff', { ...S('#9aa6b4', 0.4), rx: 0.4 }), L(18.8, 30.2, 21.2, 30.2, '#9aa6b4', 0.4),
  ],
  // 동작 징검다리: 빨간 머리띠를 맨 큰 징검돌과 양옆의 작은 돌 둘
  jinggeomdari: [
    line('M2 39q3 -1.2 6 0q3 1.2 6 0', '#5a8fb8', 0.6), line('M24 39q3 -1.2 6 0q3 1.2 6 0', '#5a8fb8', 0.6),
    E(7, 34, 5, 3, '#8f9a8c'), E(33, 34, 5, 3, '#8f9a8c'),
    E(20, 25, 10, 9, '#a9b5a6', S('#5d6a5a', 0.6)),
    P('M10.5 20Q20 15 29.5 20L29.2 22.2Q20 17.5 10.8 22.2Z', '#d2463c'), P('M29.5 20l4 -2l-.6 3Z', '#d2463c'),
    line('M3 18l3 2', '#5d6a5a', 0.7), line('M2 25h3.5', '#5d6a5a', 0.7),
    ...face({ y: 25.6, gap: 3.5, eyes: 'dot', mouth: 'grin', ink: '#24301f', r: 1.25 }),
  ],
  // 관악 별똥돌: 그을린 꼬리가 달린 울퉁불퉁 작은 운석, 별 귀걸이
  byeolttongdol: [
    P('M22 14L38 2L35 9L39 8L29 18Z', '#ffb347'), P('M24 15L34 7L30 15Z', '#ffe08a'),
    P('M7 24C6 17 12 12 18 13C24 11 30 16 30 23C31 30 25 35 18 35C11 35 8 30 7 24Z', '#7d6a5a', S('#4e4036', 0.7)),
    C(11, 28.4, 1.4, '#665648'), C(25.4, 30.4, 1.1, '#665648'), C(12.6, 17.8, 0.9, '#665648'), line('M24 14.4q3 2 5 6', '#3a2e26', 0.8),
    L(7.6, 25.6, 7.6, 27.6, '#d9a21b', 0.4), P(star(7.6, 29.6, 2.4, 1.1), '#ffd34d'),
    ...face({ x: 18.6, y: 22.6, gap: 3.6, eyes: 'smug', mouth: 'grin', cheeks: '#d98a6a', ink: '#1e1712' }),
  ],
  // 서초 선율지: 높은음자리표 앞머리를 한 접힌 악보, 지휘봉
  seonyulji: [
    P('M9 5H27L32 10V36H9Z', '#fbfaf5', S('#8c8a80', 0.7)), P('M27 5V10H32', '#e3e0d4', S('#8c8a80', 0.5)),
    L(11, 25, 30, 25, '#b8b5a8', 0.4), L(11, 27.2, 30, 27.2, '#b8b5a8', 0.4), L(11, 29.4, 30, 29.4, '#b8b5a8', 0.4), L(11, 31.6, 30, 31.6, '#b8b5a8', 0.4), L(11, 33.8, 30, 33.8, '#b8b5a8', 0.4),
    E(15, 31.4, 1.3, 0.95, INK, { transform: 'rotate(-20 15 31.4)' }), L(16.2, 31, 16.2, 26.6, INK, 0.5), E(23, 29.2, 1.3, 0.95, INK, { transform: 'rotate(-20 23 29.2)' }), L(24.2, 28.8, 24.2, 24.4, INK, 0.5),
    line('M15.6 14.4C11.4 9.6 16 3.4 19 7.4C21 10.4 15.4 13.4 15.4 16.4C15.4 18.4 18.2 19 19.2 17.4', INK, 1),
    line('M16.4 16.2l3 .4', INK, 0.8), line('M22.6 15.8l3 -.9', INK, 0.8),
    ...face({ x: 21, y: 18.6, gap: 3.4, eyes: 'dot', mouth: 'flat', cheeks: false, r: 1 }),
    L(32, 22, 38.4, 14.6, INK, 0.8), C(38.4, 14.6, 0.7, '#fff', S(INK, 0.4)), C(32, 22.4, 1.7, '#fbfaf5', S('#8c8a80', 0.5)),
  ],
  // 강남 유리빛: 무지개를 반사하는 프리즘, 머리에 얹은 선글라스
  yuribit: [
    P('M25 23L39.5 15.6V19.4Z', '#ff6b6b', { opacity: 0.85 }), P('M25 23L39.5 19.4V23.2Z', '#ffd34d', { opacity: 0.85 }),
    P('M25 23L39.5 23.2V27Z', '#5ecb8a', { opacity: 0.85 }), P('M25 23L39.5 27V30.8Z', '#5b8def', { opacity: 0.85 }),
    P('M20 4L37 36H3Z', '#e2f2fc', S('#7fa7c9', 0.8)), line('M20 4L22.4 36', '#b6d4ea', 0.6), line('M8 33L19 12', '#ffffff', 1),
    E(17.4, 12.6, 2.3, 1.5, INK), E(22.6, 12.6, 2.3, 1.5, INK), L(19.6, 12.4, 20.4, 12.4, INK, 0.6), C(16.8, 12, 0.5, '#fff'),
    ...face({ y: 24, gap: 3.4, eyes: 'shy', mouth: 'smile', cheeks: '#f9c0cc' }),
  ],
  // 송파 토성둑: 잔디 머리에 작은 깃발이 꽂힌 둥근 흙둑, 겹겹이 흙 층
  toseongduk: [
    L(24, 17.4, 24, 5.6, '#5a4a3a', 0.7), P('M24 5.6L30.4 7.6L24 9.6Z', '#c94f4f'),
    P('M3 37C4 25 11 16 20 16C29 16 36 25 37 37Z', '#a9824f', S('#6e5330', 0.7)),
    line('M6 31.4q14 -4 28 0', '#c29b64', 0.8), line('M4.6 35q15.4 -3 30.8 0', '#c29b64', 0.8),
    P('M8 24C12 16 28 16 32 24C28 20.6 12 20.6 8 24Z', '#6aa84f'), line('M12 20l1 -3l1 3M19 18.4l1 -3.4l1 3.4M26 19.6l1 -3l1 3', '#4d8a35', 0.7),
    line('M16.4 29.2q3.6 -1.6 7.2 0', '#4a3520', 0.9),
    ...face({ y: 26.4, gap: 4, eyes: 'happy', mouth: 'open', cheeks: '#e0a070', ink: '#3a2a18' }),
  ],
  // 강동 빗살이: 빗살무늬가 새겨진 뾰족 바닥 토기, 동그랗게 열린 입
  bitsalmunui: [
    P('M8 9L32 9Q32 27 20 39.5Q8 27 8 9Z', '#c98b5a', S('#7a4a28', 0.6)), E(20, 9, 12, 2.6, '#a86d42', S('#7a4a28', 0.6)),
    line('M10 14l3 3M13 14l3 3M24 14l3 3M27 14l3 3M12 31l2 -2M26 31l2 -2M15 35l2 -2M23 35l2 -2', '#7a4a28', 0.5),
    ...face({ y: 21, gap: 4, eyes: 'dot', mouth: 'o', cheeks: BLUSH, ink: '#3a2414', r: 1.5 }),
  ],
});

// Draws the friend into `svg` inside one group (the silhouette and the reveal act on that group). False if none.
export function drawFriend(svg, id) {
  const shapes = FRIEND_SHAPES[id];
  if (!shapes) return false;
  const group = document.createElementNS(SVG, 'g');
  group.setAttribute('class', 'friend-figure');
  for (const [tag, attrs] of shapes) {
    const element = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    group.append(element);
  }
  svg.append(group);
  return true;
}
