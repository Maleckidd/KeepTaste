import {
  emptyRecipeFormData,
  recipeToFormData,
  isRecipeFormDirty,
  initialCookbookId,
  recipeSaveNotice,
  RecipeFormData,
} from '../utils/recipeForm';
import type { Recipe } from '../db/schema';

const baseRecipe = {
  id: 1,
  cookbookId: 3,
  title: 'Strawberry tart',
  prepTime: 15,
  cookTime: 45,
  servings: 4,
  imagePath: 'file:///tart.jpg',
  ingredients: '200g flour\n100g butter',
  instructions: '# Prepare\nMix it.',
  notes: 'Add more vanilla next time.',
  toTry: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
} as unknown as Recipe;

describe('emptyRecipeFormData', () => {
  it('returns all string fields empty, toTry false and no cookbook (§5.19, §5.5)', () => {
    expect(emptyRecipeFormData()).toEqual({
      title: '',
      prepTime: '',
      cookTime: '',
      servings: '',
      imagePath: '',
      ingredients: '',
      instructions: '',
      notes: '',
      toTry: false,
      cookbookId: null,
    });
  });

  it('defaults cookbookId to null when no cookbook is given (§5.5)', () => {
    expect(emptyRecipeFormData().cookbookId).toBeNull();
  });

  it('pre-fills cookbookId from the argument (§5.5)', () => {
    expect(emptyRecipeFormData(3).cookbookId).toBe(3);
  });

  it('treats an explicit null argument as no cookbook', () => {
    expect(emptyRecipeFormData(null).cookbookId).toBeNull();
  });

  it('keeps every other field empty when a cookbook is pre-filled', () => {
    expect(emptyRecipeFormData(3)).toEqual({
      ...emptyRecipeFormData(),
      cookbookId: 3,
    });
  });

  it('defaults toTry to false for a new recipe', () => {
    expect(emptyRecipeFormData().toTry).toBe(false);
  });
});

describe('recipeToFormData', () => {
  it('passes title, ingredients and instructions through unchanged', () => {
    const data = recipeToFormData(baseRecipe);
    expect(data.title).toBe('Strawberry tart');
    expect(data.ingredients).toBe('200g flour\n100g butter');
    expect(data.instructions).toBe('# Prepare\nMix it.');
  });

  it('stringifies non-null prepTime, cookTime and servings', () => {
    const data = recipeToFormData(baseRecipe);
    expect(data.prepTime).toBe('15');
    expect(data.cookTime).toBe('45');
    expect(data.servings).toBe('4');
  });

  it('coerces null prepTime, cookTime and servings to empty strings', () => {
    const data = recipeToFormData({
      ...baseRecipe,
      prepTime: null,
      cookTime: null,
      servings: null,
    });
    expect(data.prepTime).toBe('');
    expect(data.cookTime).toBe('');
    expect(data.servings).toBe('');
  });

  it('coerces null imagePath and notes to empty strings', () => {
    const data = recipeToFormData({ ...baseRecipe, imagePath: null, notes: null });
    expect(data.imagePath).toBe('');
    expect(data.notes).toBe('');
  });

  it('passes a non-null imagePath and notes through unchanged', () => {
    const data = recipeToFormData(baseRecipe);
    expect(data.imagePath).toBe('file:///tart.jpg');
    expect(data.notes).toBe('Add more vanilla next time.');
  });

  it('maps the full recipe to the complete form shape', () => {
    expect(recipeToFormData(baseRecipe)).toEqual({
      title: 'Strawberry tart',
      prepTime: '15',
      cookTime: '45',
      servings: '4',
      imagePath: 'file:///tart.jpg',
      ingredients: '200g flour\n100g butter',
      instructions: '# Prepare\nMix it.',
      notes: 'Add more vanilla next time.',
      toTry: false,
      cookbookId: 3,
    });
  });

  it('maps recipe.cookbookId to cookbookId (§5.5)', () => {
    expect(recipeToFormData(baseRecipe).cookbookId).toBe(3);
  });

  it('maps a null recipe.cookbookId to null (§5.5)', () => {
    expect(
      recipeToFormData({ ...baseRecipe, cookbookId: null }).cookbookId,
    ).toBeNull();
  });

  it('maps to_try 0 → toTry false and 1 → toTry true (§5.19)', () => {
    expect(recipeToFormData({ ...baseRecipe, toTry: 0 } as any).toTry).toBe(false);
    expect(recipeToFormData({ ...baseRecipe, toTry: 1 } as any).toTry).toBe(true);
  });
});

describe('isRecipeFormDirty', () => {
  const base: RecipeFormData = {
    title: 'Strawberry tart',
    prepTime: '15',
    cookTime: '45',
    servings: '4',
    imagePath: 'file:///tart.jpg',
    ingredients: '200g flour',
    instructions: '# Prepare',
    notes: 'Tweak it.',
    toTry: false,
    cookbookId: 3,
  } as RecipeFormData;

  it('is false for identical data', () => {
    expect(isRecipeFormDirty(base, { ...base })).toBe(false);
  });

  it('is false for two empty form snapshots', () => {
    expect(isRecipeFormDirty(emptyRecipeFormData(), emptyRecipeFormData())).toBe(false);
  });

  it('is true when the title differs', () => {
    expect(isRecipeFormDirty(base, { ...base, title: 'Apple tart' })).toBe(true);
  });

  it('is true when the prepTime differs', () => {
    expect(isRecipeFormDirty(base, { ...base, prepTime: '20' })).toBe(true);
  });

  it('is true when an image is added', () => {
    const initial: RecipeFormData = { ...base, imagePath: '' };
    const current: RecipeFormData = { ...base, imagePath: 'file:///new.jpg' };
    expect(isRecipeFormDirty(initial, current)).toBe(true);
  });

  it('is true when an image is removed', () => {
    expect(isRecipeFormDirty(base, { ...base, imagePath: '' })).toBe(true);
  });

  it('is true when the ingredients differ', () => {
    expect(isRecipeFormDirty(base, { ...base, ingredients: '300g flour' })).toBe(true);
  });

  it('is true when the instructions differ', () => {
    expect(isRecipeFormDirty(base, { ...base, instructions: '# Bake' })).toBe(true);
  });

  it('is true when the notes differ', () => {
    expect(isRecipeFormDirty(base, { ...base, notes: 'Different note.' })).toBe(true);
  });

  it('is true when the toTry flag is toggled on (§5.19)', () => {
    expect(isRecipeFormDirty(base, { ...base, toTry: true } as RecipeFormData)).toBe(
      true,
    );
  });

  it('is true when the toTry flag is toggled off (§5.19)', () => {
    const initial = { ...base, toTry: true } as RecipeFormData;
    expect(isRecipeFormDirty(initial, { ...base, toTry: false } as RecipeFormData)).toBe(
      true,
    );
  });

  it('is false when cookbookId is equal (§5.5)', () => {
    expect(isRecipeFormDirty(base, { ...base, cookbookId: 3 })).toBe(false);
  });

  it('is false when both cookbookIds are null', () => {
    const initial: RecipeFormData = { ...base, cookbookId: null };
    expect(isRecipeFormDirty(initial, { ...base, cookbookId: null })).toBe(false);
  });

  it('is true when only cookbookId changes null → 3 (§5.5)', () => {
    const initial: RecipeFormData = { ...base, cookbookId: null };
    expect(isRecipeFormDirty(initial, { ...base, cookbookId: 3 })).toBe(true);
  });

  it('is true when only cookbookId changes 3 → null (§5.5)', () => {
    expect(isRecipeFormDirty(base, { ...base, cookbookId: null })).toBe(true);
  });

  it('is true when only cookbookId changes 3 → 5 (§5.5)', () => {
    expect(isRecipeFormDirty(base, { ...base, cookbookId: 5 })).toBe(true);
  });
});

// SPEC.md §5.5 "Cookbook field": the new-recipe form is pre-filled with the
// cookbook the user came from, but only when the route param names a real,
// existing cookbook. Anything else ("all", junk, a deleted id) → no cookbook.
describe('initialCookbookId', () => {
  const cookbooks = [{ id: 1 }, { id: 3 }, { id: 7 }];

  it('returns null for an undefined param', () => {
    expect(initialCookbookId(undefined, cookbooks)).toBeNull();
  });

  it('returns null for an empty param', () => {
    expect(initialCookbookId('', cookbooks)).toBeNull();
  });

  it('returns null for the literal "all" view id', () => {
    expect(initialCookbookId('all', cookbooks)).toBeNull();
  });

  it('returns null for a non-numeric param', () => {
    expect(initialCookbookId('abc', cookbooks)).toBeNull();
  });

  it('returns null for "0" (not a positive integer)', () => {
    expect(initialCookbookId('0', cookbooks)).toBeNull();
  });

  it('returns null for a negative id', () => {
    expect(initialCookbookId('-2', cookbooks)).toBeNull();
  });

  it('returns null for a positive id that is not an existing cookbook', () => {
    expect(initialCookbookId('5', cookbooks)).toBeNull();
  });

  it('returns null when there are no cookbooks at all', () => {
    expect(initialCookbookId('3', [])).toBeNull();
  });

  it('returns the numeric id when it names an existing cookbook', () => {
    expect(initialCookbookId('3', cookbooks)).toBe(3);
  });

  it('returns a number, not the raw string param', () => {
    expect(typeof initialCookbookId('7', cookbooks)).toBe('number');
  });
});

// SPEC.md §5.5 "Save confirmation": after save the user is told where the
// recipe landed. Create always confirms; edit only speaks up when the cookbook
// changed (a move).
describe('recipeSaveNotice', () => {
  const cookbooks = [
    { id: 1, name: 'Desserts' },
    { id: 3, name: 'Ciasta i wypieki' },
  ];

  describe('create', () => {
    it('returns savedIn with the cookbook name for an existing cookbook', () => {
      expect(recipeSaveNotice('create', null, 3, cookbooks)).toEqual({
        kind: 'savedIn',
        cookbookName: 'Ciasta i wypieki',
      });
    });

    it('returns saved when no cookbook was chosen', () => {
      expect(recipeSaveNotice('create', null, null, cookbooks)).toEqual({
        kind: 'saved',
      });
    });

    it('returns saved when the target cookbook id is unknown', () => {
      expect(recipeSaveNotice('create', null, 99, cookbooks)).toEqual({
        kind: 'saved',
      });
    });

    it('ignores fromCookbookId on create', () => {
      expect(recipeSaveNotice('create', 3, 3, cookbooks)).toEqual({
        kind: 'savedIn',
        cookbookName: 'Ciasta i wypieki',
      });
      expect(recipeSaveNotice('create', 1, null, cookbooks)).toEqual({
        kind: 'saved',
      });
    });
  });

  describe('edit', () => {
    it('returns null when the cookbook did not change', () => {
      expect(recipeSaveNotice('edit', 3, 3, cookbooks)).toBeNull();
    });

    it('returns null when the recipe stays uncategorized (null → null)', () => {
      expect(recipeSaveNotice('edit', null, null, cookbooks)).toBeNull();
    });

    it('returns moved with the new cookbook name when moved to an existing cookbook', () => {
      expect(recipeSaveNotice('edit', 1, 3, cookbooks)).toEqual({
        kind: 'moved',
        cookbookName: 'Ciasta i wypieki',
      });
    });

    it('returns moved with the name when moved from uncategorized into a cookbook', () => {
      expect(recipeSaveNotice('edit', null, 1, cookbooks)).toEqual({
        kind: 'moved',
        cookbookName: 'Desserts',
      });
    });

    it('returns moved with a null name when removed from its cookbook', () => {
      expect(recipeSaveNotice('edit', 3, null, cookbooks)).toEqual({
        kind: 'moved',
        cookbookName: null,
      });
    });

    it('returns moved with a null name when moved to an unknown cookbook id', () => {
      expect(recipeSaveNotice('edit', 3, 99, cookbooks)).toEqual({
        kind: 'moved',
        cookbookName: null,
      });
    });
  });
});
