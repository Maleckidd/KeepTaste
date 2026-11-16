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
  collapseLineBreaks,
  classifyAddRowChange,
  togglePendingCheck,
  inCartPillVisible,
  sortShoppingItems,
} from '../utils/shoppingList';
import { parseIngredients } from '../utils/ingredients';

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

  // SPEC.md §5.10 reversed the old behaviour: a header needs 2+ ACTIVE copies.
  // A lone active copy is a plain row even if its name is in `grouped`.
  it('emits a plain row (no header) for a lone active copy whose name is grouped', () => {
    const rows = buildActiveRows<Item>(
      [{ id: 3, name: 'Milk' }],
      new Set(['milk'])
    );
    expect(summary(rows)).toEqual([
      { kind: 'item', id: 3, name: 'Milk', isRepeat: false },
    ]);
  });

  it('in-cart copies do not count: one active + one in cart is a plain row', () => {
    const items = [
      { id: 1, name: 'Milk', checked: 0 },
      { id: 2, name: 'Milk', checked: 1 },
    ];
    const { active } = partitionItems(items);
    const expected = [{ kind: 'item', id: 1, name: 'Milk', isRepeat: false }];
    // Whatever grouped set the caller passes (whole list or active only),
    // a single active copy never gets a header.
    expect(summary(buildActiveRows(active, groupedNames(items)))).toEqual(
      expected
    );
    expect(summary(buildActiveRows(active, groupedNames(active)))).toEqual(
      expected
    );
  });

  it('two active copies plus one in cart -> header counts only the active ones', () => {
    const items = [
      { id: 1, name: 'Milk', checked: 0 },
      { id: 2, name: 'Milk', checked: 1 },
      { id: 3, name: 'Milk', checked: 0 },
    ];
    const { active } = partitionItems(items);
    const rows = buildActiveRows(active, groupedNames(active));
    expect(summary(rows)).toEqual([
      { kind: 'groupHeader', name: 'Milk', count: 2, childIds: [1, 3] },
      { kind: 'item', id: 1, name: 'Milk', isRepeat: true },
      { kind: 'item', id: 3, name: 'Milk', isRepeat: true },
    ]);
  });

  it('mixed: lone active Milk (other copy in cart) stays plain, 2 active Eggs get the only header', () => {
    const items = [
      { id: 1, name: 'Milk', checked: 0 },
      { id: 2, name: 'Eggs', checked: 0 },
      { id: 3, name: 'Milk', checked: 1 },
      { id: 4, name: 'Eggs', checked: 0 },
    ];
    const { active } = partitionItems(items);
    // Whole-list grouped set contains both names; only Eggs has 2+ active.
    const rows = buildActiveRows(active, groupedNames(items));
    expect(summary(rows)).toEqual([
      { kind: 'item', id: 1, name: 'Milk', isRepeat: false },
      { kind: 'groupHeader', name: 'Eggs', count: 2, childIds: [2, 4] },
      { kind: 'item', id: 2, name: 'Eggs', isRepeat: true },
      { kind: 'item', id: 4, name: 'Eggs', isRepeat: true },
    ]);
    expect(rows.filter((r) => r.kind === 'groupHeader')).toHaveLength(1);
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

describe('utils/shoppingList — collapseLineBreaks', () => {
  it.each([
    ['a\nb', 'a b'],
    ['a  \r\n\n  b', 'a b'],
    ['a\rb', 'a b'],
    ['Milk\n', 'Milk'],
    ['\n\nMilk', 'Milk'],
    [' \n ', ''],
    ['', ''],
    // No line break -> unchanged (leading spaces kept).
    ['  Milk', '  Milk'],
    ['Milk 2l', 'Milk 2l'],
  ])('%p -> %p', (input, expected) => {
    expect(collapseLineBreaks(input)).toBe(expected);
  });
});

describe('utils/shoppingList — classifyAddRowChange', () => {
  describe('plain typing (no line break) -> text next', () => {
    it.each([
      ['Mil', 'Milk', 'Milk'],
      ['Milk', '', ''],
      ['', 'M', 'M'],
    ])('(%p, %p) -> text %p', (prev, next, value) => {
      expect(classifyAddRowChange(prev, next)).toEqual({ kind: 'text', value });
    });
  });

  describe('a single typed line break is swallowed -> text prev', () => {
    it.each([
      ['Milk', 'Milk\n', 'Milk'],
      ['Milk', 'Mi\nlk', 'Milk'],
      ['Milk', '\nMilk', 'Milk'],
    ])('(%p, %p) -> text %p', (prev, next, value) => {
      expect(classifyAddRowChange(prev, next)).toEqual({ kind: 'text', value });
    });
  });

  describe('a multi-product paste -> paste with parsed products', () => {
    it.each([
      ['', 'Milk\nBread\nEggs', ['Milk', 'Bread', 'Eggs']],
      ['', 'Milk\r\nBread', ['Milk', 'Bread']],
      ['', 'Milk\rBread', ['Milk', 'Bread']],
      ['', 'Weekend\n\n- Milk\n- Apples (1kg)', ['Weekend', 'Milk', 'Apples (1kg)']],
      ['', '1. Milk\n2. Eggs', ['Milk', 'Eggs']],
      // Paste appended to existing text: the whole field value is parsed.
      ['Mil', 'Milk\nBread', ['Milk', 'Bread']],
      // Paste over a selection that SHORTENS the field still counts.
      ['Bananas and apples', 'a\nb', ['a', 'b']],
    ] as const)('(%p, %p) -> paste %p', (prev, next, products) => {
      expect(classifyAddRowChange(prev, next)).toEqual({
        kind: 'paste',
        products: [...products],
      });
    });
  });

  describe('a paste with inline separators -> paste', () => {
    it.each([
      ['', 'Milk, Bread, Eggs', ['Milk', 'Bread', 'Eggs']],
      ['', 'mleko; chleb', ['mleko', 'chleb']],
      ['', 'mleko, chleb\nmasło', ['mleko', 'chleb', 'masło']],
      // Pasted next to typed text: the whole field value is parsed.
      ['Ser', 'Ser, mleko, chleb', ['Ser', 'mleko', 'chleb']],
    ] as const)('(%p, %p) -> paste %p', (prev, next, products) => {
      expect(classifyAddRowChange(prev, next)).toEqual({
        kind: 'paste',
        products: [...products],
      });
    });
  });

  describe('typing a separator never splits -> text next', () => {
    it.each([
      // Typed comma.
      ['Milk', 'Milk,'],
      ['Milk, Bread', 'Milk, Bread,'],
      ['Milk, Brea', 'Milk, Bread'],
      // Keyboard autocorrect replacing the last word and appending ", ".
      ['chleb, mlek', 'chleb, mleko, '],
      // Decimal comma.
      ['2', '2,5 kg'],
      // Pasted chunk that is a single product.
      ['', 'mąka (typ 650, 1 kg)'],
    ])('(%p, %p) -> text next', (prev, next) => {
      expect(classifyAddRowChange(prev, next)).toEqual({ kind: 'text', value: next });
    });
  });

  describe('a paste parsing to exactly one product -> text with that product', () => {
    it.each([
      ['', 'Milk\n', 'Milk'],
      ['', '  Milk  \n\n', 'Milk'],
      ['', '- Milk\n', 'Milk'],
    ])('(%p, %p) -> text %p', (prev, next, value) => {
      expect(classifyAddRowChange(prev, next)).toEqual({ kind: 'text', value });
    });
  });

  describe('a paste parsing to zero products -> text with line breaks collapsed', () => {
    it("('', '\\n\\n') -> text ''", () => {
      expect(classifyAddRowChange('', '\n\n')).toEqual({ kind: 'text', value: '' });
    });

    it("('', '# Fruit\\n') -> text '# Fruit' (heading-only parses to no products)", () => {
      // Precondition pinned so a parser change surfaces here, not as a mystery.
      expect(parseIngredients('# Fruit\n')).toEqual([]);
      expect(classifyAddRowChange('', '# Fruit\n')).toEqual({
        kind: 'text',
        value: '# Fruit',
      });
    });
  });
});

// Check-off motion (§5.10): a tapped row plays its check animation for a short
// window before it moves to "In cart"; tapping again inside the window cancels.
describe('utils/shoppingList — togglePendingCheck', () => {
  it('starts a check for ids that are not pending', () => {
    const r = togglePendingCheck(new Set(), [4]);
    expect(r.action).toBe('start');
    expect([...r.next]).toEqual([4]);
  });

  it('cancels when the tapped row is already pending', () => {
    const r = togglePendingCheck(new Set([4, 7]), [4]);
    expect(r.action).toBe('cancel');
    expect([...r.next]).toEqual([7]);
  });

  it('cancels a group only when all its children are pending', () => {
    const r = togglePendingCheck(new Set([1, 2]), [1, 2]);
    expect(r.action).toBe('cancel');
    expect(r.next.size).toBe(0);
  });

  it('starts a group when only some children are pending, adding the rest', () => {
    const r = togglePendingCheck(new Set([1]), [1, 2]);
    expect(r.action).toBe('start');
    expect([...r.next].sort()).toEqual([1, 2]);
  });

  it('does not mutate the input set', () => {
    const input = new Set([3]);
    togglePendingCheck(input, [5]);
    expect([...input]).toEqual([3]);
  });

  it('treats an empty id list as a no-op start', () => {
    const r = togglePendingCheck(new Set([3]), []);
    expect(r.action).toBe('start');
    expect([...r.next]).toEqual([3]);
  });
});

// The sticky "In cart · N" pill replaces the moved-to-cart snackbar (§5.10):
// it says where checked rows went, so it hides once the cart is on screen.
describe('utils/shoppingList — inCartPillVisible', () => {
  it('shows when the cart has items and is off screen', () => {
    expect(inCartPillVisible({ inCartCount: 2, cartInView: false })).toBe(true);
  });

  it('hides when the cart is empty', () => {
    expect(inCartPillVisible({ inCartCount: 0, cartInView: false })).toBe(false);
  });

  it('hides when the cart section is already visible', () => {
    expect(inCartPillVisible({ inCartCount: 3, cartInView: true })).toBe(false);
  });
});

describe('utils/shoppingList — sortShoppingItems (SPEC §5.10)', () => {
  const ids = (rows: { id: number }[]) => rows.map((r) => r.id);

  it('puts active items before in-cart ones, newest added first among active', () => {
    const rows = [
      { id: 1, checked: 0, checkedAt: null },
      { id: 3, checked: 1, checkedAt: '2026-11-09T10:00:00.000Z' },
      { id: 2, checked: 0, checkedAt: null },
    ];
    expect(ids(sortShoppingItems(rows))).toEqual([2, 1, 3]);
  });

  it('orders the cart by check-off time, most recently checked first', () => {
    // Item 1 was added first but checked last: it must lead the cart.
    const rows = [
      { id: 1, checked: 1, checkedAt: '2026-11-09T10:05:00.000Z' },
      { id: 2, checked: 1, checkedAt: '2026-11-09T10:01:00.000Z' },
      { id: 3, checked: 1, checkedAt: '2026-11-09T10:03:00.000Z' },
    ];
    expect(ids(sortShoppingItems(rows))).toEqual([1, 3, 2]);
  });

  it('places in-cart items without checkedAt (checked before the upgrade) after timed ones, newest added first', () => {
    const rows = [
      { id: 1, checked: 1, checkedAt: null },
      { id: 2, checked: 1, checkedAt: '2026-11-09T10:00:00.000Z' },
      { id: 3, checked: 1, checkedAt: null },
    ];
    expect(ids(sortShoppingItems(rows))).toEqual([2, 3, 1]);
  });

  it('breaks a check-off time tie (group header) by newest added first', () => {
    const at = '2026-11-09T10:00:00.000Z';
    const rows = [
      { id: 4, checked: 1, checkedAt: at },
      { id: 7, checked: 1, checkedAt: at },
    ];
    expect(ids(sortShoppingItems(rows))).toEqual([7, 4]);
  });

  it('ignores a stale checkedAt on an active item and does not mutate its input', () => {
    const rows = [
      { id: 1, checked: 0, checkedAt: '2026-11-09T10:00:00.000Z' },
      { id: 2, checked: 0, checkedAt: null },
    ];
    const copy = [...rows];
    expect(ids(sortShoppingItems(rows))).toEqual([2, 1]);
    expect(rows).toEqual(copy);
  });
});
