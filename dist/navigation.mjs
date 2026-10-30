// Screen availability never changes the user's inputs, draft, or saved courses.
export const SCREENS = Object.freeze(['home', 'profile', 'trip', 'regions', 'experiences', 'course', 'saved', 'benefits', 'settings', 'ai', 'ai-results']);
export function resolveScreen(requested, { profileValid = true, comparisonReady = false, recommendationsReady = false, hasCourse = false, aiResultsReady = false } = {}) {
  if (!SCREENS.includes(requested)) return 'home';
  if (requested === 'ai-results') return aiResultsReady ? 'ai-results' : 'ai';
  if (['home', 'profile', 'settings', 'saved', 'benefits', 'ai'].includes(requested)) return requested;
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
  return { home: 'home', profile: 'home', settings: 'home', trip: 'profile', regions: 'trip', experiences: 'regions', course: 'experiences', saved: 'home', benefits:'home', ai: 'home', 'ai-results': 'ai' }[screen] ?? 'home';
}

export function navigationTab(screen) {
  return { saved: 'saved', settings: 'profile', benefits: 'benefits' }[screen] ?? 'discover';
}
