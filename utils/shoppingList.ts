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

/**
 * Normalized names (trim + toLowerCase, plain — no diacritic folding) that occur
 * 2+ times across the ENTIRE items array (active + in-cart together). Ignores
 * `checked`; counts names over the whole list. Returns lowercased keys. A name
 * being in this set is what keeps a lone remaining unchecked copy under a header.
 */
export function groupedNames<T extends { name: string }>(items: T[]): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result = new Set<string>();
  for (const [key, n] of counts) if (n >= 2) result.add(key);
  return result;
}

export type ActiveRow<T> =
  | { kind: 'groupHeader'; name: string; count: number; childIds: number[] }
  // isRepeat = rendered as a group child (indented/dimmed under the header).
  | { kind: 'item'; item: T; isRepeat: boolean };

/**
 * Builds the ordered ACTIVE-section render rows. `grouped` is the whole-list
 * grouped-name set from groupedNames(). For a name in `grouped`, at the slot of
 * its first occurrence emits one groupHeader (name = first copy's original
 * casing, count = number of active copies, childIds = their ids in render order)
 * followed by its child item rows — ALL flagged isRepeat (every child is
 * indented under the header, not just the 2nd+). Names NOT in `grouped` emit a
 * single plain item row (isRepeat false). Order preserved at first occurrence;
 * relative order within a group preserved. Does not mutate input.
 */
export function buildActiveRows<T extends { id: number; name: string }>(
  active: T[],
  grouped: Set<string>
): ActiveRow<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of active) {
    const key = item.name.trim().toLowerCase();
    const g = groups.get(key);
    if (g) g.push(item);
    else groups.set(key, [item]);
  }
  const rows: ActiveRow<T>[] = [];
  const seen = new Set<string>();
  for (const item of active) {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const members = groups.get(key)!;
    if (grouped.has(key)) {
      rows.push({
        kind: 'groupHeader',
        name: members[0].name,
        count: members.length,
        childIds: members.map((m) => m.id),
      });
      members.forEach((m) =>
        rows.push({ kind: 'item', item: m, isRepeat: true })
      );
    } else {
      members.forEach((m) => rows.push({ kind: 'item', item: m, isRepeat: false }));
    }
  }
  return rows;
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
