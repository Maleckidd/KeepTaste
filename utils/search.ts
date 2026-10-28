// Title + ingredient search (SPEC.md §5.3). Pure logic, no RN imports.
//
// - Both query and text are normalized: toLowerCase() plus Polish diacritic
//   folding, so "zurek", "żurek" and "Żurek" all match each other (folding is
//   intended — a user typing without Polish characters must still find recipes).
// - The query is split on whitespace; every term must match (AND), each one in
//   the title or in the raw ingredients text.
// - Light inflection tolerance: a term of STEM_MIN_LENGTH+ characters matches by
//   its stem (minus the last character), e.g. "cukinia" finds "2 cukinie".
// - Filtering happens in JS, never via SQL LIKE (SQLite only folds ASCII case).
import { parseIngredientLines } from './ingredients';

/** Query words at least this long are matched by their stem (minus last char). */
export const STEM_MIN_LENGTH = 5;

const DIACRITIC_FOLD: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

/** Lowercases and folds Polish diacritics (ą→a, ł→l, ż/ź→z, …). */
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[ąćęłńóśźż]/g, (ch) => DIACRITIC_FOLD[ch]);
}

/** Normalized, whitespace-split, stemmed search terms; [] for a blank query. */
export function queryTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) =>
      word.length >= STEM_MIN_LENGTH ? word.slice(0, -1) : word
    );
}

/**
 * One raw ingredient line made presentable for the "in ingredients: …" hint:
 * list/heading markers and `**` bold markers stripped, original casing kept.
 * Falls back to the trimmed raw line when cleaning would leave nothing.
 */
export function cleanIngredientLine(raw: string): string {
  const [parsed] = parseIngredientLines(raw);
  const cleaned = parsed ? parsed.text.replace(/\*\*/g, '').trim() : '';
  return cleaned || raw.trim();
}

export type RecipeMatch<T> = {
  recipe: T;
  /** 'title' when the title alone contains every term; otherwise 'ingredients'. */
  matchedIn: 'title' | 'ingredients';
  /** Cleaned first ingredient line that matched; null for title matches. */
  ingredientHint: string | null;
};

/**
 * Filters and ranks recipes for a search query. Title matches come first, then
 * ingredient (incl. mixed title+ingredient) matches; input order is kept within
 * each group. An empty query returns every recipe as a title match.
 */
export function matchRecipes<T extends { title: string; ingredients: string }>(
  recipes: readonly T[],
  query: string
): RecipeMatch<T>[] {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return recipes.map((recipe) => ({
      recipe,
      matchedIn: 'title' as const,
      ingredientHint: null,
    }));
  }

  const titleGroup: RecipeMatch<T>[] = [];
  const ingredientGroup: RecipeMatch<T>[] = [];

  for (const recipe of recipes) {
    const title = normalizeForSearch(recipe.title);
    const missingFromTitle = terms.filter((term) => !title.includes(term));
    if (missingFromTitle.length === 0) {
      titleGroup.push({ recipe, matchedIn: 'title', ingredientHint: null });
      continue;
    }
    const ingredients = normalizeForSearch(recipe.ingredients);
    if (!missingFromTitle.every((term) => ingredients.includes(term))) continue;

    const hintLine = recipe.ingredients
      .split(/\r?\n/)
      .find((line) => {
        const normalized = normalizeForSearch(line);
        return missingFromTitle.some((term) => normalized.includes(term));
      });
    ingredientGroup.push({
      recipe,
      matchedIn: 'ingredients',
      ingredientHint: hintLine !== undefined ? cleanIngredientLine(hintLine) : null,
    });
  }

  return [...titleGroup, ...ingredientGroup];
}
