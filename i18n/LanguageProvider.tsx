import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as Localization from 'expo-localization';
import { getSetting, setSetting } from '@/db/settings';
import {
  createTranslator,
  parsePreference,
  resolveLanguage,
  type LanguagePreference,
  type Translator,
} from '@/utils/i18n';
import type { Language } from '@/i18n/dictionary';

const SETTING_KEY = 'language';

type LanguageContextValue = {
  language: Language;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: Translator;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function deviceLocale(): string | null {
  try {
    return Localization.getLocales()[0]?.languageCode ?? null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] =
    useState<LanguagePreference>('system');

  // Load the persisted preference once on mount. Tolerates the app_settings
  // table appearing late (migrations run on startup) via try/catch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getSetting(SETTING_KEY);
        if (!cancelled) setPreferenceState(parsePreference(stored));
      } catch {
        // Fall back to 'system' (already the default).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: LanguagePreference) => {
    setPreferenceState(next);
    void setSetting(SETTING_KEY, next).catch(() => {
      // Persisting failed; the in-memory state still updates the UI.
    });
  };

  const language = useMemo(
    () => resolveLanguage(preference, deviceLocale()),
    [preference]
  );

  const t = useMemo(() => createTranslator(language), [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, preference, setPreference, t }),
    [language, preference, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage/useT must be used within a LanguageProvider');
  }
  return ctx;
}

/** Returns the memoized translator for the active language. */
export function useT(): Translator {
  return useLanguageContext().t;
}

/** Returns the active language, the raw preference, and a setter. */
export function useLanguage(): {
  language: Language;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
} {
  const { language, preference, setPreference } = useLanguageContext();
  return { language, preference, setPreference };
}
