// Lightweight mock of react-native for pure-logic tests. Only the surface
// touched by importable logic modules (e.g. constants/theme.ts) is provided.
export const useColorScheme = (): 'light' | 'dark' | null => 'light';
