// Pure share-text builder for a shopping list (§5.18). No native/DB imports.
import { buildShoppingListShareText } from '../utils/shoppingListShareText';

function item(over: Partial<any> = {}): any {
  return {
    id: 1,
    listId: 1,
    name: 'Milk',
    quantity: null,
    checked: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildShoppingListShareText', () => {
  it('includes the list name and one bullet per active item', () => {
    const text = buildShoppingListShareText('Weekend', [
      item({ id: 1, name: 'Milk' }),
      item({ id: 2, name: 'Bread' }),
    ]);
    expect(text).toContain('Weekend');
    expect(text).toContain('- Milk');
    expect(text).toContain('- Bread');
  });

  it('appends the quantity in parentheses when present', () => {
    const text = buildShoppingListShareText('Weekend', [
      item({ name: 'Apples', quantity: '1kg' }),
    ]);
    expect(text).toContain('- Apples (1kg)');
  });

  it('omits items already in the cart (checked)', () => {
    const text = buildShoppingListShareText('Weekend', [
      item({ id: 1, name: 'Milk', checked: 0 }),
      item({ id: 2, name: 'Bread', checked: 1 }),
    ]);
    expect(text).toContain('- Milk');
    expect(text).not.toContain('Bread');
  });

  it('round-trips: bullets survive parseIngredients on re-paste', () => {
    // The bullet marker must be strippable so a pasted share reproduces the
    // names verbatim (quantity stays embedded in the name, per §5.10/§5.12).
    const {
      parseIngredients,
    } = require('../utils/ingredients') as typeof import('../utils/ingredients');
    const text = buildShoppingListShareText('Weekend', [
      item({ id: 1, name: 'Milk' }),
      item({ id: 2, name: 'Apples', quantity: '1kg' }),
    ]);
    // The list name becomes the first parsed line; the items follow.
    expect(parseIngredients(text)).toEqual([
      'Weekend',
      'Milk',
      'Apples (1kg)',
    ]);
  });

  it('an empty (or fully-checked) list shares just its name', () => {
    expect(buildShoppingListShareText('Weekend', [])).toBe('Weekend');
    expect(
      buildShoppingListShareText('Weekend', [item({ checked: 1 })])
    ).toBe('Weekend');
  });
});
