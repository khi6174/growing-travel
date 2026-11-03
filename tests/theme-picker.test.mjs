import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { THEMES, THEME_KEY, initialTheme, applyTheme } from '../dist/theme-picker.mjs';

const css = await fs.readFile(new URL('../dist/themes.css', import.meta.url), 'utf8');
const memory = (value) => ({ getItem: (key) => (key === THEME_KEY ? value : null) });

test('D35: a draft opens only from a ?theme= link; a saved draft and anything unknown fall back to the default', () => {
  assert.equal(initialTheme('?theme=coast'), 'coast');
  assert.equal(initialTheme('', memory('sunset')), 'base', 'the season design is the default now');
  assert.equal(initialTheme('?theme=neon'), 'base');
  const root = { dataset: {} };
  applyTheme('metro', root); assert.equal(root.dataset.theme, 'metro');
  applyTheme('base', root); assert.equal('theme' in root.dataset, false, 'the approved design needs no attribute');
});

// WCAG relative luminance and contrast ratio.
const luminance = (hex) => {
  const digits = hex.replace('#', '');
  const [r, g, b] = (digits.length === 3 ? digits.replace(/./g, '$&$&') : digits).match(/../g).map((part) => parseInt(part, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every travel draft keeps small text readable (WCAG AA 4.5:1)', () => {
  for (const { id } of THEMES.filter((theme) => theme.id !== 'base')) {
    const block = css.match(new RegExp(`:root\\[data-theme=${id}\\]\\{([^}]*)\\}`))?.[1];
    assert.ok(block, `${id} tokens`);
    const token = (name) => block.match(new RegExp(`--${name}:(#(?:[0-9a-f]{6}|[0-9a-f]{3}))(?![0-9a-f])`, 'i'))?.[1];
    const pairs = [['ink', 'white'], ['muted', 'white'], ['muted', 'travel-subtle'], ['green', 'white'], ['green', 'mint']];
    if (token('theme-accent')) pairs.push(['theme-accent', 'white']);
    for (const [fg, bg] of pairs) {
      const ratio = contrast(token(fg), token(bg));
      assert.ok(ratio >= 4.5, `${id}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
    // White button text on the primary colour.
    assert.ok(contrast('#ffffff', token('green')) >= 4.5, `${id}: button text`);
  }
});
