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
  groupedNames,
  buildActiveRows,
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

describe('utils/shoppingList — groupedNames', () => {
  it('returns an empty set for an empty array', () => {
    expect(groupedNames([])).toEqual(new Set());
  });

  it('returns an empty set when every name is unique', () => {
    expect(
      groupedNames([{ name: 'Milk' }, { name: 'Eggs' }, { name: 'Bread' }])
    ).toEqual(new Set());
  });

  it('includes a name appearing twice, lowercased', () => {
    expect(groupedNames([{ name: 'Milk' }, { name: 'Milk' }])).toEqual(
      new Set(['milk'])
    );
  });

  it('counts across the whole array regardless of checked flag', () => {
    // only one active copy, but whole-list count is 2 -> grouped
    const items = [
      { name: 'Milk', checked: 0 },
      { name: 'Milk', checked: 1 },
    ];
    expect(groupedNames(items)).toEqual(new Set(['milk']));
  });

  it('groups case- and whitespace-insensitively into one lowercased key', () => {
    expect(groupedNames([{ name: '  Milk ' }, { name: 'milk' }])).toEqual(
      new Set(['milk'])
    );
  });

  it('groups Polish names by plain toLowerCase, keeping distinct words apart', () => {
    const result = groupedNames([
      { name: 'Mleko' },
      { name: 'masło' },
      { name: 'mleko' },
    ]);
    expect(result).toEqual(new Set(['mleko']));
    expect(result.has('masło')).toBe(false);
  });

  it('returns only lowercased keys', () => {
    const result = groupedNames([{ name: 'MILK' }, { name: 'Milk' }]);
    expect([...result]).toEqual(['milk']);
  });
});

describe('utils/shoppingList — buildActiveRows', () => {
  type Item = { id: number; name: string; quantity?: string; checked?: number };

  const summary = (rows: import('../utils/shoppingList').ActiveRow<Item>[]) =>
    rows.map((row) =>
      row.kind === 'groupHeader'
        ? {
            kind: 'groupHeader' as const,
            name: row.name,
            count: row.count,
            childIds: row.childIds,
          }
        : {
            kind: 'item' as const,
            id: row.item.id,
            name: row.item.name,
            isRepeat: row.isRepeat,
          }
    );

  it('returns an empty array for empty active input', () => {
    expect(buildActiveRows([], new Set())).toEqual([]);
  });

  it('emits a single plain item row (no header) for a non-grouped name', () => {
    const rows = buildActiveRows<Item>([{ id: 1, name: 'Milk' }], new Set());
    expect(summary(rows)).toEqual([
      { kind: 'item', id: 1, name: 'Milk', isRepeat: false },
    ]);
  });

  it('emits a header then child rows (all indented) for a grouped name with 2 active copies', () => {
    const active: Item[] = [
      { id: 1, name: 'Milk' },
      { id: 2, name: 'Milk' },
    ];
    const rows = buildActiveRows(active, new Set(['milk']));
    expect(summary(rows)).toEqual([
      { kind: 'groupHeader', name: 'Milk', count: 2, childIds: [1, 2] },
      { kind: 'item', id: 1, name: 'Milk', isRepeat: true },
      { kind: 'item', id: 2, name: 'Milk', isRepeat: true },
    ]);
  });

  it('still emits a header for a lone active copy whose name is grouped (count 1)', () => {
    const rows = buildActiveRows<Item>(
      [{ id: 3, name: 'Milk' }],
      new Set(['milk'])
    );
    expect(summary(rows)).toEqual([
      { kind: 'groupHeader', name: 'Milk', count: 1, childIds: [3] },
      { kind: 'item', id: 3, name: 'Milk', isRepeat: true },
    ]);
  });

  it('places the group at the first occurrence slot, leaving later uniques after', () => {
    const active: Item[] = [
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Milk' },
      { id: 3, name: 'Banana' },
      { id: 4, name: 'Milk' },
    ];
    const rows = buildActiveRows(active, new Set(['milk']));
    expect(summary(rows)).toEqual([
      { kind: 'item', id: 1, name: 'Apple', isRepeat: false },
      { kind: 'groupHeader', name: 'Milk', count: 2, childIds: [2, 4] },
      { kind: 'item', id: 2, name: 'Milk', isRepeat: true },
      { kind: 'item', id: 4, name: 'Milk', isRepeat: true },
      { kind: 'item', id: 3, name: 'Banana', isRepeat: false },
    ]);
  });

  it('handles three copies with childIds and all children indented', () => {
    const active: Item[] = [
      { id: 1, name: 'Milk' },
      { id: 2, name: 'Milk' },
      { id: 3, name: 'Milk' },
    ];
    const rows = buildActiveRows(active, new Set(['milk']));
    const header = rows[0];
    expect(header.kind).toBe('groupHeader');
    if (header.kind === 'groupHeader') {
      expect(header.count).toBe(3);
      expect(header.childIds).toEqual([1, 2, 3]);
    }
    expect(
      rows.filter((r) => r.kind === 'item').map((r) => (r as any).isRepeat)
    ).toEqual([true, true, true]);
  });

  it('header childIds equal the active members ids in render order', () => {
    const active: Item[] = [
      { id: 9, name: 'Milk' },
      { id: 4, name: 'Milk' },
    ];
    const rows = buildActiveRows(active, new Set(['milk']));
    const header = rows[0];
    expect(header.kind === 'groupHeader' && header.childIds).toEqual([9, 4]);
  });

  it('keeps the first copy original casing on the header and emits exactly one header for a mixed list', () => {
    const active: Item[] = [
      { id: 1, name: 'Eggs' },
      { id: 2, name: 'Milk' },
      { id: 3, name: 'Bread' },
      { id: 4, name: 'Milk' },
    ];
    const rows = buildActiveRows(active, new Set(['milk']));
    const headers = rows.filter((r) => r.kind === 'groupHeader');
    expect(headers).toHaveLength(1);
    expect(headers[0].kind === 'groupHeader' && headers[0].name).toBe('Milk');
  });

  it('groups case-insensitively while children keep their own casing', () => {
    const active: Item[] = [
      { id: 1, name: 'Milk' },
      { id: 2, name: 'milk' },
    ];
    const rows = buildActiveRows(active, new Set(['milk']));
    expect(summary(rows)).toEqual([
      { kind: 'groupHeader', name: 'Milk', count: 2, childIds: [1, 2] },
      { kind: 'item', id: 1, name: 'Milk', isRepeat: true },
      { kind: 'item', id: 2, name: 'milk', isRepeat: true },
    ]);
  });

  it('does not mutate the input active array', () => {
    const active: Item[] = [
      { id: 1, name: 'Milk' },
      { id: 2, name: 'Eggs' },
      { id: 3, name: 'Milk' },
    ];
    const snapshot = active.map((i) => ({ id: i.id, name: i.name }));
    buildActiveRows(active, new Set(['milk']));
    expect(active.map((i) => ({ id: i.id, name: i.name }))).toEqual(snapshot);
  });
});
