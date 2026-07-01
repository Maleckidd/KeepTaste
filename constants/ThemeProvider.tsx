import React, { useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getSetting, setSetting } from '@/db/settings';
import {
  ThemeContext,
  parseThemePreference,
  resolveScheme,
  type ThemeContextValue,
  type ThemePreference,
} from '@/constants/theme';

const SETTING_KEY = 'theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Load the persisted preference once on mount. Tolerates the app_settings
  // table appearing late (migrations run on startup) via try/catch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getSetting(SETTING_KEY);
        if (!cancelled) setPreferenceState(parseThemePreference(stored));
      } catch {
        // Fall back to 'system' (already the default).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    void setSetting(SETTING_KEY, next).catch(() => {
      // Persisting failed; the in-memory state still updates the UI.
    });
  };

  const scheme = resolveScheme(preference, systemScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, preference, setPreference }),
    [scheme, preference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
