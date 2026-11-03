import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { seasonOf, skyState, lookFor, timeOfDay, sunElevation, SEASONS } from '../dist/sky.mjs';

const css = await fs.readFile(new URL('../dist/seasons.css', import.meta.url), 'utf8');

test('D35: the season follows the Seoul calendar, and a link or preview wins over the real season and weather', () => {
  assert.equal(seasonOf(new Date('2026-11-03T03:00:00Z')), 'autumn');
  assert.equal(seasonOf(new Date('2026-11-30T16:00:00Z')), 'winter', '1 December already in Seoul');
  assert.deepEqual(['2026-04-01', '2026-07-01', '2027-01-15'].map((day) => seasonOf(new Date(`${day}T03:00:00Z`))), ['spring', 'summer', 'winter']);
  const date = new Date('2026-11-03T03:00:00Z');
  assert.deepEqual(skyState({ date, live: { condition: 'sleet' } }), { season: 'autumn', weather: 'rain', time: 'day', previewing: false });
  assert.deepEqual(skyState({ date, live: null }), { season: 'autumn', weather: 'clear', time: 'day', previewing: false }, 'no live weather: the season alone');
  assert.deepEqual(skyState({ date, preview: { weather: 'snow' }, live: { condition: 'clear' } }), { season: 'autumn', weather: 'snow', time: 'day', previewing: true });
  assert.deepEqual(skyState({ date, search: '?season=spring&weather=rain', preview: { season: 'winter', time: 'night' } }), { season: 'spring', weather: 'rain', time: 'night', previewing: true });
  assert.deepEqual(skyState({ date, search: '?season=monsoon' }).season, 'autumn', 'unknown values are ignored');
  assert.equal(lookFor('dry'), 'clear'); assert.equal(lookFor('nonsense'), null);
});

const luminance = (hex) => {
  const digits = hex.replace('#', '');
  const [r, g, b] = (digits.length === 3 ? digits.replace(/./g, '$&$&') : digits).match(/../g).map((part) => parseInt(part, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('D35: every season palette keeps small text readable (WCAG AA 4.5:1), hero text on its sky included', () => {
  for (const { id } of SEASONS) {
    const block = css.match(new RegExp(`:root\\[data-season=${id}\\]:not\\(\\[data-theme\\]\\)\\{([^}]*)\\}`))?.[1];
    assert.ok(block, `${id} tokens`);
    const token = (name) => (name === 'white' ? '#ffffff' : block.match(new RegExp(`--${name}:(#[0-9a-f]{3,6})(?![0-9a-f])`, 'i'))?.[1]);
    for (const [fg, bg] of [['ink', 'white'], ['muted', 'white'], ['muted', 'travel-subtle'], ['muted', 'cream'], ['green', 'white'], ['green', 'mint'], ['white', 'green'], ['ink', 'sky-top']]) {
      const ratio = contrast(token(fg), token(bg));
      assert.ok(ratio >= 4.5, `${id}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('P52: the time of day follows the sun over Seoul through the year', () => {
  const at = (kst) => new Date(`${kst}:00+09:00`);
  assert.ok(Math.abs(sunElevation(at('2026-11-03T12:30')) - 37.3) < 0.5, 'noon altitude in early November');
  assert.deepEqual(['05:30', '06:50', '12:30', '17:35', '18:05', '21:00'].map((time) => timeOfDay(at(`2026-11-03T${time}`))), ['night', 'dawn', 'day', 'dusk', 'night', 'night']);
  assert.equal(timeOfDay(at('2026-06-21T19:00')), 'day', 'long summer evening');
  assert.equal(timeOfDay(at('2026-12-21T17:20')), 'dusk', 'early winter sunset');
});

test('P52: white hero text stays readable on the dawn, dusk and night skies', () => {
  for (const time of ['dawn', 'dusk', 'night']) {
    const block = css.match(new RegExp(`:root\\[data-season\\]\\[data-time=${time}\\]:not\\(\\[data-theme\\]\\)\\{([^}]*)\\}`))?.[1];
    assert.ok(block, `${time} tokens`);
    for (const name of ['sky-top', 'sky-mid']) {
      const color = block.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i'))[1];
      const ratio = contrast('#ffffff', color);
      assert.ok(ratio >= 4.5, `${time}: white on ${name} is ${ratio.toFixed(2)}:1`);
    }
  }
});
