import * as FileSystem from 'expo-file-system';

// Real export code, stubbed DB + file system: we capture the exact bytes the
// app would write, then feed them to the real parser. Unlike the hand-mirrored
// fixtures in importMarkdown.test.ts, this round-trip breaks automatically if
// the export format and the parser ever drift apart.
jest.mock('../db/recipes', () => ({
  getRecipesByCookbook: jest.fn(),
}));
jest.mock('../db/client', () => ({ db: {}, runMigrations: jest.fn() }));

import { exportCookbookToMarkdown } from '../utils/markdown';
import { parseCookbookMarkdown } from '../utils/importMarkdown';
import { getRecipesByCookbook } from '../db/recipes';

const fullRecipe = {
  id: 1,
  cookbookId: 1,
  title: 'Pierogi Ruskie',
  prepTime: 30,
  cookTime: 90, // > 60 min → exported as "1 hr 30 min"
  servings: 4,
  imagePath: 'file:///mock-documents/img-1.jpg',
  ingredients: '500g flour\n- 2 eggs\n\n#Filling\npotato\ncheese',
  instructions: '# Dough\nKnead well.\n\n**Boil** until they float.',
  notes: 'Serve with sour cream.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const titleOnlyRecipe = {
  id: 2,
  cookbookId: 1,
  title: 'Żurek staropolski',
  prepTime: null,
  cookTime: null,
  servings: null,
  imagePath: null,
  ingredients: '',
  instructions: '',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const cookbook = {
  id: 1,
  name: 'Polish Classics',
  coverImagePath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function exportAndReparse() {
  await exportCookbookToMarkdown(cookbook as any);
  const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;
  expect(mockWrite).toHaveBeenCalled();
  const content = mockWrite.mock.calls[0][1] as string;
  return parseCookbookMarkdown(content);
}

describe('export → import round-trip (real export code, real parser)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('survives a full recipe and a title-only recipe', async () => {
    (getRecipesByCookbook as jest.Mock).mockResolvedValue([
      fullRecipe,
      titleOnlyRecipe,
    ]);

    const result = await exportAndReparse();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cookbookName).toBe('Polish Classics');
    expect(result.recipes).toHaveLength(2);

    const [full, bare] = result.recipes;
    expect(full.title).toBe('Pierogi Ruskie');
    expect(full.prepTime).toBe(30);
    expect(full.cookTime).toBe(90);
    expect(full.servings).toBe(4);
    expect(full.ingredients).toBe(fullRecipe.ingredients);
    expect(full.instructions).toBe(fullRecipe.instructions);
    expect(full.notes).toBe(fullRecipe.notes);

    expect(bare.title).toBe('Żurek staropolski');
    expect(bare.prepTime).toBeNull();
    expect(bare.cookTime).toBeNull();
    expect(bare.servings).toBeNull();
    expect(bare.ingredients).toBe('');
    expect(bare.instructions).toBe('');
    expect(bare.notes).toBeNull();
  });

  it('survives an empty cookbook', async () => {
    (getRecipesByCookbook as jest.Mock).mockResolvedValue([]);

    const result = await exportAndReparse();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cookbookName).toBe('Polish Classics');
    expect(result.recipes).toEqual([]);
  });
});
