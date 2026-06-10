import {
  emptyCookbookFormData,
  cookbookToFormData,
  isCookbookFormDirty,
  normalizeCookbookInput,
  CookbookFormData,
} from '../utils/cookbookForm';
import type { Cookbook } from '../db/schema';

describe('emptyCookbookFormData', () => {
  it('returns blank name and cover', () => {
    expect(emptyCookbookFormData()).toEqual({ name: '', coverImagePath: '' });
  });
});

describe('cookbookToFormData', () => {
  it('passes the name through', () => {
    const cookbook: Cookbook = {
      id: 1,
      name: 'Desserts',
      coverImagePath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(cookbookToFormData(cookbook).name).toBe('Desserts');
  });

  it('coerces a null coverImagePath to an empty string', () => {
    const cookbook: Cookbook = {
      id: 1,
      name: 'Desserts',
      coverImagePath: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(cookbookToFormData(cookbook).coverImagePath).toBe('');
  });

  it('passes a non-null coverImagePath through unchanged', () => {
    const cookbook: Cookbook = {
      id: 2,
      name: 'Mains',
      coverImagePath: 'file:///cover.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(cookbookToFormData(cookbook)).toEqual({
      name: 'Mains',
      coverImagePath: 'file:///cover.jpg',
    });
  });
});

describe('isCookbookFormDirty', () => {
  const base: CookbookFormData = { name: 'Soups', coverImagePath: 'file:///a.jpg' };

  it('is false for identical data', () => {
    expect(isCookbookFormDirty(base, { ...base })).toBe(false);
  });

  it('is true when the name differs', () => {
    expect(isCookbookFormDirty(base, { ...base, name: 'Stews' })).toBe(true);
  });

  it('is true when a cover is added', () => {
    const initial: CookbookFormData = { name: 'Soups', coverImagePath: '' };
    const current: CookbookFormData = { name: 'Soups', coverImagePath: 'file:///a.jpg' };
    expect(isCookbookFormDirty(initial, current)).toBe(true);
  });

  it('is true when a cover is removed', () => {
    const current: CookbookFormData = { name: 'Soups', coverImagePath: '' };
    expect(isCookbookFormDirty(base, current)).toBe(true);
  });

  it('is true when a cover is changed', () => {
    const current: CookbookFormData = { name: 'Soups', coverImagePath: 'file:///b.jpg' };
    expect(isCookbookFormDirty(base, current)).toBe(true);
  });
});

describe('normalizeCookbookInput', () => {
  it('trims surrounding whitespace from the name', () => {
    expect(normalizeCookbookInput({ name: '  Baking  ', coverImagePath: '' }).name).toBe(
      'Baking'
    );
  });

  it('converts an empty-string cover to null', () => {
    expect(
      normalizeCookbookInput({ name: 'Baking', coverImagePath: '' }).coverImagePath
    ).toBeNull();
  });

  it('passes a non-empty cover through', () => {
    expect(
      normalizeCookbookInput({ name: 'Baking', coverImagePath: 'file:///c.jpg' })
    ).toEqual({ name: 'Baking', coverImagePath: 'file:///c.jpg' });
  });
});
