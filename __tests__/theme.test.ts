import { lightColors, darkColors } from '../constants/theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;

// The 9 SPEC §6 tokens + error + cookbookColors form the palette contract.
const EXPECTED_KEYS = [
  'primary',
  'onPrimary',
  'background',
  'surface',
  'surfaceAlt',
  'text',
  'textSecondary',
  'textMuted',
  'border',
  'error',
  'cookbookColors',
].sort();

describe('theme palettes', () => {
  describe('1. key parity', () => {
    it('lightColors and darkColors have the identical key set', () => {
      expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
    });

    it('both palettes expose exactly the contract keys', () => {
      expect(Object.keys(lightColors).sort()).toEqual(EXPECTED_KEYS);
      expect(Object.keys(darkColors).sort()).toEqual(EXPECTED_KEYS);
    });
  });

  describe('2. value shape', () => {
    const scalarKeys = EXPECTED_KEYS.filter((k) => k !== 'cookbookColors');

    it.each([
      ['light', lightColors],
      ['dark', darkColors],
    ])('%s scalar tokens are 6-digit hex strings', (_name, palette) => {
      for (const key of scalarKeys) {
        expect((palette as Record<string, unknown>)[key]).toMatch(HEX);
      }
    });

    it.each([
      ['light', lightColors],
      ['dark', darkColors],
    ])('%s cookbookColors is a non-empty array of hex strings', (_name, palette) => {
      expect(Array.isArray(palette.cookbookColors)).toBe(true);
      expect(palette.cookbookColors.length).toBeGreaterThan(0);
      for (const c of palette.cookbookColors) {
        expect(c).toMatch(HEX);
      }
    });
  });

  describe('3. exact dark values (SPEC §6)', () => {
    it('matches the dark palette table', () => {
      expect(darkColors.primary).toBe('#E06A4F');
      expect(darkColors.onPrimary).toBe('#1C1814');
      expect(darkColors.background).toBe('#1C1814');
      expect(darkColors.surface).toBe('#262019');
      expect(darkColors.surfaceAlt).toBe('#2F2820');
      expect(darkColors.text).toBe('#F0EBE4');
      expect(darkColors.textSecondary).toBe('#A89F95');
      expect(darkColors.textMuted).toBe('#948A82');
      expect(darkColors.border).toBe('#3A322A');
    });

    it('error mirrors primary in dark mode', () => {
      expect(darkColors.error).toBe(darkColors.primary);
    });
  });

  describe('4. light values unchanged (SPEC §6 light table)', () => {
    it('spot-checks the light palette', () => {
      expect(lightColors.primary).toBe('#C84B31');
      expect(lightColors.onPrimary).toBe('#FFFFFF');
      expect(lightColors.background).toBe('#FAFAF7');
      expect(lightColors.text).toBe('#1A1714');
      expect(lightColors.textMuted).toBe('#756C65');
    });
  });

  describe('5. modes differ where expected', () => {
    it('background, text and primary differ between palettes', () => {
      expect(lightColors.background).not.toBe(darkColors.background);
      expect(lightColors.text).not.toBe(darkColors.text);
      expect(lightColors.primary).not.toBe(darkColors.primary);
    });

    it('cookbookColors are shared (deep-equal) between palettes', () => {
      expect(lightColors.cookbookColors).toEqual(darkColors.cookbookColors);
    });
  });
});
