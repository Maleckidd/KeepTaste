import type { Cookbook } from '../db/schema';

export interface CookbookFormData {
  name: string;
  /** Empty string means "no cover". */
  coverImagePath: string;
}

export function emptyCookbookFormData(): CookbookFormData {
  return { name: '', coverImagePath: '' };
}

export function cookbookToFormData(cookbook: Cookbook): CookbookFormData {
  return {
    name: cookbook.name,
    coverImagePath: cookbook.coverImagePath ?? '',
  };
}

export function isCookbookFormDirty(
  initial: CookbookFormData,
  current: CookbookFormData
): boolean {
  return (
    initial.name !== current.name ||
    initial.coverImagePath !== current.coverImagePath
  );
}

export function normalizeCookbookInput(data: CookbookFormData): {
  name: string;
  coverImagePath: string | null;
} {
  return {
    name: data.name.trim(),
    coverImagePath: data.coverImagePath || null,
  };
}
