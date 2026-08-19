/**
 * UI languages (Phase 9): NL / EN / FR. Only UI strings live here — generated names, club
 * identities and rules are data and are not translated. The choice persists in localStorage;
 * the default follows the browser.
 */
import { createI18n } from 'vue-i18n';
import en from './en.json';
import nl from './nl.json';
import fr from './fr.json';

export type Locale = 'nl' | 'en' | 'fr';
export const LOCALES: { id: Locale; label: string }[] = [{ id: 'nl', label: 'Nederlands' }, { id: 'en', label: 'English' }, { id: 'fr', label: 'Français' }];
const KEY = 'bullyoff.locale';

export function detectLocale(): Locale {
  try {
    const saved = globalThis.localStorage.getItem(KEY);
    if (saved === 'nl' || saved === 'en' || saved === 'fr') return saved;
  } catch { /* storage unavailable */ }
  const nav = (globalThis.navigator.languages[0] ?? globalThis.navigator.language).toLowerCase();
  if (nav.startsWith('nl')) return 'nl';
  if (nav.startsWith('fr')) return 'fr';
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, nl, fr },
});

export function setLocale(l: Locale): void {
  i18n.global.locale.value = l;
  try { globalThis.localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
}
