// Pure share-text builder for a single recipe. Uses the real translators so the
// labels are the actual localized strings, and verifies EN vs PL differ.
import { buildRecipeShareText } from '../utils/recipeShareText';
import { createTranslator } from '../utils/i18n';

const en = createTranslator('en');
const pl = createTranslator('pl');

function recipe(over: Partial<any> = {}): any {
  return {
    id: 1,
    cookbookId: 1,
    title: 'Pierogi Ruskie',
    prepTime: 30,
    cookTime: 20,
    servings: 4,
    imagePath: null,
    ingredients: 'flour\npotato\ncheese',
    instructions: 'Mix. Boil.',
    notes: 'Serve with sour cream.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  };
}

describe('buildRecipeShareText', () => {
  it('includes the title and the recipe content', () => {
    const text = buildRecipeShareText(recipe(), en);
    expect(text).toContain('Pierogi Ruskie');
    expect(text).toContain('flour');
    expect(text).toContain('Mix. Boil.');
    expect(text).toContain('Serve with sour cream.');
  });

  it('uses localized section labels — EN and PL differ', () => {
    const enText = buildRecipeShareText(recipe(), en);
    const plText = buildRecipeShareText(recipe(), pl);

    // Ingredients label differs across locales (Składniki vs Ingredients).
    expect(enText).toContain('Ingredients');
    expect(plText).toContain('Składniki');
    expect(enText).not.toBe(plText);
  });

  it('a title-only recipe yields essentially just the title, no empty sections', () => {
    const text = buildRecipeShareText(
      recipe({
        prepTime: null,
        cookTime: null,
        servings: null,
        ingredients: '',
        instructions: '',
        notes: null,
      }),
      en,
    );
    expect(text).toContain('Pierogi Ruskie');
    expect(text).not.toContain('Ingredients');
    expect(text).not.toContain('Instructions');
    // No placeholder dashes for missing metadata.
    expect(text).not.toContain('—');
  });

  it('omits missing prep/cook/servings while keeping present ones', () => {
    const text = buildRecipeShareText(
      recipe({ prepTime: null, cookTime: 25, servings: null }),
      en,
    );
    // Present cook time should surface; missing prep/servings should not
    // produce dash placeholders.
    expect(text).not.toContain('—');
    expect(text).toContain('25');
  });
});
