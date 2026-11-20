// TDD red phase for the i18n (Polish + English) feature — pure logic helpers.
//
// Target modules (do NOT exist yet):
//   - i18n/dictionary.ts  (dictionary, TranslationKey, Language)
//   - utils/i18n.ts       (parsePreference, resolveLanguage, interpolate,
//                          createTranslator, pluralPl, LanguagePreference)
// All pure: no native imports, no DB access.

import { dictionary } from '../i18n/dictionary';
import type { TranslationKey } from '../i18n/dictionary';
import {
  parsePreference,
  resolveLanguage,
  interpolate,
  createTranslator,
  pluralPl,
} from '../utils/i18n';
import { progressCounts } from '../utils/shoppingList';

describe('i18n/dictionary — completeness', () => {
  const keys = Object.keys(dictionary) as TranslationKey[];

  it('has at least one entry', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('key %p has non-empty en and pl strings', (key) => {
    const entry = dictionary[key];
    expect(typeof entry.en).toBe('string');
    expect(typeof entry.pl).toBe('string');
    expect(entry.en.trim()).not.toBe('');
    expect(entry.pl.trim()).not.toBe('');
  });

  // The Coder must provide these exact keys (pinned contract).
  it.each([
    ['common.cancel', 'Cancel'],
    ['tabs.recipes', 'Recipes'],
    ['tabs.shopping', 'Shopping'],
    ['shopping.inCart', '{checked}/{total} in cart'],
    ['shoppingList.pasteWholeList', 'Paste a whole list'],
    ['shopping.shareList', "Send what's left ({count})"],
    ['cookbook.menuSharePdf', 'Share as PDF'],
    ['recipe.menuShare', 'Share'],
    ['timer.alarmStop', 'Stop'],
    // Live countdown notification (SPEC.md §5.21 stage 3).
    ['timer.liveEndsAt', 'Ends at {time}'],
    ['timer.liveChannelName', 'Running timers'],
    ['timer.liveChannelDescription', 'Countdown of running cooking timers'],
    // To-try toggle in the recipe "⋯" menu (SPEC.md §5.19).
    ['recipe.menuMarkToTry', 'Mark to try'],
    ['recipe.menuUnmarkToTry', 'Unmark to try'],
    ['recipe.markedToTry', 'Marked to try'],
    ['recipe.unmarkedToTry', 'Removed from To try'],
  ] as const)('contains pinned key %p with en %p', (key, en) => {
    expect(dictionary[key as TranslationKey]).toBeDefined();
    expect(dictionary[key as TranslationKey].en).toBe(en);
  });

  // Package F: share actions moved into the "⋯" menus (SPEC.md §5.3/§5.4).
  it.each([
    ['cookbook.menuSharePdf', 'Udostępnij jako PDF'],
    ['recipe.menuShare', 'Udostępnij'],
    ['timer.alarmStop', 'Wyłącz'],
    ['timer.liveEndsAt', 'Koniec o {time}'],
    ['timer.liveChannelName', 'Odliczanie minutników'],
    ['timer.liveChannelDescription', 'Odliczanie trwających minutników'],
    ['recipe.menuMarkToTry', 'Oznacz „do wypróbowania”'],
    ['recipe.menuUnmarkToTry', 'Odznacz „do wypróbowania”'],
    ['recipe.markedToTry', 'Oznaczono do wypróbowania'],
    ['recipe.unmarkedToTry', 'Usunięto z „do wypróbowania”'],
  ] as const)('contains pinned key %p with pl %p', (key, pl) => {
    expect(dictionary[key as TranslationKey]).toBeDefined();
    expect(dictionary[key as TranslationKey].pl).toBe(pl);
  });

  // The header share icon buttons are gone, so their a11y labels are dead keys.
  it.each(['a11y.shareRecipe', 'a11y.shareCookbook'])(
    'no longer contains dead key %p',
    (key) => {
      expect(Object.prototype.hasOwnProperty.call(dictionary, key)).toBe(false);
    },
  );
});

describe('utils/i18n — parsePreference', () => {
  it.each([
    ['en', 'en'],
    ['pl', 'pl'],
    ['system', 'system'],
  ] as const)('maps valid %p -> %p', (stored, expected) => {
    expect(parsePreference(stored)).toBe(expected);
  });

  it.each([null, 'xx', 'fr', '', 'garbage', 'EN', ' en '])(
    'falls back to "system" for %p',
    (stored) => {
      expect(parsePreference(stored)).toBe('system');
    }
  );
});

describe('utils/i18n — resolveLanguage', () => {
  it.each([
    ['en', 'pl-PL', 'en'],
    ['pl', 'en-US', 'pl'],
    ['system', 'pl', 'pl'],
    ['system', 'pl-PL', 'pl'],
    ['system', 'en-US', 'en'],
    ['system', 'de', 'en'],
    ['system', null, 'en'],
  ] as const)('(%p, %p) -> %p', (pref, locale, expected) => {
    expect(resolveLanguage(pref, locale)).toBe(expected);
  });
});

describe('utils/i18n — interpolate', () => {
  it('replaces {name} with a string param', () => {
    expect(interpolate('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('replaces {count} with a number param', () => {
    expect(interpolate('You have {count} items', { count: 3 })).toBe(
      'You have 3 items'
    );
  });

  it('leaves a template without tokens unchanged', () => {
    expect(interpolate('Just text', { name: 'x' })).toBe('Just text');
    expect(interpolate('Just text')).toBe('Just text');
  });

  it('leaves a missing param token as-is', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
    expect(interpolate('Hi {name}')).toBe('Hi {name}');
  });

  it('replaces every occurrence of the same token', () => {
    expect(interpolate('{x}-{x}-{x}', { x: 'a' })).toBe('a-a-a');
  });

  it('replaces multiple distinct tokens', () => {
    expect(
      interpolate('{checked}/{total} in cart', { checked: 3, total: 8 })
    ).toBe('3/8 in cart');
  });
});

describe('utils/i18n — createTranslator', () => {
  const en = createTranslator('en');
  const pl = createTranslator('pl');

  it('returns English strings for the en translator', () => {
    expect(en('common.cancel')).toBe('Cancel');
    expect(en('tabs.recipes')).toBe('Recipes');
    expect(en('tabs.shopping')).toBe('Shopping');
  });

  it('returns a different, non-empty Polish string for common.cancel', () => {
    const value = pl('common.cancel');
    expect(value.trim()).not.toBe('');
    expect(value).not.toBe('Cancel');
  });

  it('interpolates params in the English locale', () => {
    expect(en('shopping.inCart', { checked: 3, total: 8 })).toBe(
      '3/8 in cart'
    );
  });

  it('interpolates the share label count in English (shopping.shareList)', () => {
    expect(en('shopping.shareList' as TranslationKey, { count: 3 })).toBe(
      "Send what's left (3)"
    );
    expect(en('shopping.shareList' as TranslationKey, { count: 0 })).toBe(
      "Send what's left (0)"
    );
  });

  it('interpolates the share label count in Polish (shopping.shareList)', () => {
    expect(pl('shopping.shareList' as TranslationKey, { count: 3 })).toBe(
      'Wyślij pozostałe (3)'
    );
  });

  it('has the Polish label for shoppingList.pasteWholeList', () => {
    expect(pl('shoppingList.pasteWholeList' as TranslationKey)).toBe(
      'Wklej całą listę'
    );
  });

  it('interpolates params in the Polish locale (both tokens substituted)', () => {
    const value = pl('shopping.inCart', { checked: 3, total: 8 });
    expect(value).toContain('3');
    expect(value).toContain('8');
    expect(value).not.toContain('{checked}');
    expect(value).not.toContain('{total}');
  });
});

describe('utils/i18n — pluralPl', () => {
  it.each([1])('%p -> one', (n) => {
    expect(pluralPl(n)).toBe('one');
  });

  it.each([2, 3, 4, 22, 33, 44])('%p -> few', (n) => {
    expect(pluralPl(n)).toBe('few');
  });

  it.each([0, 5, 9, 11, 12, 13, 14, 19, 21, 25, 111, 112])(
    '%p -> many',
    (n) => {
      expect(pluralPl(n)).toBe('many');
    }
  );
});

describe('utils/shoppingList — progressCounts', () => {
  it('returns null when totalCount is 0', () => {
    expect(progressCounts({ totalCount: 0, checkedCount: 0 })).toBeNull();
  });

  it('passes counts through when there are items', () => {
    expect(progressCounts({ totalCount: 8, checkedCount: 3 })).toEqual({
      checkedCount: 3,
      totalCount: 8,
    });
  });

  it('passes through a fully-checked list', () => {
    expect(progressCounts({ totalCount: 5, checkedCount: 5 })).toEqual({
      checkedCount: 5,
      totalCount: 5,
    });
  });
});
