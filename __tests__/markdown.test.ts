// Retargeted: exportCookbookToMarkdown is being removed in favour of the pure
// buildBackupMarkdown builder (utils/backupMarkdown.ts). These tests cover the
// pure per-section formatting and the multi-cookbook / uncategorized layout.
import {
  buildBackupMarkdown,
  UNCATEGORIZED_HEADING,
  type BackupSection,
} from '../utils/backupMarkdown';

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

describe('buildBackupMarkdown', () => {
  it('emits each named section as a "# Name" heading with the §5.6 body', () => {
    const sections: BackupSection[] = [
      { cookbookName: 'Polish Classics', recipes: [recipe()] },
      { cookbookName: 'Desserts', recipes: [recipe({ title: 'Sernik' })] },
    ];
    const md = buildBackupMarkdown(sections);

    expect(md).toContain('# Polish Classics');
    expect(md).toContain('# Desserts');
    // §5.6 per-cookbook body markers
    expect(md).toContain('*Recipes: 1*');
    expect(md).toContain('## Pierogi Ruskie');
    expect(md).toContain('## Sernik');
    expect(md).toContain('**Servings:**');
    expect(md).toContain('### Ingredients');
    expect(md).toContain('### Instructions');
    expect(md).toContain('### Notes');
  });

  it('includes an *Exported:* line in DD/MM/YYYY shape per section', () => {
    const md = buildBackupMarkdown([
      { cookbookName: 'X', recipes: [recipe()] },
    ]);
    expect(md).toMatch(/\*Exported: \d{2}\/\d{2}\/\d{4}\*/);
  });

  it('emits the uncategorized section under the §Uncategorized sentinel heading', () => {
    const md = buildBackupMarkdown([
      { cookbookName: null, recipes: [recipe({ title: 'Loose recipe' })] },
    ]);
    expect(md).toContain(`# ${UNCATEGORIZED_HEADING}`);
    expect(md).toContain('## Loose recipe');
  });

  it('omits the uncategorized section entirely when it has no recipes', () => {
    const md = buildBackupMarkdown([
      { cookbookName: 'Mains', recipes: [recipe()] },
      { cookbookName: null, recipes: [] },
    ]);
    expect(md).toContain('# Mains');
    expect(md).not.toContain(UNCATEGORIZED_HEADING);
  });

  it('returns an empty string for an empty sections array', () => {
    expect(buildBackupMarkdown([]).trim()).toBe('');
  });

  it('does not include a Tags line', () => {
    const md = buildBackupMarkdown([
      { cookbookName: 'X', recipes: [recipe()] },
    ]);
    expect(md).not.toMatch(/Tags/i);
  });
});
