// Tests for the sample-content seed builder (seed sample content on first
// launch). buildSeedContent(language) is pure: it maps a language to a
// localized cookbook + a single ready-to-save showcase recipe (beer-batter
// pancakes). The invariants below mirror the app's own form rules (SPEC.md
// §5.5): the only required field is the title; numeric fields are an integer
// >= 1 or null, never NaN/0/negative; the photo is attached by the DB seed
// layer, so the pure builder always leaves imagePath null and never seeds
// to-try.
import { buildSeedContent } from '../utils/seedData';
import type { SeedContent, SeedRecipe } from '../utils/seedData';
import type { Language } from '../utils/i18n';

const LANGUAGES: Language[] = ['en', 'pl'];

function isValidNumericField(v: number | null): boolean {
  if (v === null) return true;
  return Number.isInteger(v) && v >= 1;
}

describe.each(LANGUAGES)('buildSeedContent(%s)', (language) => {
  const content: SeedContent = buildSeedContent(language);

  it('has exactly one recipe (the pancakes showcase)', () => {
    expect(content.recipes.length).toBe(1);
  });

  it('every recipe has a non-empty, trimmed title', () => {
    for (const r of content.recipes) {
      expect(typeof r.title).toBe('string');
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.title).toBe(r.title.trim());
    }
  });

  it('numeric fields are null or an integer >= 1 (never NaN, 0, or negative)', () => {
    for (const r of content.recipes) {
      for (const field of [r.prepTime, r.cookTime, r.servings]) {
        expect(Number.isNaN(field as number)).toBe(false);
        expect(isValidNumericField(field)).toBe(true);
      }
    }
  });

  it('is a complete showcase: prepTime, cookTime and servings are all non-null', () => {
    for (const r of content.recipes) {
      expect(r.prepTime).not.toBeNull();
      expect(r.cookTime).not.toBeNull();
      expect(r.servings).not.toBeNull();
    }
  });

  it('ingredients and instructions are non-empty strings', () => {
    for (const r of content.recipes) {
      expect(typeof r.ingredients).toBe('string');
      expect(r.ingredients.trim().length).toBeGreaterThan(0);
      expect(typeof r.instructions).toBe('string');
      expect(r.instructions.trim().length).toBeGreaterThan(0);
    }
  });

  it('never seeds an image or marks a recipe to-try', () => {
    for (const r of content.recipes) {
      expect(r.imagePath).toBeNull();
      expect(r.toTry).toBe(0);
    }
  });

  it('has at least one recipe with a non-empty "this is a sample" note', () => {
    const withNote = content.recipes.filter(
      (r) => typeof r.notes === 'string' && r.notes.trim().length > 0
    );
    expect(withNote.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildSeedContent — English content', () => {
  const en = buildSeedContent('en');

  it('names the cookbook exactly "Breakfasts"', () => {
    expect(en.cookbook.name).toBe('Breakfasts');
  });

  it('mentions beer in the ingredients (beer-batter pancakes)', () => {
    const ingredients = en.recipes[0].ingredients.toLowerCase();
    expect(ingredients).toContain('beer');
  });
});

describe('buildSeedContent — Polish content', () => {
  const pl = buildSeedContent('pl');

  it('names the cookbook exactly "Śniadania"', () => {
    expect(pl.cookbook.name).toBe('Śniadania');
  });

  it('titles the recipe exactly "Naleśniki"', () => {
    expect(pl.recipes[0].title).toBe('Naleśniki');
  });

  it('mentions beer in the ingredients (piwa / piwo)', () => {
    const ingredients = pl.recipes[0].ingredients.toLowerCase();
    expect(ingredients).toMatch(/piw[ao]/);
  });
});

describe('buildSeedContent parity across languages', () => {
  const en = buildSeedContent('en');
  const pl = buildSeedContent('pl');

  const nullness = (r: SeedRecipe) => ({
    prepTime: r.prepTime === null,
    cookTime: r.cookTime === null,
    servings: r.servings === null,
    notes: r.notes === null,
  });

  it('EN and PL have the same recipe count', () => {
    expect(pl.recipes.length).toBe(en.recipes.length);
  });

  it('EN and PL share the same index-by-index nullness pattern (translations stay in sync)', () => {
    expect(pl.recipes.map(nullness)).toEqual(en.recipes.map(nullness));
  });

  it('EN and PL actually differ (cookbook names and titles are translated)', () => {
    expect(pl.cookbook.name).not.toBe(en.cookbook.name);
    expect(pl.recipes[0].title).not.toBe(en.recipes[0].title);
    expect(en.recipes[0].title.length).toBeGreaterThan(0);
  });
});
