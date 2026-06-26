// TDD red phase for the pure backup-archive serializer (SPEC.md §5.17.1).
// utils/backupArchive.ts must stay pure (no native imports) so it runs in
// plain ts-jest. These tests exercise the JSON build/parse round-trip and the
// schema-version guard.
import {
  BACKUP_SCHEMA_VERSION,
  buildBackupJson,
  parseBackupJson,
  type BackupContent,
} from '../utils/backupArchive';

function sampleContent(): BackupContent {
  return {
    cookbooks: [
      {
        id: 1,
        name: 'Desserts',
        coverImagePath: 'images/cover.jpg',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    recipes: [
      {
        id: 10,
        cookbookId: 1,
        title: 'Tart',
        prepTime: 15,
        cookTime: 45,
        servings: 4,
        imagePath: 'images/tart.jpg',
        ingredients: 'flour',
        instructions: 'bake',
        notes: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ],
    shoppingLists: [
      {
        id: 5,
        name: 'Groceries',
        createdAt: '2026-01-04T00:00:00.000Z',
        updatedAt: '2026-01-05T00:00:00.000Z',
      },
    ],
    shoppingItems: [
      {
        id: 7,
        listId: 5,
        name: 'Milk',
        quantity: null,
        checked: 0,
        createdAt: '2026-01-06T00:00:00.000Z',
      },
    ],
    settings: [{ key: 'language', value: 'pl' }],
  };
}

describe('buildBackupJson', () => {
  it('stamps the current schema version', () => {
    const parsed = JSON.parse(buildBackupJson(sampleContent()));
    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('produces valid JSON that preserves every section', () => {
    const parsed = JSON.parse(buildBackupJson(sampleContent()));
    expect(parsed.cookbooks).toHaveLength(1);
    expect(parsed.recipes[0].title).toBe('Tart');
    expect(parsed.recipes[0].createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(parsed.shoppingItems[0].name).toBe('Milk');
    expect(parsed.settings[0]).toEqual({ key: 'language', value: 'pl' });
  });
});

describe('parseBackupJson', () => {
  it('round-trips content built by buildBackupJson', () => {
    const result = parseBackupJson(buildBackupJson(sampleContent()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      expect(result.content).toEqual(sampleContent());
    }
  });

  it('rejects non-JSON text', () => {
    const result = parseBackupJson('not json {');
    expect(result.ok).toBe(false);
  });

  it('rejects JSON without a numeric schemaVersion', () => {
    const result = parseBackupJson(JSON.stringify({ recipes: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a backup from a newer schema version', () => {
    const future = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      cookbooks: [],
      recipes: [],
    });
    const result = parseBackupJson(future);
    expect(result.ok).toBe(false);
  });

  it('rejects a recipe row missing its required title (would wipe-then-fail)', () => {
    const corrupt = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      cookbooks: [],
      recipes: [{ id: 1, ingredients: 'x', instructions: 'y' }],
    });
    const result = parseBackupJson(corrupt);
    expect(result.ok).toBe(false);
  });

  it('rejects a cookbook row missing its required name', () => {
    const corrupt = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      cookbooks: [{ id: 1 }],
      recipes: [],
    });
    expect(parseBackupJson(corrupt).ok).toBe(false);
  });

  it('rejects a shopping item missing its list reference', () => {
    const corrupt = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      cookbooks: [],
      recipes: [],
      shoppingLists: [{ id: 1, name: 'L', createdAt: 'x', updatedAt: 'y' }],
      shoppingItems: [{ id: 1, name: 'Milk', checked: 0, createdAt: 'z' }],
    });
    expect(parseBackupJson(corrupt).ok).toBe(false);
  });

  it('defaults missing optional sections to empty arrays', () => {
    const minimal = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      recipes: [],
      cookbooks: [],
    });
    const result = parseBackupJson(minimal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.shoppingLists).toEqual([]);
      expect(result.content.shoppingItems).toEqual([]);
      expect(result.content.settings).toEqual([]);
    }
  });
});
