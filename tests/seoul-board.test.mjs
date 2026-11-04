import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { BOARD, boardPlane, projectBoard, prism } from '../dist/seoul-board.mjs';

const geojson = JSON.parse(await fs.readFile(new URL('../data/boundaries/seoul_gu_kostat2013_simple.geojson', import.meta.url), 'utf8'));
const features = geojson.features.map((feature) => ({ properties: { gu: feature.properties.code }, geometry: feature.geometry }));

test('P48: all 25 real district outlines fit the board at any turn, raised blocks included', () => {
  const plane = boardPlane(features);
  assert.equal(plane.shapes.length, 25);
  let size;
  for (let turn = -Math.PI; turn < Math.PI; turn += Math.PI / 6) {
    const board = projectBoard(plane, turn);
    size ??= [board.width, board.height];
    assert.deepEqual([board.width, board.height], size, 'the board keeps one size while it turns');
    for (const district of board.districts) {
      for (const [x, y] of district.rings.flat()) {
        assert.ok(x >= 0 && x <= board.width && y - BOARD.high >= 0 && y <= board.height, `${district.gu} stays inside at turn ${turn.toFixed(2)}`);
      }
    }
    const order = board.districts.map((district) => district.centre[1]);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'districts further up the screen are drawn first');
  }
});

test('P48: only walls facing the viewer are drawn, shaded by direction, whichever way a ring winds', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  for (const ring of [square, [...square].reverse()]) {
    const faces = prism([ring], 6);
    assert.equal(faces.l, ''); assert.equal(faces.r, '');
    assert.equal((faces.m.match(/M/g) ?? []).length, 1, 'just the near (bottom) wall');
    assert.match(faces.top, /0\.0,-6\.0L10\.0,-6\.0|10\.0,-6\.0L0\.0,-6\.0/, 'the top face is lifted by the height');
  }
  const diamond = [[10, 0], [20, 10], [10, 20], [0, 10]];
  const faces = prism([diamond], 4);
  assert.equal((faces.l.match(/M/g) ?? []).length, 1, 'the lower-left wall catches the light');
  assert.equal((faces.r.match(/M/g) ?? []).length, 1, 'the lower-right wall is in shade');
  assert.equal(faces.m, '');
});
