// TDD red phase for the Shopping lists feature — pure logic helpers.
//
// Target module (does NOT exist yet): utils/shoppingList.ts
// These helpers are pure: no native imports, no DB access.

import {
  normalizeItemInput,
  validateItemName,
  partitionItems,
  progressLabel,
  countItems,
} from '../utils/shoppingList';

describe('utils/shoppingList — normalizeItemInput', () => {
  it('trims the name', () => {
    expect(normalizeItemInput({ name: '  Milk  ', quantity: '' })).toEqual({
      name: 'Milk',
      quantity: null,
    });
  });

  it('turns an empty quantity into null', () => {
    expect(normalizeItemInput({ name: 'Milk', quantity: '' }).quantity).toBeNull();
  });

  it('turns a whitespace-only quantity into null', () => {
    expect(
      normalizeItemInput({ name: 'Milk', quantity: '   ' }).quantity
    ).toBeNull();
  });

  it('passes a real quantity through, trimmed', () => {
    expect(normalizeItemInput({ name: 'Flour', quantity: '  1 kg  ' })).toEqual({
      name: 'Flour',
      quantity: '1 kg',
    });
  });
});

describe('utils/shoppingList — validateItemName', () => {
  it.each(['', '   '])('rejects blank name %p', (name) => {
    expect(validateItemName(name)).toBe(false);
  });

  it.each(['Milk', '  Milk  '])('accepts non-blank name %p', (name) => {
    expect(validateItemName(name)).toBe(true);
  });
});

describe('utils/shoppingList — partitionItems', () => {
  it('returns empty groups for empty input', () => {
    expect(partitionItems([])).toEqual({ active: [], inCart: [] });
  });

  it('puts every item in active when none are checked', () => {
    const items = [
      { checked: 0, id: 1 },
      { checked: 0, id: 2 },
    ];
    const { active, inCart } = partitionItems(items);
    expect(active).toEqual(items);
    expect(inCart).toEqual([]);
  });

  it('splits mixed items and preserves input order within each group', () => {
    const items = [
      { checked: 0, id: 1 },
      { checked: 1, id: 2 },
      { checked: 0, id: 3 },
      { checked: 1, id: 4 },
    ];
    const { active, inCart } = partitionItems(items);
    expect(active).toEqual([
      { checked: 0, id: 1 },
      { checked: 0, id: 3 },
    ]);
    expect(inCart).toEqual([
      { checked: 1, id: 2 },
      { checked: 1, id: 4 },
    ]);
  });
});

describe('utils/shoppingList — progressLabel', () => {
  it('returns null for an empty list', () => {
    expect(progressLabel({ totalCount: 0, checkedCount: 0 })).toBeNull();
  });

  it('formats a partial list', () => {
    expect(progressLabel({ totalCount: 8, checkedCount: 3 })).toBe('3/8 in cart');
  });

  it('formats a fully-checked list', () => {
    expect(progressLabel({ totalCount: 5, checkedCount: 5 })).toBe('5/5 in cart');
  });
});

describe('utils/shoppingList — countItems', () => {
  it('aggregates totals and checked counts per listId', () => {
    const result = countItems([
      { listId: 1, checked: 0 },
      { listId: 1, checked: 1 },
      { listId: 1, checked: 0 },
      { listId: 2, checked: 1 },
      { listId: 2, checked: 1 },
    ]);
    expect(result.get(1)).toEqual({ totalCount: 3, checkedCount: 1 });
    expect(result.get(2)).toEqual({ totalCount: 2, checkedCount: 2 });
  });

  it('omits lists that have no items', () => {
    const result = countItems([{ listId: 7, checked: 0 }]);
    expect(result.has(7)).toBe(true);
    expect(result.has(99)).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns an empty Map for no items', () => {
    const result = countItems([]);
    expect(result.size).toBe(0);
  });
});
