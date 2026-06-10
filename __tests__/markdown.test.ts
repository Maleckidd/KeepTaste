import * as FileSystem from 'expo-file-system';

// db/recipes touches the native DB layer; stub it so the export is pure.
jest.mock('../db/recipes', () => ({
  getRecipesByCookbook: jest.fn(),
}));
jest.mock('../db/client', () => ({ db: {}, runMigrations: jest.fn() }));

import { exportCookbookToMarkdown } from '../utils/markdown';
import { getRecipesByCookbook } from '../db/recipes';

const sampleRecipe = {
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
};

const sampleCookbook = {
  id: 1,
  name: 'Polish Classics',
  coverImagePath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function getWrittenContent(): string {
  const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;
  expect(mockWrite).toHaveBeenCalled();
  // writeAsStringAsync(filePath, content, options)
  return mockWrite.mock.calls[0][1] as string;
}

describe('exportCookbookToMarkdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRecipesByCookbook as jest.Mock).mockResolvedValue([sampleRecipe]);
  });

  it('includes the recipe title and metadata', async () => {
    await exportCookbookToMarkdown(sampleCookbook as any);
    const content = getWrittenContent();
    expect(content).toContain('Pierogi Ruskie');
    expect(content).toContain('Servings:');
  });

  it('does NOT include a Tags line or the word "Tags"', async () => {
    await exportCookbookToMarkdown(sampleCookbook as any);
    const content = getWrittenContent();
    expect(content).not.toContain('**Tags:**');
    expect(content).not.toMatch(/Tags/i);
  });
});
