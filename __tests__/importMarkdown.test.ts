import { parseCookbookMarkdown, parseTimeToMinutes } from '../utils/importMarkdown';

// ---------------------------------------------------------------------------
// Fixture builder — mirrors utils/markdown.ts buildMarkdown / recipeToMarkdown
// by hand so the import parser is tested against the *real* export shape.
// ---------------------------------------------------------------------------

function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

type FixtureRecipe = {
  title: string;
  prepTime?: number | null;
  cookTime?: number | null;
  servings?: number | null;
  ingredients?: string;
  instructions?: string;
  notes?: string | null;
  toTry?: boolean;
};

function recipeToMarkdown(recipe: FixtureRecipe): string {
  const timeLines = [
    recipe.prepTime ? `**Prep:** ${formatTime(recipe.prepTime)}` : null,
    recipe.cookTime ? `**Cook:** ${formatTime(recipe.cookTime)}` : null,
    recipe.servings ? `**Servings:** ${recipe.servings}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  // §5.19: the Status line sits below the meta line (or in its place). When the
  // fixture has metadata we append the Status line to the same block so the
  // exported shape matches utils/markdown.ts.
  const statusLine = recipe.toTry ? `**Status:** to try` : '';
  const metaBlock = [timeLines, statusLine].filter(Boolean).join('\n');
  const metaLine = metaBlock ? `${metaBlock}\n\n` : '';
  const ingredientsSection = recipe.ingredients
    ? `### Ingredients\n\n${recipe.ingredients}\n\n`
    : '';
  const instructionsSection = recipe.instructions
    ? `### Instructions\n\n${recipe.instructions}\n\n`
    : '';
  const notesSection = recipe.notes
    ? `### Notes\n\n${recipe.notes}\n\n`
    : '';

  return [
    `## ${recipe.title}`,
    '',
    metaLine,
    ingredientsSection,
    instructionsSection,
    notesSection,
    '---',
    '',
  ].join('\n');
}

function buildExport(name: string, recipes: FixtureRecipe[], withInfo = true): string {
  const recipeSections = recipes.map(recipeToMarkdown);
  const head = [`# ${name}`, ''];
  if (withInfo) {
    head.push(`*Exported: 10/06/2026*`, `*Recipes: ${recipes.length}*`);
  }
  head.push('', '---', '');
  return [...head, ...recipeSections].join('\n');
}

// ---------------------------------------------------------------------------

describe('parseTimeToMinutes', () => {
  it.each([
    ['45 min', 45],
    ['5 min', 5],
    ['1 hr 30 min', 90],
    ['2 hr', 120],
    ['1 hr', 60],
    ['1 hr 5 min', 65],
    [' 45 min ', 45],
  ])('parses %p -> %p', (input, expected) => {
    expect(parseTimeToMinutes(input)).toBe(expected);
  });

  it.each([['', '(empty)'], ['soon', 'word'], ['-', 'dash']])(
    'returns null for unparseable %p (%s)',
    (input) => {
      expect(parseTimeToMinutes(input)).toBeNull();
    },
  );
});

describe('parseCookbookMarkdown', () => {
  describe('success — full round-trip', () => {
    const recipes: FixtureRecipe[] = [
      {
        title: 'Tomato Soup',
        prepTime: 15,
        cookTime: 45,
        servings: 4,
        ingredients: '- 1 kg tomatoes\n- 2 onions',
        instructions: '1. Chop\n2. Simmer',
        notes: 'Best with bread.',
      },
      {
        title: 'Pancakes',
        prepTime: 10,
        cookTime: 20,
        servings: 2,
        ingredients: '- flour\n- milk',
        instructions: 'Mix and fry.',
      },
    ];
    const content = buildExport('Weeknight Dinners', recipes);

    it('reports ok and the trimmed cookbook name from the # line', () => {
      const result = parseCookbookMarkdown(content);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.cookbookName).toBe('Weeknight Dinners');
    });

    it('returns recipes in file order with correct count', () => {
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes.map((r) => r.title)).toEqual(['Tomato Soup', 'Pancakes']);
    });

    it('round-trips all fields of the first recipe', () => {
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0]).toEqual({
        title: 'Tomato Soup',
        prepTime: 15,
        cookTime: 45,
        servings: 4,
        ingredients: '- 1 kg tomatoes\n- 2 onions',
        instructions: '1. Chop\n2. Simmer',
        notes: 'Best with bread.',
        toTry: false,
      });
    });

    it('round-trips a recipe without notes (notes null)', () => {
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[1]).toEqual({
        title: 'Pancakes',
        prepTime: 10,
        cookTime: 20,
        servings: 2,
        ingredients: '- flour\n- milk',
        instructions: 'Mix and fry.',
        notes: null,
        toTry: false,
      });
    });
  });

  describe('metadata line parsing', () => {
    it('parses a full meta line into integers', () => {
      const content = buildExport('CB', [
        { title: 'R', prepTime: 90, cookTime: 120, servings: 6 },
      ]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0]).toMatchObject({
        prepTime: 90,
        cookTime: 120,
        servings: 6,
      });
    });

    it('a partial meta line (only Cook) leaves the others null', () => {
      const content = buildExport('CB', [{ title: 'R', cookTime: 30 }]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0]).toMatchObject({
        prepTime: null,
        cookTime: 30,
        servings: null,
      });
    });

    it('no meta line at all leaves all three null', () => {
      const content = buildExport('CB', [
        { title: 'R', ingredients: '- a', instructions: 'do it' },
      ]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0]).toMatchObject({
        prepTime: null,
        cookTime: null,
        servings: null,
      });
    });
  });

  describe('to-try Status line parsing (§5.19)', () => {
    it('a recipe with no Status line parses toTry false', () => {
      const content = buildExport('CB', [{ title: 'Tried', instructions: 'go' }]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].toTry).toBe(false);
    });

    it('a "**Status:** to try" line sets toTry true (with metadata present)', () => {
      const content = buildExport('CB', [
        { title: 'ToTry', prepTime: 10, instructions: 'go', toTry: true },
      ]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].toTry).toBe(true);
      // The other fields still parse normally.
      expect(result.recipes[0].prepTime).toBe(10);
    });

    it('a "**Status:** to try" line sets toTry true when there is no metadata', () => {
      const content = buildExport('CB', [
        { title: 'ToTry', instructions: 'go', toTry: true },
      ]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].toTry).toBe(true);
    });

    it('an unrecognized "**Status:** something-else" value → toTry false', () => {
      const content = [
        '# CB',
        '',
        '---',
        '',
        '## R',
        '',
        '**Status:** something-else',
        '',
        '### Instructions',
        '',
        'go',
        '',
        '---',
        '',
      ].join('\n');
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].toTry).toBe(false);
    });
  });

  describe('notes section semantics', () => {
    it('absent ### Notes -> notes is null', () => {
      const content = buildExport('CB', [{ title: 'R', instructions: 'go' }]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].notes).toBeNull();
    });

    it('present ### Notes with body -> body captured', () => {
      const content = buildExport('CB', [{ title: 'R', notes: 'Chill overnight.' }]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].notes).toBe('Chill overnight.');
    });

    it("present ### Notes header with empty body -> '' not null", () => {
      // buildExport omits empty notes, so craft the header-with-empty-body case by hand.
      const content = [
        '# CB',
        '',
        '---',
        '',
        '## R',
        '',
        '### Notes',
        '',
        '---',
        '',
      ].join('\n');
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].notes).toBe('');
    });
  });

  describe('absent ingredients / instructions default to empty string', () => {
    it("title-only recipe -> ingredients '' and instructions ''", () => {
      const content = buildExport('CB', [{ title: 'Bare' }]);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0]).toEqual({
        title: 'Bare',
        prepTime: null,
        cookTime: null,
        servings: null,
        ingredients: '',
        instructions: '',
        notes: null,
        toTry: false,
      });
    });
  });

  describe('multi-line bodies preserve internal markdown', () => {
    const richBody =
      '**bold** intro\n- bullet one\n- bullet two\n#Cream layer\nmore text';
    const content = buildExport('CB', [
      { title: 'Rich', ingredients: richBody, instructions: 'step' },
    ]);

    it('keeps bold, bullets and internal single-# heading lines, trims trailing blanks', () => {
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes[0].ingredients).toBe(richBody);
    });
  });

  describe('whitespace / CRLF / phantom-recipe robustness', () => {
    const recipes: FixtureRecipe[] = [
      { title: 'A', instructions: 'do a' },
      { title: 'B', instructions: 'do b' },
    ];

    it('CRLF content parses identically to LF', () => {
      const lf = buildExport('CB', recipes);
      const crlf = lf.replace(/\n/g, '\r\n');
      expect(parseCookbookMarkdown(crlf)).toEqual(parseCookbookMarkdown(lf));
    });

    it('trailing --- and trailing whitespace produce no phantom empty recipe', () => {
      const content = buildExport('CB', recipes) + '\n---\n\n   \n';
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes).toHaveLength(2);
      expect(result.recipes.map((r) => r.title)).toEqual(['A', 'B']);
    });
  });

  describe('informational lines are optional and N is not trusted', () => {
    it('parses a file without *Exported:* / *Recipes:* lines', () => {
      const content = buildExport('CB', [{ title: 'Only' }], /* withInfo */ false);
      const result = parseCookbookMarkdown(content);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes.map((r) => r.title)).toEqual(['Only']);
    });

    it('count comes from actual blocks, ignoring a lying *Recipes: N*', () => {
      // Header claims 99 recipes but there is only one real block.
      const real = buildExport('CB', [{ title: 'Real' }]).replace(
        /\*Recipes: \d+\*/,
        '*Recipes: 99*',
      );
      const result = parseCookbookMarkdown(real);
      if (!result.ok) throw new Error('expected ok');
      expect(result.recipes).toHaveLength(1);
    });
  });

  describe('header with zero recipes', () => {
    it('returns ok with an empty recipe list', () => {
      const content = buildExport('Empty Book', []);
      const result = parseCookbookMarkdown(content);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.recipes).toEqual([]);
      expect(result.cookbookName).toBe('Empty Book');
    });
  });

  describe('error cases', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   \n\t  \n'],
      ['no # cookbook heading', '## Orphan recipe\n\ninstructions here\n\n---\n'],
    ])('returns ok:false with a non-empty error for %s', (_label, content) => {
      const result = parseCookbookMarkdown(content);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    });
  });
});

// Gaps found by mutation testing (docs/mutation-testing.md): hand-edited
// files (spacing, stray text), which the exporter itself never writes.
describe('parseTimeToMinutes — spacing and anchoring', () => {
  it.each([
    ['12 hr', 720],
    ['1hr', 60],
    ['1 hr 5min', 65],
    ['1 hr  30 min', 90],
    ['45min', 45],
  ])('parses %p -> %p', (input, expected) => {
    expect(parseTimeToMinutes(input)).toBe(expected);
  });

  it.each(['about 1 hr', '1 hr or so', 'about 45 min', '45 min or so'])(
    'returns null for %p (text around the time)',
    (input) => {
      expect(parseTimeToMinutes(input)).toBeNull();
    }
  );
});

describe('parseCookbookMarkdown — hand-edited files', () => {
  const book = (...body: string[]) => ['# Book', '', ...body].join('\n');
  const only = (content: string) => {
    const result = parseCookbookMarkdown(content);
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  it('trims trailing spaces from the cookbook name and the recipe title', () => {
    const result = only('# Book  \n\n## Soup  \n---\n');
    expect(result.cookbookName).toBe('Book');
    expect(result.recipes[0].title).toBe('Soup');
  });

  it('reads meta tokens written without a space after the label', () => {
    const [r] = only(
      book('## Soup', '', '**Prep:**10 min | **Cook:**1 hr | **Servings:**12', '**Status:**to try ', '---')
    ).recipes;
    expect(r).toMatchObject({ prepTime: 10, cookTime: 60, servings: 12, toTry: true });
  });

  it('ignores meta labels that do not start their token', () => {
    const [r] = only(
      book('## Soup', '', 'about **Prep:** 10 min | x **Cook:** 5 min | x **Servings:** 4', 'x **Status:** to try', '---')
    ).recipes;
    expect(r).toMatchObject({ prepTime: null, cookTime: null, servings: null, toTry: false });
  });

  it('drops whitespace-only lines around a section body', () => {
    const [r] = only(book('## Soup', '', '### Notes', '', '   ', 'Salt.', '  ', '---')).recipes;
    expect(r.notes).toBe('Salt.');
  });

  it('keeps sections apart when they come in an unusual order', () => {
    const [r] = only(
      book('## Soup', '', '### Notes', '', 'n', '', '### Ingredients', '', 'i', '---')
    ).recipes;
    expect(r.notes).toBe('n');
    expect(r.ingredients).toBe('i');
  });

  it('closes a recipe on a "---" line with trailing spaces, ignoring text after it', () => {
    const result = only(book('## Soup', '', '### Notes', '', 'n', '---  ', 'stray text'));
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].notes).toBe('n');
  });

  it('takes the heading only from a line that starts with "# "', () => {
    expect(only('Intro # not this\n# Book\n').cookbookName).toBe('Book');
  });

  it('reports whitespace-only content as an empty file', () => {
    expect(parseCookbookMarkdown('  \n \n')).toEqual({
      ok: false,
      error: 'The file is empty.',
    });
  });
});
