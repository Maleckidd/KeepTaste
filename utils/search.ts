// Diacritics-safe title search (SPEC §5.1).
// Substring matching is case-insensitive via JS toLowerCase (handles non-ASCII
// like Polish diacritics). Intentionally NOT accent-folding: "zurek" must not
// match "żurek".

export function matchesQuery(title: string, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === '') return true;
  return title.toLowerCase().includes(trimmed.toLowerCase());
}

export function filterRecipesByTitle<T extends { title: string }>(
  recipes: T[],
  query: string
): T[] {
  if (query.trim() === '') return recipes;
  return recipes.filter((recipe) => matchesQuery(recipe.title, query));
}
