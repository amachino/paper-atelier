/* Local reading preferences only. No requests, cookies, or external services. */
(() => {
  'use strict';
  const storageKey = 'paper-atelier.reader-settings.v1';
  const root = document.documentElement;
  const nearestSize = value => {
    const mobile = window.matchMedia('(max-width:600px)').matches;
    const tablet = window.matchMedia('(max-width:900px)').matches;
    const sizes = mobile ? [14.5, 17, 20] : [tablet ? 18 : 19, 22, 25];
    let nearest = 0;
    for (let i = 1; i < sizes.length; i++) if (Math.abs(sizes[i] - value) < Math.abs(sizes[nearest] - value)) nearest = i;
    return ['small', 'medium', 'large'][nearest];
  };
  const normalize = value => ({
    font: value && value.font === 'sans' ? 'sans' : 'serif',
    size: value && ['small', 'medium', 'large'].includes(value.size) ? value.size : value && typeof value.size === 'number' && value.size >= 12 && value.size <= 24 && Number.isInteger(value.size * 2) ? nearestSize(value.size) : 'small',
    theme: value && value.theme === 'dark' ? 'dark' : 'light'
  });
  const parse = text => { try { return normalize(JSON.parse(text)); } catch { return normalize(null); } };
  let preferences = normalize(null);
  let stored;
  try { stored = JSON.parse(localStorage.getItem(storageKey)); preferences = normalize(stored); } catch { /* Use responsive light defaults. */ }
  const persist = () => {
    try {
      if (preferences.font === 'serif' && preferences.size === 'small' && preferences.theme === 'light') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(preferences));
      return true;
    } catch { return false; }
  };
  // Migrate a valid numeric v1 size once, using the current viewport's presets.
  if (stored && typeof stored.size === 'number') persist();
  const apply = () => {
    root.dataset.readerFont = preferences.font;
    root.dataset.readerSize = preferences.size;
    root.dataset.readerTheme = preferences.theme;
    root.style.removeProperty('--reader-font-size');
  };
  // Apply before first layout; default appearance is explicitly Light.
  apply();
  const initialize = () => {
    const dialog = document.getElementById('reader-settings');
    const opener = document.getElementById('reader-settings-open');
    if (!dialog || !opener || typeof dialog.showModal !== 'function') return;
    const radios = [...dialog.querySelectorAll('input[type="radio"]')];
    const status = document.getElementById('reader-settings-status');
    let returnFocus = opener;
    let backdropPress = false;
    const sync = () => { for (const radio of radios) radio.checked = preferences[radio.name.replace('reader-', '')] === radio.value; };
    const update = value => {
      preferences = normalize(value);
      apply(); sync();
      status.textContent = persist() ? `${preferences.size} text, ${preferences.font === 'sans' ? 'sans-serif' : 'serif'}, ${preferences.theme} appearance. Saved in this browser.` : 'Applied for this page. Browser storage is unavailable.';
    };
    opener.addEventListener('click', () => {
      if (dialog.open) return;
      returnFocus = document.activeElement || opener;
      dialog.showModal();
      opener.setAttribute('aria-expanded', 'true');
    });
    document.getElementById('reader-settings-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    dialog.addEventListener('close', () => {
      opener.setAttribute('aria-expanded', 'false');
      (returnFocus.isConnected ? returnFocus : opener).focus();
    });
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
    };
    dialog.addEventListener('pointerdown', event => { backdropPress = outside(event); });
    dialog.addEventListener('click', event => { if (backdropPress && outside(event)) dialog.close(); backdropPress = false; });
    for (const radio of radios) radio.addEventListener('change', () => {
      if (radio.checked) update({...preferences, [radio.name.replace('reader-', '')]:radio.value});
    });
    document.getElementById('reader-settings-reset').addEventListener('click', () => {
      update(null);
      if (status.textContent.includes('Saved')) status.textContent = 'Small text, Serif font, and Light appearance restored.';
    });
    window.addEventListener('storage', event => {
      if (event.key !== storageKey && event.key !== null) return;
      preferences = parse(event.newValue);
      apply(); sync();
    });
    sync();
    opener.hidden = false;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
