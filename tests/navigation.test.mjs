import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScreen, parentScreen, navigationTab } from '../dist/navigation.mjs';

test('unprepared deep links return to the input step without inventing comparisons or courses', () => {
  for (const target of ['regions','experiences','course']) assert.equal(resolveScreen(target), 'trip');
  assert.equal(resolveScreen('unrecognized'), 'home');
});
test('invalid settings cannot be bypassed by entering trip or recommendation screens', () => {
  for (const target of ['trip','regions','experiences']) assert.equal(resolveScreen(target, {profileValid:false,comparisonReady:true,recommendationsReady:true}), 'profile');
  assert.equal(resolveScreen('saved', {profileValid:false}), 'saved');
});
test('existing draft remains readable while newly edited settings or comparisons are stale', () => {
  assert.equal(resolveScreen('course',{profileValid:false,hasCourse:true}), 'course');
  assert.equal(resolveScreen('experiences',{comparisonReady:false,recommendationsReady:false,hasCourse:true}), 'trip');
});
test('comparison, recommendation and saved-course re-entry use only available stages', () => {
  assert.equal(resolveScreen('experiences',{comparisonReady:true}), 'regions');
  assert.equal(resolveScreen('course',{comparisonReady:true,recommendationsReady:true}), 'experiences');
  assert.equal(resolveScreen('experiences',{recommendationsReady:true}), 'experiences');
  assert.equal(resolveScreen('course',{hasCourse:true}), 'course');
});
test('parent navigation is bounded inside the flow and does not mutate readiness state', () => {
  assert.deepEqual(['trip','regions','experiences','course'].map(parentScreen),['profile','trip','regions','experiences']);
  const ready = Object.freeze({profileValid:true,comparisonReady:true,recommendationsReady:true,hasCourse:true});
  assert.equal(resolveScreen('course',ready),'course');
  assert.equal(parentScreen('profile'),'home');
});

test('benefits can be opened on first use with missing or invalid settings without requiring a trip', () => {
  assert.equal(resolveScreen('benefits'),'benefits');
  assert.equal(resolveScreen('benefits',{profileValid:false,comparisonReady:false,recommendationsReady:false,hasCourse:false}),'benefits');
  assert.equal(parentScreen('benefits'),'home');
});

test('home and current settings remain reachable with invalid or missing travel inputs', () => {
  const unavailable = Object.freeze({profileValid:false,comparisonReady:false,recommendationsReady:false,hasCourse:false});
  for (const target of ['home','settings','benefits','saved']) assert.equal(resolveScreen(target,unavailable),target);
  assert.equal(resolveScreen('',unavailable),'home');
  assert.equal(parentScreen('home'),'home');
  assert.equal(parentScreen('settings'),'home');
});

test('legacy profile route stays the travel preference step while settings has its own main tab', () => {
  assert.equal(resolveScreen('profile',{profileValid:false}),'profile');
  assert.equal(navigationTab('profile'),'discover');
  assert.equal(navigationTab('settings'),'profile');
  for (const screen of ['home','trip','regions','experiences','course']) assert.equal(navigationTab(screen),'discover');
  assert.equal(navigationTab('saved'),'saved');
  assert.equal(navigationTab('benefits'),'benefits');
});

test('P47: deeper screens slide forward, going back slides back, and same-level tabs cross-fade', async () => {
  const { navigationDirection } = await import('../dist/screen-navigation.mjs');
  assert.equal(navigationDirection('home','pet'),'forward');
  assert.equal(navigationDirection('pet','ai'),'forward');
  assert.equal(navigationDirection('ai-results','ai'),'back');
  assert.equal(navigationDirection('ai-results','home'),'back');
  assert.equal(navigationDirection('saved','benefits'),'fade');
  assert.equal(navigationDirection('map','dex'),'fade');
});
