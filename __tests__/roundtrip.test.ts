// Round-trip through the pure backup builder + parser. Unlike hand-mirrored
// fixtures, this breaks automatically if the backup export format and the
// parser ever drift apart. No native imports — both ends are pure.
import {
  buildBackupMarkdown,
  UNCATEGORIZED_HEADING,
  type BackupSection,
} from '../utils/backupMarkdown';
import { parseBackupMarkdown } from '../utils/importMarkdown';

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

function roundtrip(sections: BackupSection[]) {
  const md = buildBackupMarkdown(sections);
  return parseBackupMarkdown(md);
}

describe('backup build → parse round-trip', () => {
  it('preserves cookbook names, recipe titles and all fields', () => {
    const result = roundtrip([
      {
        cookbookName: 'Polish Classics',
        recipes: [fullRecipe as any, titleOnlyRecipe as any],
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].cookbookName).toBe('Polish Classics');

    const [full, bare] = result.sections[0].recipes;
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

  it('round-trips the uncategorized bucket as cookbookName null', () => {
    const result = roundtrip([
      { cookbookName: 'Mains', recipes: [fullRecipe as any] },
      { cookbookName: null, recipes: [titleOnlyRecipe as any] },
    ]);
    if (!result.ok) throw new Error('expected ok');

    const bucket = result.sections.find((s) => s.cookbookName === null);
    expect(bucket).toBeDefined();
    expect(bucket!.recipes.map((r) => r.title)).toEqual(['Żurek staropolski']);
  });

  it('a cookbook literally named "Uncategorized" round-trips as a normal cookbook', () => {
    const result = roundtrip([
      { cookbookName: 'Uncategorized', recipes: [fullRecipe as any] },
    ]);
    if (!result.ok) throw new Error('expected ok');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].cookbookName).toBe('Uncategorized');
    // Must NOT be folded into the null bucket.
    expect(result.sections[0].cookbookName).not.toBeNull();
    // Sanity: the sentinel and the literal name are distinct.
    expect('Uncategorized').not.toBe(UNCATEGORIZED_HEADING);
  });
});
