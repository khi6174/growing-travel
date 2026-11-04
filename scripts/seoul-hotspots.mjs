// D44/Q16: builds data/seoul_hotspots.json, the list of places 서울시 실시간 도시데이터 covers (S35). It asks the
// citydata_ppltn API for each code POI001… until a run of codes answers nothing, and keeps only the code and the
// official name (서울특별시, 공공누리 제1유형). Points are not stored: the server looks each name up with Kakao keyword
// search when it starts (scripts/congestion.mjs). The key is read from SEOUL_DATA_KEY in .env and never printed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEOUL_DATA = 'http://openapi.seoul.go.kr:8088';
export const populationUrl = (key, area) => `${SEOUL_DATA}/${encodeURIComponent(key)}/json/citydata_ppltn/1/5/${encodeURIComponent(area)}`;
export const areaOf = (body) => body?.['SeoulRtd.citydata_ppltn']?.[0] ?? null;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch (error) { if (error.code !== 'ENOENT') console.error(`.env not loaded: ${error.message}`); }
  const key = process.env.SEOUL_DATA_KEY;
  if (!key) { console.error('SEOUL_DATA_KEY가 없어요. 서울 열린데이터광장 일반 인증키를 .env에 넣어 주세요.'); process.exit(1); }
  const areas = []; let misses = 0;
  for (let n = 1; misses < 8 && n < 400; n += 1) {
    const code = `POI${String(n).padStart(3, '0')}`;
    try {
      const response = await fetch(populationUrl(key, code), { signal: AbortSignal.timeout(8000) });
      const area = areaOf(await response.json());
      if (area?.AREA_CD === code && area.AREA_NM) { areas.push({ code, name: area.AREA_NM }); misses = 0; } else misses += 1;
    } catch { misses += 1; }
  }
  const out = fileURLToPath(new URL('../data/seoul_hotspots.json', import.meta.url));
  await fs.writeFile(out, `${JSON.stringify({ version: 1, note: '서울시 실시간 도시데이터가 다루는 주요 장소의 코드와 이름. 출처: 서울 열린데이터광장(서울특별시), 공공누리 제1유형. 위치는 저장하지 않고 서버가 시작할 때 카카오 키워드 검색으로 찾는다(확인 전).', checked_at: new Date().toISOString().slice(0, 10), areas }, null, 2)}\n`);
  console.log(`${areas.length}곳을 ${path.relative(process.cwd(), out)}에 저장했어요.`);
}
