// D33/P46: design drafts to compare on real screens. The choice is a per-browser convenience (localStorage) and a
// link parameter (?theme=coast); "base" is the approved design and the default.
export const THEMES = Object.freeze([
  { id: 'base', name: '기본', hint: '흑연·코발트' },
  { id: 'coast', name: '바다 여행', hint: '하늘·바다·산호' },
  { id: 'postcard', name: '엽서 여행', hint: '종이·우체국 빨강' },
  { id: 'sunset', name: '노을 산책', hint: '복숭아·주황' },
  { id: 'metro', name: '서울 지하철', hint: '노선 색·표지판' },
]);
export const THEME_KEY = 'growing-travel.theme.v1';
const known = (id) => THEMES.some((theme) => theme.id === id);

// D35: the season design (sky.mjs) is now the default and the picker left the home screen, so a draft opens only
// from a ?theme= link; a draft saved earlier in this browser is no longer applied.
export function initialTheme(search = globalThis.location?.search ?? '') {
  const fromLink = new URLSearchParams(search).get('theme');
  return known(fromLink) ? fromLink : 'base';
}

export function applyTheme(id, root = globalThis.document?.documentElement) {
  if (!root) return;
  if (id === 'base' || !known(id)) delete root.dataset.theme;
  else root.dataset.theme = id;
}

export function setupThemePicker() {
  const current = initialTheme();
  applyTheme(current);
  const container = document.getElementById('theme-options');
  if (!container) return;
  container.replaceChildren(...THEMES.map((theme) => {
    const label = document.createElement('label'); label.className = 'theme-option';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'theme'; input.value = theme.id; input.checked = theme.id === current; input.autocomplete = 'off';
    const box = document.createElement('span');
    const swatch = document.createElement('i'); swatch.className = `theme-swatch-${theme.id}`; swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('b'); name.textContent = theme.name;
    const hint = document.createElement('small'); hint.textContent = theme.hint;
    box.append(swatch, name, hint);
    input.addEventListener('change', () => {
      applyTheme(theme.id);
      try { localStorage.setItem(THEME_KEY, theme.id); } catch { /* the choice lasts for this visit only */ }
    });
    label.append(input, box);
    return label;
  }));
}
