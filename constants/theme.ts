import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

// Cookbook tile colors (rotating) — shared across both palettes.
const cookbookColors = [
  '#C84B31', // brick
  '#4A7C59', // forest green
  '#2C5F8A', // steel blue
  '#8A6C2C', // golden
  '#6B3F7A', // plum
  '#3D7A7A', // teal
];

export const lightColors = {
  primary: '#C84B31',       // deep red / brick
  onPrimary: '#FFFFFF',     // text/icons on primary surfaces

  background: '#FAFAF7',    // warm white
  surface: '#FFFFFF',
  surfaceAlt: '#F5F3EE',    // creamy beige

  text: '#1A1714',          // near-black, warm
  textSecondary: '#6B6560',
  textMuted: '#756C65',     // ≥4.5:1 on background (WCAG AA)

  border: '#E8E4DE',

  error: '#C84B31',

  cookbookColors,
};

export const darkColors = {
  primary: '#E06A4F',
  onPrimary: '#1C1814',     // dark text reads better than white on the lightened primary

  background: '#1C1814',
  surface: '#262019',
  surfaceAlt: '#2F2820',

  text: '#F0EBE4',
  textSecondary: '#A89F95',
  textMuted: '#948A82',     // ≥4.5:1 on background (WCAG AA)

  border: '#3A322A',

  error: '#E06A4F',

  cookbookColors,
};

export type ThemePalette = typeof lightColors;

/** Effective light/dark scheme actually applied to the UI. */
export type ColorScheme = 'light' | 'dark';

/** User choice: follow the OS ('system') or force a scheme. */
export type ThemePreference = 'system' | 'light' | 'dark';

export type ThemeContextValue = {
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

// Provided by ThemeProvider (constants/ThemeProvider.tsx). When absent (e.g.
// in isolated tests), useTheme falls back to the live OS color scheme.
export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Coerces a stored value into a valid preference, defaulting to 'system'. */
export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Resolves the preference + OS scheme into the scheme to actually apply. */
export function resolveScheme(
  preference: ThemePreference,
  systemScheme: ColorScheme | null | undefined
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/** Returns the active color palette, honoring the user's theme preference. */
export function useTheme(): ThemePalette {
  const ctx = useContext(ThemeContext);
  // Hooks must run unconditionally, so always read the OS scheme; it's only
  // used as the fallback when there's no provider above us.
  const systemScheme = useColorScheme();
  const scheme = ctx ? ctx.scheme : systemScheme === 'dark' ? 'dark' : 'light';
  return scheme === 'dark' ? darkColors : lightColors;
}

/** Returns the resolved scheme, the raw preference, and a setter. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemePreference must be used within a ThemeProvider');
  }
  return ctx;
}

export const Typography = {
  fontFamily: {
    // Google Fonts via expo-font planned; system fonts as fallback for now
    display: undefined,   // e.g. 'PlayfairDisplay-Bold'
    body: undefined,      // e.g. 'Lato-Regular'
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    reading: 18,  // recipe ingredients/steps — readable with the phone on the counter
    lg: 20,
    xl: 24,
    xxl: 30,
    xxxl: 38,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    base: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const Radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// Animation timings — subtle, 150–250ms. Used with LayoutAnimation via
// utils/motion.ts, which also respects the system reduce-motion setting.
export const Motion = {
  duration: {
    fast: 150,
    base: 200,
    slow: 250,
  },
};

// Minimum touch target sizes (pt). `list` is deliberately larger — shopping
// list rows are tapped one-handed while walking through a store.
export const Touch = {
  min: 44,
  list: 56,
};

export const Shadow = {
  sm: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};
