import { matchesQuery, filterRecipesByTitle } from '../utils/search';

describe('matchesQuery', () => {
  it('matches diacritic + capital: "żurek" → "Żurek"', () => {
    // SQL LIKE cannot do this; we lowercase in JS (SPEC §5.1)
    expect(matchesQuery('Żurek', 'żurek')).toBe(true);
  });

  it('matches uppercase query: "ŻUREK" → "Żurek"', () => {
    expect(matchesQuery('Żurek', 'ŻUREK')).toBe(true);
  });

  it('matches lowercase exact: "żurek" → "żurek"', () => {
    expect(matchesQuery('żurek', 'żurek')).toBe(true);
  });

  it('ASCII case-insensitive: "pasta" → "Pasta Carbonara"', () => {
    expect(matchesQuery('Pasta Carbonara', 'pasta')).toBe(true);
  });

  it('substring in the middle: "carbon" → "Pasta Carbonara"', () => {
    expect(matchesQuery('Pasta Carbonara', 'carbon')).toBe(true);
  });

  it('empty query → true', () => {
    expect(matchesQuery('Żurek', '')).toBe(true);
  });

  it('whitespace-only query → true', () => {
    expect(matchesQuery('Żurek', '   ')).toBe(true);
  });

  it('trims surrounding spaces: "  żur  " → "Żurek"', () => {
    expect(matchesQuery('Żurek', '  żur  ')).toBe(true);
  });

  it('no match → false', () => {
    expect(matchesQuery('Żurek', 'pizza')).toBe(false);
  });

  it('substring not accent-folding: "zurek" does NOT match "żurek"', () => {
    // Intentional per SPEC: substring matching, not accent-folding
    expect(matchesQuery('żurek', 'zurek')).toBe(false);
  });

  it('returns a boolean', () => {
    expect(typeof matchesQuery('Żurek', 'żurek')).toBe('boolean');
  });
});

describe('filterRecipesByTitle', () => {
  const recipes = [
    { title: 'Żurek' },
    { title: 'Pasta Carbonara' },
    { title: 'żurek' },
  ];

  it('matches diacritic + capital: "żurek"', () => {
    expect(filterRecipesByTitle(recipes, 'żurek')).toEqual([
      { title: 'Żurek' },
      { title: 'żurek' },
    ]);
  });

  it('uppercase query: "ŻUREK"', () => {
    expect(filterRecipesByTitle(recipes, 'ŻUREK')).toEqual([
      { title: 'Żurek' },
      { title: 'żurek' },
    ]);
  });

  it('ASCII case-insensitive: "pasta"', () => {
    expect(filterRecipesByTitle(recipes, 'pasta')).toEqual([
      { title: 'Pasta Carbonara' },
    ]);
  });

  it('substring in the middle: "carbon"', () => {
    expect(filterRecipesByTitle(recipes, 'carbon')).toEqual([
      { title: 'Pasta Carbonara' },
    ]);
  });

  it('empty query → whole array unchanged (length + order)', () => {
    const result = filterRecipesByTitle(recipes, '');
    expect(result).toEqual(recipes);
    expect(result.length).toBe(3);
  });

  it('whitespace-only query → whole array unchanged', () => {
    const result = filterRecipesByTitle(recipes, '   ');
    expect(result).toEqual(recipes);
    expect(result.length).toBe(3);
  });

  it('trims surrounding spaces: "  żur  "', () => {
    expect(filterRecipesByTitle(recipes, '  żur  ')).toEqual([
      { title: 'Żurek' },
      { title: 'żurek' },
    ]);
  });

  it('no matches ("pizza") → empty array', () => {
    expect(filterRecipesByTitle(recipes, 'pizza')).toEqual([]);
  });

  it('substring not accent-folding: "zurek" → empty array', () => {
    expect(filterRecipesByTitle(recipes, 'zurek')).toEqual([]);
  });
});
