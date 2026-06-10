import {
  emptyRecipeFormData,
  recipeToFormData,
  isRecipeFormDirty,
  RecipeFormData,
} from '../utils/recipeForm';
import type { Recipe } from '../db/schema';

const baseRecipe: Recipe = {
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

describe('emptyRecipeFormData', () => {
  it('returns all eight fields as empty strings', () => {
    expect(emptyRecipeFormData()).toEqual({
      title: '',
      prepTime: '',
      cookTime: '',
      servings: '',
      imagePath: '',
      ingredients: '',
      instructions: '',
      notes: '',
    });
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
    });
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
  };

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
});
