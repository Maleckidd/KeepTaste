// Pure HTML builder for the cookbook-to-PDF export. Verifies structure,
// localized labels, omission of missing metadata, and HTML escaping.
import { buildCookbookHtml } from '../utils/cookbookPdfHtml';
import { createTranslator } from '../utils/i18n';

const en = createTranslator('en');
const pl = createTranslator('pl');

const cookbook: any = {
  id: 1,
  name: 'Polish Classics',
  coverImagePath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function recipe(over: Partial<any> = {}): any {
  return {
    id: 1,
    cookbookId: 1,
    title: 'Pierogi Ruskie',
    prepTime: 30,
    cookTime: 20,
    servings: 4,
    imagePath: null,
    ingredients: 'flour\npotato',
    instructions: 'Mix. Boil.',
    notes: 'Serve with sour cream.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  };
}

describe('buildCookbookHtml', () => {
  it('contains the cookbook name and a per-recipe heading', () => {
    const html = buildCookbookHtml(cookbook, [recipe()], en);
    expect(html).toContain('Polish Classics');
    expect(html).toContain('Pierogi Ruskie');
    // Should look like HTML.
    expect(html).toMatch(/<html/i);
  });

  it('uses localized labels — EN vs PL differ', () => {
    const enHtml = buildCookbookHtml(cookbook, [recipe()], en);
    const plHtml = buildCookbookHtml(cookbook, [recipe()], pl);
    expect(enHtml).toContain('Ingredients');
    expect(plHtml).toContain('Składniki');
    expect(enHtml).not.toBe(plHtml);
  });

  it('omits sections / metadata that are missing — no dash placeholders', () => {
    const html = buildCookbookHtml(
      cookbook,
      [
        recipe({
          prepTime: null,
          cookTime: null,
          servings: null,
          ingredients: '',
          instructions: '',
          notes: null,
        }),
      ],
      en,
    );
    expect(html).toContain('Pierogi Ruskie');
    expect(html).not.toContain('—');
    expect(html).not.toContain('Ingredients');
    expect(html).not.toContain('Notes');
  });

  it('HTML-escapes < and & from recipe content', () => {
    const html = buildCookbookHtml(
      cookbook,
      [recipe({ title: 'Mac & Cheese', ingredients: 'use <b>flour</b> & water' })],
      en,
    );
    expect(html).toContain('Mac &amp; Cheese');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp; water');
    // The raw injected tag must not appear unescaped in the body.
    expect(html).not.toContain('<b>flour</b>');
  });
});
