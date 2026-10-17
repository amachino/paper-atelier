/* Local reading preferences only. No requests, cookies, or external services. */
(() => {
  'use strict';
  const storageKey = 'paper-atelier.reader-settings.v1';
  const root = document.documentElement;
  const normalize = value => ({
    font: value && value.font === 'sans' ? 'sans' : 'serif',
    size: value && typeof value.size === 'number' && value.size >= 12 && value.size <= 24 && Number.isInteger(value.size * 2) ? value.size : null
  });
  const parse = text => { try { return normalize(JSON.parse(text)); } catch { return normalize(null); } };
  let preferences;
  try { preferences = parse(localStorage.getItem(storageKey)); } catch { preferences = normalize(null); }
  const apply = () => {
    root.dataset.readerFont = preferences.font;
    if (preferences.size === null) root.style.removeProperty('--reader-font-size');
    else root.style.setProperty('--reader-font-size', `${preferences.size}px`);
  };
  // Run in the head, before the first layout and the initial anchor adjustment.
  apply();
  const initialize = () => {
    const details = document.getElementById('reader-settings');
    if (!details) return;
    const font = document.getElementById('reader-font-family');
    const size = document.getElementById('reader-font-size');
    const reset = document.getElementById('reader-settings-reset');
    const status = document.getElementById('reader-settings-status');
    const sync = () => {
      font.value = preferences.font;
      size.value = preferences.size === null ? 'auto' : String(preferences.size);
    };
    const persist = () => {
      try {
        if (preferences.font === 'serif' && preferences.size === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(preferences));
        return true;
      } catch { return false; }
    };
    const update = resetRequested => {
      preferences = resetRequested ? normalize(null) : normalize({font:font.value, size:size.value === 'auto' ? null : Number(size.value)});
      apply(); sync();
      const saved = persist();
      status.textContent = !saved ? 'Applied for this page. Browser storage is unavailable.' : resetRequested ? 'Responsive defaults restored.' : `${preferences.font === 'sans' ? 'Sans-serif' : 'Serif'} text. ${preferences.size === null ? 'Responsive default size' : `${preferences.size} pixel body text`}. Saved in this browser.`;
    };
    font.addEventListener('change', () => update(false));
    size.addEventListener('change', () => update(false));
    reset.addEventListener('click', () => update(true));
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        details.open = false;
        details.querySelector('summary').focus();
        event.preventDefault();
      }
    });
    window.addEventListener('storage', event => {
      if (event.key !== storageKey && event.key !== null) return;
      preferences = parse(event.newValue);
      apply(); sync();
    });
    sync();
    details.hidden = false;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
