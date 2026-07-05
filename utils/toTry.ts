// Pure to-try partition helper (SPEC.md §5.19). Fed a recipe list already sorted
// updated_at-desc, it splits into a leading "normal" bucket and a trailing
// "to try" bucket, preserving the input order within each. Applied after the
// existing sort in the recipe lists; no native imports so it stays unit-tested.

/** Splits recipes into normal/to-try buckets, preserving relative order. */
export function partitionToTry<T extends { toTry: number }>(
  recipes: T[]
): { normal: T[]; toTry: T[] } {
  const normal: T[] = [];
  const toTry: T[] = [];
  for (const recipe of recipes) {
    if (recipe.toTry) toTry.push(recipe);
    else normal.push(recipe);
  }
  return { normal, toTry };
}

/** Counts the to-try recipes in a list. */
export function countToTry<T extends { toTry: number }>(recipes: T[]): number {
  let count = 0;
  for (const recipe of recipes) {
    if (recipe.toTry) count += 1;
  }
  return count;
}
