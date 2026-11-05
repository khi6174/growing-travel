import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTitle, matchEnglish, createEnglishNames } from '../scripts/english-names.mjs';

const gwanghwamun = { id: 'p1', name: '광화문', lat: 37.5759, lng: 126.9768 };
const item = (title, lat, lng, addr1 = '161 Sajik-ro, Jongno-gu, Seoul') => ({ title, mapy: String(lat), mapx: String(lng), addr1 });

test('D53/P77 an English TourAPI title splits into its English and Korean names', () => {
  assert.deepEqual(splitTitle('Gwanghwamun Gate (광화문)'), { en: 'Gwanghwamun Gate', ko: '광화문' });
  assert.deepEqual(splitTitle('Seoul Forest'), { en: 'Seoul Forest', ko: '' }, 'no Korean in brackets, no Korean name');
  assert.deepEqual(splitTitle('DAISO Gyeongbokgung Station Branch[Tax Refund Shop](다이소 경복궁역점)'), { en: 'DAISO Gyeongbokgung Station Branch', ko: '다이소 경복궁역점' });
});

test('D53/P77 a place gets an English name only when the Korean name matches and the item is close', () => {
  assert.deepEqual(matchEnglish(gwanghwamun, [item('Gyeongbokgung Palace (경복궁)', 37.5796, 126.977), item('Gwanghwamun Gate (광화문)', 37.5760, 126.9768)]),
    { name_en: 'Gwanghwamun Gate', address_en: '161 Sajik-ro, Jongno-gu, Seoul' });
  assert.equal(matchEnglish(gwanghwamun, [item('Gyeongbokgung Palace (경복궁)', 37.5796, 126.977)]), null, 'another place nearby is not used');
  assert.equal(matchEnglish(gwanghwamun, [item('Gwanghwamun Gate (광화문)', 37.60, 126.9768)]), null, 'the same name 2.7 km away is not used');
  assert.equal(matchEnglish({ id: 'k', name: '경복궁', lat: 37.5796, lng: 126.977 }, [item('Gyeongbokgung Palace (경복궁)', 37.5760, 126.9767)])?.name_en, 'Gyeongbokgung Palace', 'the same name 400 m off (a palace centre vs its gate) is used');
  assert.equal(matchEnglish({ id: 'k', name: '경복궁', lat: 37.5796, lng: 126.977 }, [item('DAISO Gyeongbokgung Station Branch[Tax Refund Shop](다이소 경복궁역점)', 37.5764, 126.9729)]), null, 'a shop sharing the word 500 m away is not used');
  assert.equal(matchEnglish({ ...gwanghwamun, name: '서촌·통인시장' }, [item('Seochon Village (서촌마을)', 37.5781, 126.9729)]), null, 'a partial word that differs is not used');
});

test('D53/P77 lookups go once per place a day, never without a key, and a failed call is not remembered', async () => {
  const calls = [];
  let fail = true;
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (fail) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ response: { body: { items: { item: [item('Gwanghwamun Gate (광화문)', 37.5760, 126.9768)] } } } }) };
  };
  assert.equal(createEnglishNames({ key: null, fetchImpl }).configured, false);
  assert.equal(await createEnglishNames({ key: null, fetchImpl }).nameFor(gwanghwamun), null);
  assert.equal(calls.length, 0);
  const names = createEnglishNames({ key: 'test-key', fetchImpl });
  assert.equal(await names.nameFor(gwanghwamun), null);
  fail = false;
  const places = [{ ...gwanghwamun }, { ...gwanghwamun }];
  await names.addTo(places);
  await names.addTo([{ ...gwanghwamun }]);
  assert.equal(calls.length, 2, 'the failure is retried once, then the hit is remembered');
  assert.deepEqual(places.map((place) => place.name_en), ['Gwanghwamun Gate', 'Gwanghwamun Gate'], 'every copy of the place gets the name');
  assert.match(calls[1], /EngService2\/searchKeyword2\?.*keyword=%EA%B4%91%ED%99%94%EB%AC%B8/);
});
