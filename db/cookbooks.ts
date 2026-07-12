import { eq } from 'drizzle-orm';
import { db } from './client';
import { cookbooks, recipes, type Cookbook, type NewCookbook } from './schema';
import { scheduleAutoBackup } from '../utils/backupTrigger';
import { noteUserEdit } from './userEdited';

export async function getCookbooks(): Promise<Cookbook[]> {
  return db.select().from(cookbooks).orderBy(cookbooks.createdAt);
}

export async function getCookbookById(id: number): Promise<Cookbook | undefined> {
  const result = await db.select().from(cookbooks).where(eq(cookbooks.id, id));
  return result[0];
}

export async function createCookbook(data: NewCookbook): Promise<number> {
  const result = await db.insert(cookbooks).values(data).returning({ id: cookbooks.id });
  noteUserEdit();
  scheduleAutoBackup();
  return result[0].id;
}

export async function updateCookbook(
  id: number,
  data: Partial<NewCookbook>
): Promise<void> {
  await db.update(cookbooks).set(data).where(eq(cookbooks.id, id));
  noteUserEdit();
  scheduleAutoBackup();
}

export async function deleteCookbook(id: number): Promise<void> {
  // Recipes in this cookbook get cookbook_id set to NULL (ON DELETE SET NULL)
  await db.delete(cookbooks).where(eq(cookbooks.id, id));
  noteUserEdit();
  scheduleAutoBackup();
}

export async function getRecipeCountForCookbook(cookbookId: number): Promise<number> {
  const result = await db
    .select()
    .from(recipes)
    .where(eq(recipes.cookbookId, cookbookId));
  return result.length;
}
