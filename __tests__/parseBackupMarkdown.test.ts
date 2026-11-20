// Tests for the multi-cookbook backup parser (utils/importMarkdown.ts
// extension). A backup file is a sequence of "# Name" sections, each holding
// the §5.6 per-cookbook body. The "# §Uncategorized" sentinel section maps to a
// section with cookbookName null. A legacy single-cookbook export is just a
// one-section backup.
import { parseBackupMarkdown } from '../utils/importMarkdown';
import { UNCATEGORIZED_HEADING } from '../utils/backupMarkdown';

function recipeBlock(title: string, body = ''): string {
  return [`## ${title}`, '', body, '---', ''].join('\n');
}

function section(name: string, recipeTitles: string[]): string {
  const head = [`# ${name}`, '', '*Exported: 10/06/2026*', `*Recipes: ${recipeTitles.length}*`, '', '---', ''];
  return [...head, ...recipeTitles.map((t) => recipeBlock(t))].join('\n');
}

describe('parseBackupMarkdown', () => {
  it('splits a multi-cookbook file into named sections with their recipes', () => {
    const content = [
      section('Polish Classics', ['Pierogi', 'Żurek']),
      section('Desserts', ['Sernik']),
    ].join('\n');

    const result = parseBackupMarkdown(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.sections.map((s) => s.cookbookName)).toEqual([
      'Polish Classics',
      'Desserts',
    ]);
    expect(result.sections[0].recipes.map((r) => r.title)).toEqual([
      'Pierogi',
      'Żurek',
    ]);
    expect(result.sections[1].recipes.map((r) => r.title)).toEqual(['Sernik']);
  });

  it('maps the §Uncategorized sentinel heading to cookbookName null', () => {
    const content = [
      section('Mains', ['Soup']),
      section(UNCATEGORIZED_HEADING, ['Loose recipe']),
    ].join('\n');

    const result = parseBackupMarkdown(content);
    if (!result.ok) throw new Error('expected ok');

    const uncategorized = result.sections.find((s) => s.cookbookName === null);
    expect(uncategorized).toBeDefined();
    expect(uncategorized!.recipes.map((r) => r.title)).toEqual(['Loose recipe']);
  });

  it('a cookbook literally named "Uncategorized" (no §) stays a normal section', () => {
    const content = section('Uncategorized', ['R']);
    const result = parseBackupMarkdown(content);
    if (!result.ok) throw new Error('expected ok');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].cookbookName).toBe('Uncategorized');
  });

  it('parses a legacy single-cookbook export as one section', () => {
    const content = section('Weeknight Dinners', ['Tomato Soup', 'Pancakes']);
    const result = parseBackupMarkdown(content);
    if (!result.ok) throw new Error('expected ok');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].cookbookName).toBe('Weeknight Dinners');
    expect(result.sections[0].recipes).toHaveLength(2);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n\t  \n'],
    ['no # heading', '## Orphan\n\nbody\n\n---\n'],
  ])('returns ok:false with an error for %s', (_label, content) => {
    const result = parseBackupMarkdown(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });
});

// Gaps found by mutation testing (docs/mutation-testing.md).
describe('parseBackupMarkdown — hand-edited files', () => {
  it('reports whitespace-only content as an empty file', () => {
    expect(parseBackupMarkdown('  \n \n')).toEqual({
      ok: false,
      error: 'The file is empty.',
    });
  });

  it('normalizes CRLF line endings', () => {
    const lf = [section('One', ['A']), section('Two', ['B'])].join('\n');
    expect(parseBackupMarkdown(lf.replace(/\n/g, '\r\n'))).toEqual(parseBackupMarkdown(lf));
  });

  it('trims trailing spaces from a section name', () => {
    const result = parseBackupMarkdown('# Desserts  \n\n## Sernik\n---\n');
    if (!result.ok) throw new Error(result.error);
    expect(result.sections[0].cookbookName).toBe('Desserts');
  });

  it('closes a recipe on a "---" line with trailing spaces, so the next "# " starts a section', () => {
    const result = parseBackupMarkdown('# One\n\n## A\n---  \n# Two\n\n## B\n---\n');
    if (!result.ok) throw new Error(result.error);
    expect(result.sections.map((s) => s.cookbookName)).toEqual(['One', 'Two']);
    expect(result.sections[0].recipes.map((r) => r.title)).toEqual(['A']);
  });

  it('does not attach text after a recipe\'s closing "---" to that recipe', () => {
    const result = parseBackupMarkdown('# One\n\n## A\n### Notes\n\nn\n---\nstray text\n');
    if (!result.ok) throw new Error(result.error);
    expect(result.sections[0].recipes[0].notes).toBe('n');
  });

  it('does not start a section on a line with " # " in the middle', () => {
    const result = parseBackupMarkdown('# One\n\n## A\n---\nnote # aside\n');
    if (!result.ok) throw new Error(result.error);
    expect(result.sections.map((s) => s.cookbookName)).toEqual(['One']);
  });
});

describe('parseBackupMarkdown — recipe end marker inside a section', () => {
  it('closes a recipe on a "---" line with trailing spaces, ignoring text after it', () => {
    const result = parseBackupMarkdown('# One\n\n## A\n### Notes\n\nn\n---  \nstray text\n');
    if (!result.ok) throw new Error(result.error);
    expect(result.sections[0].recipes[0].notes).toBe('n');
  });
});
