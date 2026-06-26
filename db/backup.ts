// Full-fidelity backup data layer (SPEC.md §5.17.1). Reads every table for the
// .zip archive and restores a parsed archive while preserving timestamps and
// remapping primary keys (autoincrement ids differ on restore). No transaction
// wrapper — consistent with the rest of db/; a mid-restore failure leaves a
// partial result.
import { db } from './client';
import {
  cookbooks,
  recipes,
  shoppingLists,
  shoppingItems,
  appSettings,
} from './schema';
import { setSetting } from './settings';
import type { BackupContent } from '../utils/backupArchive';

/** Gathers the whole library for export (every table, in id order). */
export async function getFullBackupData(): Promise<BackupContent> {
  const [cb, rec, lists, items, settings] = await Promise.all([
    db.select().from(cookbooks),
    db.select().from(recipes),
    db.select().from(shoppingLists),
    db.select().from(shoppingItems),
    db.select().from(appSettings),
  ]);
  return {
    cookbooks: cb,
    recipes: rec,
    shoppingLists: lists,
    shoppingItems: items,
    settings: settings.map((s) => ({ key: s.key, value: s.value })),
  };
}

/**
 * True when there is no user content (cookbooks, recipes, or shopping lists).
 * Used to decide whether a restore needs the Replace/Add prompt (§5.17.1): an
 * empty database restores silently because replace and append are identical.
 */
export async function isDatabaseEmpty(): Promise<boolean> {
  const [cb, rec, lists] = await Promise.all([
    db.select({ id: cookbooks.id }).from(cookbooks),
    db.select({ id: recipes.id }).from(recipes),
    db.select({ id: shoppingLists.id }).from(shoppingLists),
  ]);
  return cb.length === 0 && rec.length === 0 && lists.length === 0;
}

/**
 * Inserts a parsed backup, preserving created_at/updated_at and remapping
 * cookbook/list ids. Image paths must already be absolute device URIs (the
 * native wrapper restores the files first). Settings are upserted, except
 * device-specific backup_* keys (e.g. a SAF folder URI from another device).
 * Caller is responsible for wiping first when doing a Replace restore.
 */
export async function restoreFullBackup(content: BackupContent): Promise<void> {
  const cookbookIdMap = new Map<number, number>();
  for (const cb of content.cookbooks) {
    const [{ id }] = await db
      .insert(cookbooks)
      .values({
        name: cb.name,
        coverImagePath: cb.coverImagePath,
        createdAt: cb.createdAt,
      })
      .returning({ id: cookbooks.id });
    cookbookIdMap.set(cb.id, id);
  }

  for (const r of content.recipes) {
    const mappedCookbookId =
      r.cookbookId == null ? null : cookbookIdMap.get(r.cookbookId) ?? null;
    await db.insert(recipes).values({
      cookbookId: mappedCookbookId,
      title: r.title,
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      servings: r.servings,
      imagePath: r.imagePath,
      ingredients: r.ingredients,
      instructions: r.instructions,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  }

  const listIdMap = new Map<number, number>();
  for (const l of content.shoppingLists) {
    const [{ id }] = await db
      .insert(shoppingLists)
      .values({
        name: l.name,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })
      .returning({ id: shoppingLists.id });
    listIdMap.set(l.id, id);
  }

  for (const item of content.shoppingItems) {
    const mappedListId = listIdMap.get(item.listId);
    if (mappedListId == null) continue; // orphaned item — skip
    await db.insert(shoppingItems).values({
      listId: mappedListId,
      name: item.name,
      quantity: item.quantity,
      checked: item.checked,
      createdAt: item.createdAt,
    });
  }

  for (const s of content.settings) {
    if (s.key.startsWith('backup_')) continue; // device-specific, don't restore
    await setSetting(s.key, s.value);
  }
}
