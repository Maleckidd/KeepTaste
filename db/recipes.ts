import { eq, isNull, desc, sql } from 'drizzle-orm';
import { db } from './client';
import {
  recipes,
  cookbooks,
  shoppingItems,
  shoppingLists,
  type Recipe,
  type NewRecipe,
} from './schema';
import { getCookbooks } from './cookbooks';
import { scheduleAutoBackup } from '../utils/backupTrigger';
import { noteUserEdit } from './userEdited';
import type { BackupSection } from '../utils/backupMarkdown';

// --- Recipes ---

export async function getAllRecipes(): Promise<Recipe[]> {
  return db.select().from(recipes).orderBy(desc(recipes.updatedAt));
}

export async function getRecipesByCookbook(cookbookId: number): Promise<Recipe[]> {
  return db
    .select()
    .from(recipes)
    .where(eq(recipes.cookbookId, cookbookId))
    .orderBy(desc(recipes.updatedAt));
}

export async function getUnassignedRecipes(): Promise<Recipe[]> {
  return db.select().from(recipes).where(isNull(recipes.cookbookId));
}

export async function getRecipeById(id: number): Promise<Recipe | undefined> {
  const result = await db.select().from(recipes).where(eq(recipes.id, id));
  return result[0];
}

/**
 * Newest data-change timestamp across recipes and cookbooks (ISO 8601), or null
 * when the library is empty. recipes.updated_at covers recipe creates and edits
 * (it equals created_at on insert), cookbooks.created_at covers cookbook adds.
 * Used by the launch-time staleness check (utils/backupAuto.ts isMirrorStale) to
 * re-arm an auto-backup the in-memory dirty flag lost to a crash (SPEC.md §5.17.3).
 */
export async function getLatestDataChangeAt(): Promise<string | null> {
  const [r] = await db
    .select({ m: sql<string | null>`max(${recipes.updatedAt})` })
    .from(recipes);
  const [c] = await db
    .select({ m: sql<string | null>`max(${cookbooks.createdAt})` })
    .from(cookbooks);
  const candidates = [r?.m, c?.m].filter((v): v is string => v != null);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a > b ? a : b));
}

/**
 * Assembles the full-app backup as ordered sections: one per cookbook (in
 * cookbook order) followed by the uncategorized bucket (cookbookName null).
 * The uncategorized section is always last; the builder drops it when empty.
 */
export async function getBackupSections(): Promise<BackupSection[]> {
  const cookbooks = await getCookbooks();
  const sections: BackupSection[] = [];

  for (const cookbook of cookbooks) {
    const cookbookRecipes = await getRecipesByCookbook(cookbook.id);
    sections.push({ cookbookName: cookbook.name, recipes: cookbookRecipes });
  }

  const unassigned = await getUnassignedRecipes();
  sections.push({ cookbookName: null, recipes: unassigned });

  return sections;
}

export async function createRecipe(data: NewRecipe): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .insert(recipes)
    .values({ ...data, createdAt: now, updatedAt: now })
    .returning({ id: recipes.id });
  noteUserEdit();
  scheduleAutoBackup();
  return result[0].id;
}

export async function updateRecipe(
  id: number,
  data: Partial<NewRecipe>
): Promise<void> {
  await db
    .update(recipes)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(recipes.id, id));
  noteUserEdit();
  scheduleAutoBackup();
}

/**
 * Clears the to-try flag and bumps updated_at to now (SPEC.md §5.19 / §4 — the
 * deliberate exception to the edit-only updated_at rule, so the recipe
 * graduates to the top of its cookbook). Backs both "Tried it" and the view
 * menu's "Unmark to try".
 */
export async function markRecipeTried(id: number): Promise<void> {
  await db
    .update(recipes)
    .set({ toTry: 0, updatedAt: new Date().toISOString() })
    .where(eq(recipes.id, id));
  noteUserEdit();
  scheduleAutoBackup();
}

/**
 * Sets the to-try flag WITHOUT touching updated_at (SPEC.md §5.19 / §4), so
 * marking a recipe from the view menu does not reorder it. Idempotent.
 */
export async function markRecipeToTry(id: number): Promise<void> {
  await db.update(recipes).set({ toTry: 1 }).where(eq(recipes.id, id));
  noteUserEdit();
  scheduleAutoBackup();
}

export async function deleteRecipe(id: number): Promise<void> {
  await db.delete(recipes).where(eq(recipes.id, id));
  noteUserEdit();
  scheduleAutoBackup();
}

/**
 * Deletes every recipe and cookbook (a full data reset). Collects the stored
 * image paths first so the caller can clean up files, then deletes recipes
 * before cookbooks. Returns all non-empty image paths (recipe images and
 * cookbook covers); empty tables yield an empty array.
 */
export async function deleteAllData(): Promise<string[]> {
  const recipeRows = await db
    .select({ imagePath: recipes.imagePath })
    .from(recipes);
  const cookbookRows = await db
    .select({ coverImagePath: cookbooks.coverImagePath })
    .from(cookbooks);

  await db.delete(recipes);
  await db.delete(cookbooks);
  // Shopping data goes too — "delete all data" means the whole app. Items
  // before lists so the FK never dangles even without CASCADE support.
  await db.delete(shoppingItems);
  await db.delete(shoppingLists);

  const paths = [
    ...recipeRows.map((r) => r.imagePath),
    ...cookbookRows.map((c) => c.coverImagePath),
  ];
  return paths.filter((p): p is string => Boolean(p));
}
