// Tests for the pure backup-archive serializer (SPEC.md §5.17.1).
// utils/backupArchive.ts must stay pure (no native imports) so it runs in
// plain ts-jest. These tests exercise the JSON build/parse round-trip and the
// schema-version guard.
import {
  BACKUP_SCHEMA_VERSION,
  archiveImageName,
  buildBackupJson,
  isSafeArchiveImagePath,
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
        toTry: 0,
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
        checkedAt: null,
        checked: 0,
        createdAt: '2026-01-06T00:00:00.000Z',
      },
    ],
    settings: [{ key: 'language', value: 'pl' }],
  };
}

describe('BACKUP_SCHEMA_VERSION', () => {
  it('is 2 after the to_try bump (§5.17.4 / §5.19)', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(2);
  });
});

describe('buildBackupJson', () => {
  it('stamps the current schema version', () => {
    const parsed = JSON.parse(buildBackupJson(sampleContent()));
    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('stamps version 2 concretely', () => {
    const parsed = JSON.parse(buildBackupJson(sampleContent()));
    expect(parsed.schemaVersion).toBe(2);
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

  it('accepts a version-1 archive whose recipes have no to_try field (§5.19)', () => {
    // Older archives predate the to_try column; they must still restore.
    const legacy = JSON.stringify({
      schemaVersion: 1,
      cookbooks: [
        { id: 1, name: 'Old', coverImagePath: null, createdAt: 'x' },
      ],
      recipes: [
        {
          id: 10,
          cookbookId: 1,
          title: 'Legacy',
          prepTime: null,
          cookTime: null,
          servings: null,
          imagePath: null,
          ingredients: '',
          instructions: '',
          notes: null,
          createdAt: 'x',
          updatedAt: 'x',
        },
      ],
      shoppingLists: [],
      shoppingItems: [],
      settings: [],
    });
    const result = parseBackupJson(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schemaVersion).toBe(1);
      expect(result.content.recipes[0].title).toBe('Legacy');
    }
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

// Security: backup.json image paths (SPEC.md §5.17.1, SECURITY.md). The
// restore copies `${extractedDir}${path}` into documentDirectory, so a crafted
// archive with `images/../…` could copy any file in the app sandbox (e.g. the
// SQLite database) into the documents folder. Only a flat file name under
// images/ is accepted; anything else restores as "no photo".
describe('image paths in backup.json', () => {
  const TRAVERSAL_OR_FOREIGN = [
    'images/../databases/recipes.db',
    '../databases/recipes.db',
    'images/../../shared_prefs/x.xml',
    'images/..',
    'images/.',
    'images/',
    'images/sub/dir.jpg',
    'images\\..\\recipes.db',
    'images/%2e%2e%2fdatabases%2frecipes.db',
    'images/a.jpg?x=../../y',
    'images/a.jpg#../../y',
    '/data/user/0/com.damianmalecki.keeptaste/databases/recipes.db',
    'file:///data/user/0/com.damianmalecki.keeptaste/databases/recipes.db',
    'content://media/external/images/media/1',
    'cover.jpg',
    'IMAGES/cover.jpg',
    ' images/cover.jpg',
    'images/cover.jpg\n',
  ];

  function withPaths(cover: unknown, photo: unknown): string {
    const content = sampleContent();
    const raw = JSON.parse(buildBackupJson(content));
    raw.cookbooks[0].coverImagePath = cover;
    raw.recipes[0].imagePath = photo;
    return JSON.stringify(raw);
  }

  it.each(TRAVERSAL_OR_FOREIGN)('drops %j from recipes and cookbook covers', (path) => {
    const result = parseBackupJson(withPaths(path, path));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.cookbooks[0].coverImagePath).toBeNull();
      expect(result.content.recipes[0].imagePath).toBeNull();
    }
  });

  it('keeps the rest of the archive when a path is dropped', () => {
    const result = parseBackupJson(withPaths('images/../x', 'images/../y'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.recipes[0].title).toBe('Tart');
      expect(result.content.cookbooks[0].name).toBe('Desserts');
      expect(result.content.shoppingItems).toHaveLength(1);
    }
  });

  it('drops a non-string path instead of passing it through', () => {
    const result = parseBackupJson(withPaths(42, { evil: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.cookbooks[0].coverImagePath).toBeNull();
      expect(result.content.recipes[0].imagePath).toBeNull();
    }
  });

  it.each([
    'images/img-1731900000000-123456789.jpg',
    'images/dup-2-img-1731900000000-1.jpeg',
    'images/cover.png',
    'images/a_b-c.d.heic',
  ])('keeps the app\'s own path %j', (path) => {
    const result = parseBackupJson(withPaths(path, path));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.cookbooks[0].coverImagePath).toBe(path);
      expect(result.content.recipes[0].imagePath).toBe(path);
    }
  });

  it('keeps null paths null', () => {
    const result = parseBackupJson(withPaths(null, null));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.cookbooks[0].coverImagePath).toBeNull();
      expect(result.content.recipes[0].imagePath).toBeNull();
    }
  });

  describe('isSafeArchiveImagePath', () => {
    it.each(TRAVERSAL_OR_FOREIGN)('rejects %j', (path) => {
      expect(isSafeArchiveImagePath(path)).toBe(false);
    });

    it('accepts a flat file name under images/', () => {
      expect(isSafeArchiveImagePath('images/img-1-2.jpg')).toBe(true);
    });
  });

  // Export side: the name written into the archive must always pass the
  // restore check, whatever the stored file is called (a picker fallback can
  // leave a content:// URI whose last segment holds %3A, spaces, etc.).
  describe('archiveImageName', () => {
    it.each([
      ['img-1731900000000-123456789.jpg', 'img-1731900000000-123456789.jpg'],
      ['IMG 2024 (1).jpg', 'IMG_2024__1_.jpg'],
      ['image%3A1234', 'image_3A1234'],
      ['zdjęcie.jpg', 'zdj_cie.jpg'],
      ['..', 'image'],
      ['.', 'image'],
      ['', 'image'],
    ])('%j → %j', (input, expected) => {
      expect(archiveImageName(input)).toBe(expected);
    });

    it.each(['..', '.', '', 'a/b', 'a\\b', '%2e%2e', 'x?y', 'x#y', 'IMG 1.jpg'])(
      'always yields a restorable path for %j',
      (input) => {
        expect(isSafeArchiveImagePath(`images/${archiveImageName(input)}`)).toBe(true);
      }
    );
  });
});
