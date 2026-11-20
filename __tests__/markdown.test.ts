// Retargeted: exportCookbookToMarkdown is being removed in favour of the pure
// buildBackupMarkdown builder (utils/backupMarkdown.ts). These tests cover the
// pure per-section formatting and the multi-cookbook / uncategorized layout.
import {
  buildBackupMarkdown,
  UNCATEGORIZED_HEADING,
  type BackupSection,
} from '../utils/backupMarkdown';
import { cookbookBodyToMarkdown, formatTime, recipeToMarkdown } from '../utils/markdown';

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

// ---------------------------------------------------------------------------
// §5.19 to-try status line. recipeToMarkdown must emit `**Status:** to try`
// only when recipe.toTry is truthy — directly below the metadata line when
// metadata exists, and in the metadata line's place when there is none. A
// tried recipe (toTry 0 / undefined) emits no Status line.
// ---------------------------------------------------------------------------
describe('recipeToMarkdown — to-try Status line (§5.19)', () => {
  it('emits "**Status:** to try" for a to-try recipe with metadata, right below the meta line', () => {
    const md = recipeToMarkdown(recipe({ toTry: 1 }));
    expect(md).toContain('**Status:** to try');

    // The meta line carries the Prep/Cook/Servings tokens; the Status line must
    // sit on the line directly after it (blank lines are collapsed away).
    const lines = md
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const metaIdx = lines.findIndex((l) => l.includes('**Servings:**'));
    const statusIdx = lines.findIndex((l) => l === '**Status:** to try');
    expect(metaIdx).toBeGreaterThanOrEqual(0);
    expect(statusIdx).toBe(metaIdx + 1);
  });

  it('emits the Status line in the meta line\'s place when the recipe has no metadata', () => {
    const md = recipeToMarkdown(
      recipe({ toTry: 1, prepTime: null, cookTime: null, servings: null }),
    );
    expect(md).toContain('**Status:** to try');
    expect(md).not.toContain('**Prep:**');
    expect(md).not.toContain('**Cook:**');
    expect(md).not.toContain('**Servings:**');

    // Status line comes before the first section (ingredients) and after the title.
    const lines = md
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const titleIdx = lines.findIndex((l) => l.startsWith('## '));
    const statusIdx = lines.findIndex((l) => l === '**Status:** to try');
    const ingIdx = lines.findIndex((l) => l === '### Ingredients');
    expect(statusIdx).toBeGreaterThan(titleIdx);
    expect(statusIdx).toBeLessThan(ingIdx);
  });

  it('emits no Status line for a tried recipe (toTry 0)', () => {
    const md = recipeToMarkdown(recipe({ toTry: 0 }));
    expect(md).not.toContain('Status');
    expect(md).not.toContain('to try');
  });

  it('emits no Status line when toTry is absent (undefined → falsy)', () => {
    const md = recipeToMarkdown(recipe());
    expect(md).not.toContain('Status');
  });
});

// Gaps found by mutation testing (docs/mutation-testing.md): the exact §5.6
// layout, separators included, not only which markers appear somewhere.
describe('formatTime', () => {
  it.each([
    [45, '45 min'],
    [59, '59 min'],
    [60, '1 hr'],
    [90, '1 hr 30 min'],
    [120, '2 hr'],
    [135, '2 hr 15 min'],
  ])('%p minutes → %p', (minutes, expected) => {
    expect(formatTime(minutes)).toBe(expected);
  });

  it.each([null, undefined, 0])('%p → "—"', (minutes) => {
    expect(formatTime(minutes)).toBe('—');
  });
});

describe('recipeToMarkdown — exact layout', () => {
  it('renders a full recipe block', () => {
    expect(recipeToMarkdown(recipe())).toBe(
      [
        '## Pierogi Ruskie',
        '',
        '**Prep:** 30 min | **Cook:** 20 min | **Servings:** 4',
        '',
        '',
        '### Ingredients',
        '',
        'flour',
        'potato',
        'cheese',
        '',
        '',
        '### Instructions',
        '',
        'Mix. Boil.',
        '',
        '',
        '### Notes',
        '',
        'Serve with sour cream.',
        '',
        '',
        '---',
        '',
      ].join('\n')
    );
  });

  it('joins only the metadata that exists, with no empty " | " slots', () => {
    const md = recipeToMarkdown(recipe({ prepTime: null, servings: null }));
    expect(md.split('\n')[2]).toBe('**Cook:** 20 min');
  });

  it('puts the Status line under the meta line, with no blank line between', () => {
    const md = recipeToMarkdown(recipe({ toTry: 1 }));
    expect(md.split('\n').slice(2, 5)).toEqual([
      '**Prep:** 30 min | **Cook:** 20 min | **Servings:** 4',
      '**Status:** to try',
      '',
    ]);
  });

  it('renders a title-only recipe with no section text at all', () => {
    const md = recipeToMarkdown(
      recipe({
        prepTime: null,
        cookTime: null,
        servings: null,
        ingredients: '',
        instructions: '',
        notes: '',
      })
    );
    expect(md).toBe('## Pierogi Ruskie\n\n\n\n\n\n---\n');
  });

  it('renders a Status-only meta block for a to-try recipe with no metadata', () => {
    const md = recipeToMarkdown(
      recipe({ prepTime: null, cookTime: null, servings: null, toTry: 1 })
    );
    expect(md.startsWith('## Pierogi Ruskie\n\n**Status:** to try\n\n\n### Ingredients')).toBe(
      true
    );
  });
});

describe('cookbookBodyToMarkdown / buildBackupMarkdown — exact layout', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-05T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const body = (titles: string[]) =>
    cookbookBodyToMarkdown(titles.map((title) => recipe({ title })));

  it('opens with the Exported / Recipes preamble and a separator', () => {
    expect(body([]).split('\n')).toEqual([
      '*Exported: 05/03/2026*',
      '*Recipes: 0*',
      '',
      '---',
      '',
    ]);
  });

  it('follows the preamble with each recipe block', () => {
    const r1 = recipe({ title: 'A' });
    expect(cookbookBodyToMarkdown([r1])).toBe(
      `*Exported: 05/03/2026*\n*Recipes: 1*\n\n---\n\n${recipeToMarkdown(r1)}`
    );
  });

  it('joins sections as "# Name", a blank line, then the body', () => {
    const md = buildBackupMarkdown([
      { cookbookName: 'One', recipes: [] },
      { cookbookName: 'Two', recipes: [] },
    ]);
    expect(md).toBe(`# One\n\n${body([])}\n# Two\n\n${body([])}`);
  });
});
