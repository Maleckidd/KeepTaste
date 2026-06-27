// Pure builder for a shopping list's shareable plain-text message (SPEC.md §5.18).
// Mirrors recipeShareText.ts: produces ready-to-send text for SMS/Messenger so
// the recipient can paste it straight back via "Paste products" (§5.16) — the
// list round-trips between phones with no backend (the app stays local-only).
//
// Only active (not-yet-in-cart) items are included: the recipient starts their
// shopping from scratch. Each item is a "- " bullet so parseIngredients (§5.16)
// strips the marker on re-paste; an optional quantity is appended in parens.
import type { ShoppingItem } from '../db/schema';

export function buildShoppingListShareText(
  listName: string,
  items: ShoppingItem[]
): string {
  const lines = items
    .filter((item) => !item.checked)
    .map((item) =>
      item.quantity ? `- ${item.name} (${item.quantity})` : `- ${item.name}`
    );

  // A list with no active items shares just its name (no empty bullet block).
  if (lines.length === 0) return listName;

  return `${listName}\n\n${lines.join('\n')}`;
}
