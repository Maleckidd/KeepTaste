import { eq, isNull, desc } from 'drizzle-orm';
import { db } from './client';
import {
  recipes,
  cookbooks,
  shoppingItems,
  shoppingLists,
  type Recipe,
  type NewRecipe,
} from './schema';
import { filterRecipesByTitle } from '../utils/search';
import { getCookbooks } from './cookbooks';
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

export async function searchRecipes(query: string): Promise<Recipe[]> {
  const all = await getAllRecipes();
  return filterRecipesByTitle(all, query);
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
}

export async function deleteRecipe(id: number): Promise<void> {
  await db.delete(recipes).where(eq(recipes.id, id));
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
