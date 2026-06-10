import * as schema from '../db/schema';

describe('db/schema — tag tables removed', () => {
  it('does not export the tags table', () => {
    expect((schema as Record<string, unknown>).tags).toBeUndefined();
  });

  it('does not export the recipeTags table', () => {
    expect((schema as Record<string, unknown>).recipeTags).toBeUndefined();
  });

  it('still exports cookbooks and recipes tables', () => {
    expect(schema.cookbooks).toBeDefined();
    expect(schema.recipes).toBeDefined();
  });
});
