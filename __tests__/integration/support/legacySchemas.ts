// The on-device schema as older app versions created it, copied verbatim from
// db/ddl.ts at the commits named below (`git show <sha>:db/ddl.ts`). A test
// builds one of these, stamps its PRAGMA user_version, inserts data the way
// that version would have, then lets today's db/client.ts migrate it.
//
// Never edit these to match the current schema: they are a record of what
// real installs on users' phones look like. A new schema version adds a new
// constant here (the DDL as it ships, before the next change).

const COOKBOOKS = `
  CREATE TABLE IF NOT EXISTS cookbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover_image_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`;

const RECIPES_WITHOUT_TO_TRY = `
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cookbook_id INTEGER REFERENCES cookbooks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    prep_time INTEGER,
    cook_time INTEGER,
    servings INTEGER,
    image_path TEXT,
    ingredients TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_recipes_cookbook_id ON recipes(cookbook_id);`;

const RECIPES_WITH_TO_TRY = `
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cookbook_id INTEGER REFERENCES cookbooks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    prep_time INTEGER,
    cook_time INTEGER,
    servings INTEGER,
    image_path TEXT,
    ingredients TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    notes TEXT DEFAULT '',
    to_try INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_recipes_cookbook_id ON recipes(cookbook_id);`;

const SHOPPING_WITHOUT_CHECKED_AT = `
  CREATE TABLE IF NOT EXISTS shopping_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_shopping_items_list_id ON shopping_items(list_id);`;

const APP_SETTINGS = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`;

export type LegacySchema = {
  /** Human label used in test names. */
  label: string;
  /** Commit whose db/ddl.ts this is. */
  commit: string;
  /** PRAGMA user_version such an install carries. */
  userVersion: number;
  ddl: string;
  /** Which later columns/tables this install lacks. */
  hasShopping: boolean;
  hasToTry: boolean;
};

export const LEGACY_SCHEMAS: LegacySchema[] = [
  {
    label: 'v0, initial release (cookbooks + recipes only)',
    commit: '874a292',
    userVersion: 0,
    ddl: COOKBOOKS + RECIPES_WITHOUT_TO_TRY,
    hasShopping: false,
    hasToTry: false,
  },
  {
    label: 'v0, before versioning (shopping lists + settings, no user_version)',
    commit: 'a453a47',
    userVersion: 0,
    ddl: COOKBOOKS + RECIPES_WITHOUT_TO_TRY + SHOPPING_WITHOUT_CHECKED_AT + APP_SETTINGS,
    hasShopping: true,
    hasToTry: false,
  },
  {
    label: 'v1, first versioned schema (.zip backup release)',
    commit: '7110ee1',
    userVersion: 1,
    ddl: COOKBOOKS + RECIPES_WITHOUT_TO_TRY + SHOPPING_WITHOUT_CHECKED_AT + APP_SETTINGS,
    hasShopping: true,
    hasToTry: false,
  },
  {
    label: 'v2, recipes.to_try',
    commit: '4e0743c',
    userVersion: 2,
    ddl: COOKBOOKS + RECIPES_WITH_TO_TRY + SHOPPING_WITHOUT_CHECKED_AT + APP_SETTINGS,
    hasShopping: true,
    hasToTry: true,
  },
];

/**
 * Tag tables from pre-release builds. The initial release already dropped
 * them (tags left the MVP, SPEC.md §7/§8); the DDL still carries the DROP.
 */
export const PRE_RELEASE_TAG_TABLES = `
  CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
  CREATE TABLE recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id)
  );`;
