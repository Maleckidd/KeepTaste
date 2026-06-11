// Pure helpers for the Shopping lists feature (SPEC.md §5.10).
// No native imports, no DB access.

export interface ItemInput {
  name: string;
  quantity: string;
}

export interface NormalizedItem {
  name: string;
  quantity: string | null;
}

/** Trims the name; turns an empty/whitespace quantity into null, else trims it. */
export function normalizeItemInput(input: ItemInput): NormalizedItem {
  const quantity = input.quantity.trim();
  return {
    name: input.name.trim(),
    quantity: quantity === '' ? null : quantity,
  };
}

/** True when the name has non-whitespace content. */
export function validateItemName(name: string): boolean {
  return name.trim() !== '';
}

/** Splits items into active (checked 0) and inCart (checked 1), preserving order. */
export function partitionItems<T extends { checked: number }>(
  items: T[]
): { active: T[]; inCart: T[] } {
  const active: T[] = [];
  const inCart: T[] = [];
  for (const item of items) {
    if (item.checked) {
      inCart.push(item);
    } else {
      active.push(item);
    }
  }
  return { active, inCart };
}

/** "{checked}/{total} in cart", or null for an empty list. */
export function progressLabel(counts: {
  totalCount: number;
  checkedCount: number;
}): string | null {
  if (counts.totalCount === 0) return null;
  return `${counts.checkedCount}/${counts.totalCount} in cart`;
}

/**
 * Returns the counts for rendering a localized cart-progress label, or null
 * for an empty list. Pairs with t('shopping.inCart', counts) at the call site.
 */
export function progressCounts(counts: {
  totalCount: number;
  checkedCount: number;
}): { checkedCount: number; totalCount: number } | null {
  if (counts.totalCount === 0) return null;
  return { checkedCount: counts.checkedCount, totalCount: counts.totalCount };
}

/** Aggregates per-list totals and checked counts. Lists with no items are absent. */
export function countItems(
  items: { listId: number; checked: number }[]
): Map<number, { totalCount: number; checkedCount: number }> {
  const map = new Map<number, { totalCount: number; checkedCount: number }>();
  for (const item of items) {
    const entry = map.get(item.listId) ?? { totalCount: 0, checkedCount: 0 };
    entry.totalCount += 1;
    if (item.checked) entry.checkedCount += 1;
    map.set(item.listId, entry);
  }
  return map;
}
