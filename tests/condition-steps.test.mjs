import test from 'node:test';
import assert from 'node:assert/strict';
import { CONDITION_STEPS, LAST_STEP, clampStep, stepDirection, stepOfField, firstErrorStep, stepErrors, answerLabels, petLine } from '../dist/condition-steps.mjs';
import { normalizeConditions } from '../dist/ai-conditions.mjs';

const petIds = ['golden', 'shiba', 'corgi', 'bichon', 'baekgu'];
const answered = answerLabels({ departure: '경복궁역', hours: 4, partySize: 2, walkLevel: 2, timeOfDay: 'day' });

test('D42 steps ask every condition field exactly once, in screen order', () => {
  assert.deepEqual(CONDITION_STEPS.map((step) => step.id), ['departure', 'hours', 'party', 'time']);
  assert.deepEqual(CONDITION_STEPS.flatMap((step) => step.fields), ['departure', 'hours', 'partySize', 'walkLevel', 'timeOfDay']);
  assert.equal(LAST_STEP, 3);
  assert.deepEqual(CONDITION_STEPS.map((step) => step.auto), [true, true, false, false]);
  // Every field the conditions check can reject (except pet and metFriends, which are not on this screen) has a step.
  try { normalizeConditions({ pet: 'golden', departure: '', hours: NaN, partySize: 0, walkLevel: 9, timeOfDay: 'x', metFriends: [] }, { petIds }); assert.fail('should reject'); }
  catch (error) { assert.deepEqual(Object.keys(error.fields).map(stepOfField), [0, 1, 2, 2, 3]); }
});

test('step moves stay inside the four steps and know their direction', () => {
  assert.equal(clampStep(-1), 0); assert.equal(clampStep(9), 3); assert.equal(clampStep(2), 2); assert.equal(clampStep(undefined), 0);
  assert.equal(stepDirection(0, 1), 'forward'); assert.equal(stepDirection(3, 1), 'back'); assert.equal(stepDirection(2, 2), 'none');
});

test('a failed check jumps to the earliest step with an error and shows only that step\'s messages', () => {
  assert.equal(firstErrorStep({ timeOfDay: 'a', hours: 'b' }), 1);
  assert.equal(firstErrorStep({ walkLevel: 'a' }), 2);
  assert.equal(firstErrorStep({ metFriends: 'a' }), -1);
  assert.equal(firstErrorStep({}), -1);
  assert.deepEqual(stepErrors({ departure: 'a', walkLevel: 'b', partySize: 'c' }, 2), { walkLevel: 'b', partySize: 'c' });
  assert.deepEqual(stepErrors({ departure: 'a' }, 1), {});
});

test('answer labels read like the chips and stay empty until a valid answer', () => {
  assert.deepEqual(answered, { departure: '경복궁역', hours: '4시간', people: '2명', walk: '적당히', party: '2명 · 적당히 걷기', time: '낮' });
  assert.equal(answerLabels({ partySize: 1, walkLevel: 1 }).party, '혼자 · 조금만 걷기');
  assert.equal(answerLabels({ hours: 2.5 }).hours, '2시간 30분');
  const empty = answerLabels({ departure: '', hours: NaN, partySize: NaN, walkLevel: NaN, timeOfDay: undefined });
  assert.deepEqual(Object.values(empty), ['', '', '', '', '', '']);
  assert.equal(answerLabels({ hours: 0.25 }).hours, '');
});

test('each pet speaks every step in its own tone without empty labels', () => {
  for (const id of [...petIds, 'unknown']) {
    for (const moment of ['departure', 'hours', 'party', 'time', 'ready', 'oops']) {
      const line = petLine(id, moment, answered);
      assert.ok(line.length > 4, `${id} ${moment}`);
      assert.doesNotMatch(line, /undefined|NaN|null/);
    }
  }
  assert.equal(petLine('baekgu', 'hours', answered), '경복궁역에서 출발하시는군요. 시간은 얼마나 되십니까?');
  assert.equal(petLine('golden', 'time', answered), '2명, 적당히 걷기! 언제 출발할까?');
  assert.equal(petLine('shiba', 'party', answerLabels({ hours: 8 })), '하루면 여유롭겠네요. 몇 분이서 가나요?');
  assert.equal(petLine('bichon', 'party', answerLabels({ hours: 0.5 })), '30분이면 사진 많이 남길 수 있어요. 몇 분이서 가세요?');
  // Without the earlier answer the pet just asks the step's question.
  assert.equal(petLine('corgi', 'hours', {}), '시간은 얼마나 있어요?');
  assert.equal(petLine('golden', 'time', answerLabels({ partySize: 2 })), '언제 출발해요?');
});
