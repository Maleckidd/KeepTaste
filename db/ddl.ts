// Hand-written migration DDL, shared by the native client (db/client.ts)
// and the web test client (db/client.web.ts). Any schema change requires
// editing both db/schema.ts and this DDL (plus ALTER TABLE for existing
// installs) — see CLAUDE.md.
export const MIGRATION_DDL = `
  CREATE TABLE IF NOT EXISTS cookbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover_image_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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

  CREATE INDEX IF NOT EXISTS idx_recipes_cookbook_id ON recipes(cookbook_id);

  -- Tags were removed from the MVP (SPEC.md §7/§8); drop legacy tables.
  -- Junction table first because of the FK reference into tags.
  DROP TABLE IF EXISTS recipe_tags;
  DROP TABLE IF EXISTS tags;
`;
