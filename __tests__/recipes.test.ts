// Stub the native DB client so importing db/recipes is pure.
jest.mock('../db/client', () => ({ db: {}, runMigrations: jest.fn() }));

import * as recipesModule from '../db/recipes';

describe('db/recipes — tag helpers removed', () => {
  it.each([
    'getAllTags',
    'getTagsForRecipe',
    'findOrCreateTag',
    'setTagsForRecipe',
  ])('does not export %s', (name) => {
    expect((recipesModule as Record<string, unknown>)[name]).toBeUndefined();
  });

  it('still exports core recipe helpers', () => {
    expect(typeof recipesModule.getAllRecipes).toBe('function');
    expect(typeof recipesModule.createRecipe).toBe('function');
  });
});
