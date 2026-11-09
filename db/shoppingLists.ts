import { eq, desc } from 'drizzle-orm';
import { db } from './client';
import {
  shoppingLists,
  shoppingItems,
  type ShoppingList,
  type ShoppingItem,
} from './schema';
import { countItems, sortShoppingItems } from '../utils/shoppingList';
import { noteUserEdit } from './userEdited';

export type ShoppingListWithCounts = ShoppingList & {
  totalCount: number;
  checkedCount: number;
};

export async function getShoppingLists(): Promise<ShoppingListWithCounts[]> {
  const lists = await db
    .select()
    .from(shoppingLists)
    .orderBy(desc(shoppingLists.updatedAt));
  const items = await db
    .select({ listId: shoppingItems.listId, checked: shoppingItems.checked })
    .from(shoppingItems);
  const counts = countItems(items);
  return lists.map((list) => {
    const entry = counts.get(list.id) ?? { totalCount: 0, checkedCount: 0 };
    return { ...list, totalCount: entry.totalCount, checkedCount: entry.checkedCount };
  });
}

export async function getShoppingListById(
  id: number
): Promise<ShoppingList | undefined> {
  const result = await db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.id, id));
  return result[0];
}

export async function createShoppingList(name: string): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .insert(shoppingLists)
    .values({ name, createdAt: now, updatedAt: now })
    .returning({ id: shoppingLists.id });
  noteUserEdit();
  return result[0].id;
}

export async function updateShoppingListName(
  id: number,
  name: string
): Promise<void> {
  await db
    .update(shoppingLists)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(shoppingLists.id, id));
  noteUserEdit();
}

export async function deleteShoppingList(id: number): Promise<void> {
  await db.delete(shoppingLists).where(eq(shoppingLists.id, id));
  noteUserEdit();
}

export async function getItemsForList(listId: number): Promise<ShoppingItem[]> {
  const rows = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.listId, listId));
  // Active first (newest added on top), then the cart (most recently checked
  // on top) — see sortShoppingItems.
  return sortShoppingItems(rows);
}

export async function createShoppingItem(
  listId: number,
  name: string,
  quantity: string | null
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .insert(shoppingItems)
    .values({ listId, name, quantity, checked: 0, createdAt: now })
    .returning({ id: shoppingItems.id });
  await touchList(listId, now);
  noteUserEdit();
  return result[0].id;
}

/**
 * Bulk insert for the recipe → shopping list bridge (SPEC §5.12): all items
 * are added unchecked with no quantity, and the list is touched once.
 */
export async function createShoppingItems(
  listId: number,
  names: string[]
): Promise<void> {
  if (names.length === 0) return;
  const now = new Date().toISOString();
  await db.insert(shoppingItems).values(
    names.map((name) => ({
      listId,
      name,
      quantity: null,
      checked: 0,
      createdAt: now,
    }))
  );
  await touchList(listId, now);
  noteUserEdit();
}

export async function updateShoppingItem(
  id: number,
  name: string,
  quantity: string | null
): Promise<void> {
  const rows = await db
    .select({ listId: shoppingItems.listId })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  const listId = rows[0]?.listId;
  await db
    .update(shoppingItems)
    .set({ name, quantity })
    .where(eq(shoppingItems.id, id));
  if (listId != null) await touchList(listId, new Date().toISOString());
  noteUserEdit();
}

/**
 * Checks or unchecks an item. `at` is the check-off time (defaults to now);
 * callers checking several items in one gesture pass one shared time, so the
 * batch keeps a stable order in the cart.
 */
export async function setItemChecked(
  id: number,
  checked: boolean,
  at: string = new Date().toISOString()
): Promise<void> {
  const rows = await db
    .select({ listId: shoppingItems.listId })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  const listId = rows[0]?.listId;
  const now = new Date().toISOString();
  await db
    .update(shoppingItems)
    .set({ checked: checked ? 1 : 0, checkedAt: checked ? at : null })
    .where(eq(shoppingItems.id, id));
  if (listId != null) await touchList(listId, now);
  noteUserEdit();
}

export async function deleteShoppingItem(id: number): Promise<void> {
  const rows = await db
    .select({ listId: shoppingItems.listId })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  const listId = rows[0]?.listId;
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
  if (listId != null) await touchList(listId, new Date().toISOString());
  noteUserEdit();
}

async function touchList(listId: number, now: string): Promise<void> {
  await db
    .update(shoppingLists)
    .set({ updatedAt: now })
    .where(eq(shoppingLists.id, listId));
}
