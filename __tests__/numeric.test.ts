import { parsePositiveInt } from '../utils/numeric';

describe('parsePositiveInt', () => {
  describe('returns null for non-positive-integer input', () => {
    it('empty string -> null', () => {
      expect(parsePositiveInt('')).toBeNull();
    });

    it('whitespace only -> null', () => {
      expect(parsePositiveInt('   ')).toBeNull();
    });

    it('non-numeric -> null', () => {
      expect(parsePositiveInt('abc')).toBeNull();
    });

    it('"0" -> null (below the lower bound of 1)', () => {
      expect(parsePositiveInt('0')).toBeNull();
    });

    it('negative -> null', () => {
      expect(parsePositiveInt('-5')).toBeNull();
    });

    it('"  -0  " -> null', () => {
      expect(parsePositiveInt('  -0  ')).toBeNull();
    });
  });

  describe('parses with parseInt semantics (truncates, stops at non-digit)', () => {
    it('"3.7" -> 3 (fraction truncated)', () => {
      expect(parsePositiveInt('3.7')).toBe(3);
    });

    it('"12abc" -> 12 (stops at first non-digit)', () => {
      expect(parsePositiveInt('12abc')).toBe(12);
    });

    it('"1e3" -> 1 (parseInt reads "1" then stops at "e", NOT 1000)', () => {
      expect(parsePositiveInt('1e3')).toBe(1);
    });
  });

  describe('returns the integer for valid positive input', () => {
    it('trims surrounding whitespace: " 7 " -> 7', () => {
      expect(parsePositiveInt(' 7 ')).toBe(7);
    });

    it('"15" -> 15', () => {
      expect(parsePositiveInt('15')).toBe(15);
    });

    it('"1" -> 1 (lower bound)', () => {
      expect(parsePositiveInt('1')).toBe(1);
    });

    it('"999999999" -> 999999999', () => {
      expect(parsePositiveInt('999999999')).toBe(999999999);
    });
  });
});
