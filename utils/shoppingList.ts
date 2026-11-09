// Pure helpers for the Shopping lists feature (SPEC.md §5.10).
// No native imports, no DB access.

import { parseIngredients } from './ingredients';

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

/**
 * List order (SPEC.md §5.10): active items first, newest added on top, so a
 * just-added product is above the fold; then the "In cart" section, most
 * recently checked on top, so a just-checked product leads the cart. In-cart
 * items without a check-off time (checked before it was recorded) come after
 * the timed ones. Ties fall back to newest added. Returns a new array.
 */
export function sortShoppingItems<
  T extends { id: number; checked: number; checkedAt: string | null }
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked - b.checked;
    if (a.checked) {
      const at = a.checkedAt ?? '';
      const bt = b.checkedAt ?? '';
      if (at !== bt) return at < bt ? 1 : -1;
    }
    return b.id - a.id;
  });
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
 * 2+ times in the given items. Ignores `checked`; returns lowercased keys.
 * Callers pass the ACTIVE items: in-cart copies don't count towards a group
 * header (SPEC.md §5.10).
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
 * Builds the ordered ACTIVE-section render rows. `grouped` is the grouped-name
 * set from groupedNames() (callers pass the active items). For a name in
 * `grouped` with 2+ ACTIVE copies, at the slot of its first occurrence emits one
 * groupHeader (name = first copy's original casing, count = number of active
 * copies, childIds = their ids in render order) followed by its child item rows
 * — ALL flagged isRepeat (every child is indented under the header, not just
 * the 2nd+). Any other name — including a lone active copy whose name is in
 * `grouped` — emits plain item rows (isRepeat false). Order preserved at first
 * occurrence; relative order within a group preserved. Does not mutate input.
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
    if (grouped.has(key) && members.length >= 2) {
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

/**
 * Collapses every run of line breaks (\r\n, \r, \n) together with the
 * spaces/tabs around it into a single space; a run at the start or end is
 * removed. Text without a line break is returned unchanged.
 */
export function collapseLineBreaks(text: string): string {
  if (!/[\r\n]/.test(text)) return text;
  return text
    .replace(/^[ \t]*(?:[\r\n][ \t]*)+/, '')
    .replace(/(?:[ \t]*[\r\n])+[ \t]*$/, '')
    .replace(/[ \t]*(?:[\r\n][ \t]*)+/g, ' ');
}

export type AddRowChange =
  | { kind: 'text'; value: string }
  | { kind: 'paste'; products: string[] };

/**
 * Classifies a change of the single-line add-row name field (SPEC.md §5.10):
 * - no line break in `next` → plain typing, keep `next`;
 * - exactly one typed line break (next is prev plus one break) → swallow it,
 *   keep `prev`;
 * - otherwise a paste: the WHOLE field value is parsed — 2+ products open the
 *   Review sheet, a single product goes into the field (one line is not a
 *   list), zero products stay as typed text with line breaks collapsed.
 * Detection doesn't depend on growth: a paste over a selection that shortens
 * the field still counts.
 */
export function classifyAddRowChange(prev: string, next: string): AddRowChange {
  if (!/[\r\n]/.test(next)) return { kind: 'text', value: next };
  if (
    next.length === prev.length + 1 &&
    next.replace(/[\r\n]/g, '') === prev
  ) {
    return { kind: 'text', value: prev };
  }
  const products = parseIngredients(next.replace(/\r\n?/g, '\n'));
  if (products.length >= 2) return { kind: 'paste', products };
  if (products.length === 1) return { kind: 'text', value: products[0] };
  return { kind: 'text', value: collapseLineBreaks(next) };
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

/**
 * Check-off motion (SPEC.md §5.10): a tapped row (or a group header with its
 * children) plays the check animation for a short window before it moves to
 * "In cart". Tapping again inside the window cancels — the pending set loses
 * those ids. A group cancels only when all its children are pending; otherwise
 * the tap (re)starts it for every child. Returns a new set; never mutates.
 */
export function togglePendingCheck(
  pending: ReadonlySet<number>,
  ids: number[]
): { action: 'start' | 'cancel'; next: Set<number> } {
  const next = new Set(pending);
  const allPending = ids.length > 0 && ids.every((id) => pending.has(id));
  if (allPending) {
    ids.forEach((id) => next.delete(id));
    return { action: 'cancel', next };
  }
  ids.forEach((id) => next.add(id));
  return { action: 'start', next };
}

/**
 * The sticky "In cart · N" pill (SPEC.md §5.10) says where checked rows went;
 * it is redundant — and hidden — once the cart section is on screen.
 */
export function inCartPillVisible(state: {
  inCartCount: number;
  cartInView: boolean;
}): boolean {
  return state.inCartCount > 0 && !state.cartInView;
}
