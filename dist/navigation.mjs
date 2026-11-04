// Screen availability never changes the user's inputs, draft, or saved courses.
export const SCREENS = Object.freeze(['home', 'profile', 'trip', 'regions', 'experiences', 'course', 'saved', 'benefits', 'settings', 'pet', 'ai', 'ai-results', 'arrival', 'dex', 'map', 'start', 'follow']);
export function resolveScreen(requested, { profileValid = true, comparisonReady = false, recommendationsReady = false, hasCourse = false, petChosen = false, aiResultsReady = false, arrivalReady = false, followReady = false } = {}) {
  if (!SCREENS.includes(requested)) return 'home';
  // D27 pet flow: 펫 → 조건 → 추천. A step opens only once the one before it has what it needs.
  if (requested === 'ai-results') return aiResultsReady ? 'ai-results' : petChosen ? 'ai' : 'pet';
  if (requested === 'ai') return petChosen ? 'ai' : 'pet';
  // Stage 5: the arrival screen exists only after a district was detected in this visit; the 도감 always opens.
  // Stage 6: the living map always opens.
  if (requested === 'arrival') return arrivalReady ? 'arrival' : 'home';
  // D49: the following screen exists while a course is being followed (kept in this browser).
  if (requested === 'follow') return followReady ? 'follow' : 'home';
  if (['home', 'profile', 'settings', 'saved', 'benefits', 'pet', 'dex', 'map', 'start'].includes(requested)) return requested;
  // An existing draft remains readable even when the newly edited inputs are invalid.
  if (requested === 'course' && hasCourse) return 'course';
  if (!profileValid) return 'profile';
  if (requested === 'trip') return 'trip';
  if (!comparisonReady && !recommendationsReady) return 'trip';
  if (requested === 'regions') return comparisonReady ? 'regions' : 'trip';
  if (!recommendationsReady) return comparisonReady ? 'regions' : 'trip';
  return 'experiences';
}
export function parentScreen(screen) {
  return { home: 'home', profile: 'home', settings: 'home', trip: 'profile', regions: 'trip', experiences: 'regions', course: 'experiences', saved: 'home', benefits:'home', pet: 'home', ai: 'pet', 'ai-results': 'ai', arrival: 'home', dex: 'home', map: 'home', start: 'home', follow: 'home' }[screen] ?? 'home';
}

export function navigationTab(screen) {
  return { saved: 'saved', settings: 'profile', benefits: 'benefits' }[screen] ?? 'discover';
}
