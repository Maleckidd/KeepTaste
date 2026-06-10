import { eq, desc } from 'drizzle-orm';
import { db } from './client';
import {
  shoppingLists,
  shoppingItems,
  type ShoppingList,
  type ShoppingItem,
} from './schema';
import { countItems } from '../utils/shoppingList';

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
  return result[0].id;
}

export async function deleteShoppingList(id: number): Promise<void> {
  await db.delete(shoppingLists).where(eq(shoppingLists.id, id));
}

export async function getItemsForList(listId: number): Promise<ShoppingItem[]> {
  const rows = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.listId, listId));
  // Order active (checked 0) before in-cart (checked 1), then by id.
  return [...rows].sort(
    (a, b) => a.checked - b.checked || a.id - b.id
  );
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
  return result[0].id;
}

export async function setItemChecked(
  id: number,
  checked: boolean
): Promise<void> {
  const rows = await db
    .select({ listId: shoppingItems.listId })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  const listId = rows[0]?.listId;
  const now = new Date().toISOString();
  await db
    .update(shoppingItems)
    .set({ checked: checked ? 1 : 0 })
    .where(eq(shoppingItems.id, id));
  if (listId != null) await touchList(listId, now);
}

export async function deleteShoppingItem(id: number): Promise<void> {
  const rows = await db
    .select({ listId: shoppingItems.listId })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, id));
  const listId = rows[0]?.listId;
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
  if (listId != null) await touchList(listId, new Date().toISOString());
}

async function touchList(listId: number, now: string): Promise<void> {
  await db
    .update(shoppingLists)
    .set({ updatedAt: now })
    .where(eq(shoppingLists.id, listId));
}
