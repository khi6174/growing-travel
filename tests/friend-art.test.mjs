import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { FRIEND_SHAPES } from '../dist/friend-art.mjs';

const friends = JSON.parse(await fs.readFile(new URL('../data/gu_friends.json', import.meta.url), 'utf8')).friends;
const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line']);
const ATTRS = new Set(['d', 'fill', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'transform']);
const NUMERIC = new Set(['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'stroke-width', 'opacity']);

test('D48 every 동네 친구 has its own drawing and no drawing is left without a friend', () => {
  assert.deepEqual(Object.keys(FRIEND_SHAPES).sort(), friends.map((friend) => friend.id).sort());
  const looks = new Set(Object.values(FRIEND_SHAPES).map((shapes) => JSON.stringify(shapes)));
  assert.equal(looks.size, 25, 'no two friends share a drawing');
  for (const [id, shapes] of Object.entries(FRIEND_SHAPES)) assert.ok(shapes.length >= 6, `${id} is more than a blob`);
});

test('D48 drawings are plain shapes with safe attributes, finite numbers and fixed colours', () => {
  for (const [id, shapes] of Object.entries(FRIEND_SHAPES)) {
    for (const [tag, attrs] of shapes) {
      assert.ok(TAGS.has(tag), `${id}: ${tag}`);
      for (const [key, value] of Object.entries(attrs)) {
        assert.ok(ATTRS.has(key), `${id}: attribute ${key} (no style, events or links)`);
        if (NUMERIC.has(key)) assert.ok(Number.isFinite(Number(value)), `${id}: ${key}=${value}`);
        if (key === 'fill' || key === 'stroke') assert.match(String(value), /^(none|#[0-9a-f]{3,8})$/i, `${id}: ${key}=${value}`);
        if (key === 'd') assert.match(String(value), /^[MmLlHhVvCcQqAaZz0-9 .,-]+$/, `${id}: path data`);
        if (key === 'transform') assert.match(String(value), /^rotate\(-?[\d.]+ [\d.]+ [\d.]+\)$/, `${id}: transform`);
      }
      if (tag === 'path') assert.ok(!String(attrs.d).includes('NaN'), `${id}: path data has a number everywhere`);
    }
  }
});
