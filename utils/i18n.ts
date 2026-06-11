// Pure i18n helpers (SPEC.md §5.11). No native imports, no DB access.
import { dictionary } from '../i18n/dictionary';
import type { Language, TranslationKey } from '../i18n/dictionary';

/** User-selectable language preference; 'system' follows the device locale. */
export type LanguagePreference = Language | 'system';

export type InterpolationParams = Record<string, string | number>;

/** Maps a persisted value to a known preference; anything else -> 'system'. */
export function parsePreference(stored: string | null): LanguagePreference {
  if (stored === 'en' || stored === 'pl' || stored === 'system') {
    return stored;
  }
  return 'system';
}

/**
 * Resolves the active language. A non-system preference wins outright.
 * For 'system', a device locale starting with 'pl' -> 'pl', otherwise 'en'.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLocale: string | null
): Language {
  if (preference === 'en' || preference === 'pl') {
    return preference;
  }
  if (deviceLocale && deviceLocale.toLowerCase().startsWith('pl')) {
    return 'pl';
  }
  return 'en';
}

/**
 * Replaces every {token} for which a param is provided. Tokens without a
 * matching param are left literally in place.
 */
export function interpolate(
  template: string,
  params?: InterpolationParams
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, token) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

/** Builds a translator bound to a language. */
export function createTranslator(lang: Language) {
  return (key: TranslationKey, params?: InterpolationParams): string =>
    interpolate(dictionary[key][lang], params);
}

export type Translator = ReturnType<typeof createTranslator>;

/** Polish plural category: 'one' | 'few' | 'many'. */
export function pluralPl(n: number): 'one' | 'few' | 'many' {
  const abs = Math.abs(n);
  if (abs === 1) return 'one';
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return 'few';
  }
  return 'many';
}
