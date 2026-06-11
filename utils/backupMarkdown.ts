// Pure builder for the full-app backup Markdown (SPEC.md §5.6). One file holds
// every cookbook as a "# Name" section in the §5.6 per-cookbook format, plus an
// optional uncategorized bucket under the reserved "# §Uncategorized" heading.
// English-only, no native imports.
import type { Recipe } from '../db/schema';
import { cookbookBodyToMarkdown } from './markdown';

/** Sentinel heading for recipes with no cookbook (cookbook_id NULL). */
export const UNCATEGORIZED_HEADING = '§Uncategorized';

export type BackupSection = {
  /** Cookbook name, or null for the uncategorized bucket. */
  cookbookName: string | null;
  recipes: Recipe[];
};

/**
 * Builds the multi-cookbook backup. Named sections always render; the
 * null-name (uncategorized) section is omitted entirely when it has no recipes.
 * An empty sections array yields an empty string.
 */
export function buildBackupMarkdown(sections: BackupSection[]): string {
  const blocks: string[] = [];

  for (const section of sections) {
    const isUncategorized = section.cookbookName === null;
    if (isUncategorized && section.recipes.length === 0) continue;

    const heading = isUncategorized
      ? UNCATEGORIZED_HEADING
      : section.cookbookName!;

    blocks.push(
      [`# ${heading}`, '', cookbookBodyToMarkdown(section.recipes)].join('\n')
    );
  }

  return blocks.join('\n');
}
