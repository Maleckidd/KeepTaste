// TDD red phase for cooking timers, stage 1 (SPEC.md §5.21) — timer model.
//
// Target module (does NOT exist yet): utils/timers.ts
//   timersReducer, remainingSeconds, expireDue, orderTimers, barSummary,
//   findTimerForChip, serializeTimers, parseStoredTimers, formatCountdown,
//   formatDurationWords, timerLabel, shouldShowTimerBar
// Pure: imports only from utils/i18n (createTranslator / Translator). The
// reducer receives ids and `now` (epoch ms) inside actions so it stays
// deterministic. Dates are ISO 8601 strings.
//
// formatDurationWords / timerLabel rely on new dictionary keys
// (timer.unit.hour|minute|second.one|few|many, timer.stepLabel) — part of
// the red phase.
import {
  timersReducer,
  remainingSeconds,
  expireDue,
  orderTimers,
  barSummary,
  findTimerForChip,
  serializeTimers,
  parseStoredTimers,
  formatCountdown,
  formatDurationWords,
  timerLabel,
  shouldShowTimerBar,
} from '../utils/timers';
import type { Timer } from '../utils/timers';
import { createTranslator } from '../utils/i18n';

const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function running(over: Partial<Timer> & { endsInSec?: number } = {}): Timer {
  const { endsInSec = 300, ...rest } = over;
  return {
    id: 't1',
    recipeId: 1,
    sourceKey: 'k1',
    title: 'Bread',
    step: 2,
    durationSec: 600,
    state: 'running',
    endsAt: iso(NOW + endsInSec * 1000),
    ...rest,
  };
}

function paused(over: Partial<Timer> = {}): Timer {
  return {
    id: 'p1',
    recipeId: 1,
    sourceKey: 'kp',
    title: 'Bread',
    step: null,
    durationSec: 600,
    state: 'paused',
    remainingSec: 42,
    ...over,
  };
}

function done(over: Partial<Timer> = {}): Timer {
  return {
    id: 'd1',
    recipeId: 1,
    sourceKey: 'kd',
    title: 'Bread',
    step: 1,
    durationSec: 600,
    state: 'done',
    ...over,
  };
}

describe('remainingSeconds', () => {
  it('returns whole seconds left for a running timer', () => {
    expect(remainingSeconds(running({ endsInSec: 90 }), NOW)).toBe(90);
  });

  it('rounds partial seconds up', () => {
    const t = running({ endsAt: iso(NOW + 89_200) });
    expect(remainingSeconds(t, NOW)).toBe(90);
  });

  it('is 0 once the end is in the past', () => {
    expect(remainingSeconds(running({ endsInSec: -10 }), NOW)).toBe(0);
  });

  it('returns remainingSec for a paused timer', () => {
    expect(remainingSeconds(paused({ remainingSec: 42 }), NOW)).toBe(42);
  });

  it('is 0 for a done timer', () => {
    expect(remainingSeconds(done(), NOW)).toBe(0);
  });
});

describe('timersReducer — start', () => {
  const startAction = {
    type: 'start' as const,
    id: 'new',
    recipeId: 7,
    sourceKey: 'k-a',
    title: 'Soup',
    step: 3,
    durationSec: 1800,
    now: NOW,
  };

  it('appends a running timer ending now + duration', () => {
    const existing = [paused({ id: 'other', recipeId: 2 })];
    const next = timersReducer(existing, startAction);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(existing[0]);
    expect(next[1]).toEqual({
      id: 'new',
      recipeId: 7,
      sourceKey: 'k-a',
      title: 'Soup',
      step: 3,
      durationSec: 1800,
      state: 'running',
      endsAt: iso(NOW + 1800 * 1000),
    });
    expect(next[1].remainingSec).toBeUndefined();
  });

  it('is a no-op (same reference) when that chip already has a running timer', () => {
    const state = [running({ id: 'x', recipeId: 7, sourceKey: 'k-a' })];
    expect(timersReducer(state, startAction)).toBe(state);
  });

  it('is a no-op (same reference) when that chip already has a paused timer', () => {
    const state = [paused({ id: 'x', recipeId: 7, sourceKey: 'k-a' })];
    expect(timersReducer(state, startAction)).toBe(state);
  });

  it('replaces a done timer for the same chip with a new running one', () => {
    const state = [done({ id: 'old', recipeId: 7, sourceKey: 'k-a' })];
    const next = timersReducer(state, startAction);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('new');
    expect(next[0].state).toBe('running');
    expect(next[0].endsAt).toBe(iso(NOW + 1800 * 1000));
  });

  it('same sourceKey on a different recipe is a separate timer', () => {
    const state = [running({ id: 'x', recipeId: 8, sourceKey: 'k-a' })];
    expect(timersReducer(state, startAction)).toHaveLength(2);
  });
});

describe('timersReducer — pause / resume', () => {
  it('pauses a running timer, storing the remaining seconds and dropping endsAt', () => {
    const state = [running({ id: 'a', endsInSec: 125 })];
    const next = timersReducer(state, { type: 'pause', id: 'a', now: NOW });
    expect(next[0].state).toBe('paused');
    expect(next[0].remainingSec).toBe(125);
    expect(next[0].endsAt).toBeUndefined();
    expect(next[0].id).toBe('a');
  });

  it('pause on a paused or done timer returns the same reference', () => {
    const p = [paused({ id: 'a' })];
    expect(timersReducer(p, { type: 'pause', id: 'a', now: NOW })).toBe(p);
    const d = [done({ id: 'a' })];
    expect(timersReducer(d, { type: 'pause', id: 'a', now: NOW })).toBe(d);
  });

  it('resumes a paused timer to end at now + remainingSec', () => {
    const state = [paused({ id: 'a', remainingSec: 42 })];
    const next = timersReducer(state, { type: 'resume', id: 'a', now: NOW });
    expect(next[0].state).toBe('running');
    expect(next[0].endsAt).toBe(iso(NOW + 42_000));
    expect(next[0].remainingSec).toBeUndefined();
  });
});

describe('timersReducer — addMinute', () => {
  it('extends a running timer by 60 s', () => {
    const t = running({ id: 'a', endsInSec: 100 });
    const next = timersReducer([t], { type: 'addMinute', id: 'a', now: NOW });
    expect(next[0].state).toBe('running');
    expect(next[0].endsAt).toBe(iso(NOW + 160_000));
  });

  it('adds 60 s to a paused timer', () => {
    const next = timersReducer([paused({ id: 'a', remainingSec: 42 })], {
      type: 'addMinute',
      id: 'a',
      now: NOW,
    });
    expect(next[0].state).toBe('paused');
    expect(next[0].remainingSec).toBe(102);
  });

  it('restarts a done timer for 60 s', () => {
    const next = timersReducer([done({ id: 'a' })], {
      type: 'addMinute',
      id: 'a',
      now: NOW,
    });
    expect(next[0].state).toBe('running');
    expect(next[0].endsAt).toBe(iso(NOW + 60_000));
  });
});

describe('timersReducer — stop / stopForRecipe / stopAll', () => {
  const a = running({ id: 'a', recipeId: 1 });
  const b = paused({ id: 'b', recipeId: 2 });
  const c = done({ id: 'c', recipeId: 1 });

  it('stop removes the timer by id', () => {
    expect(timersReducer([a, b, c], { type: 'stop', id: 'b' })).toEqual([a, c]);
  });

  it('stop with an unknown id returns the same reference', () => {
    const state = [a, b];
    expect(timersReducer(state, { type: 'stop', id: 'zzz' })).toBe(state);
  });

  it("stopForRecipe removes only that recipe's timers", () => {
    expect(
      timersReducer([a, b, c], { type: 'stopForRecipe', recipeId: 1 })
    ).toEqual([b]);
  });

  it('stopAll clears everything', () => {
    expect(timersReducer([a, b, c], { type: 'stopAll' })).toEqual([]);
  });
});

describe('timersReducer — tick', () => {
  it('turns a running timer past its end into done (no endsAt)', () => {
    const state = [running({ id: 'a', endsInSec: -1 }), paused({ id: 'b' })];
    const next = timersReducer(state, { type: 'tick', now: NOW });
    expect(next[0].state).toBe('done');
    expect(next[0].endsAt).toBeUndefined();
    expect(next[1]).toBe(state[1]);
  });

  it('a running timer exactly at its end is done', () => {
    const state = [running({ id: 'a', endsInSec: 0 })];
    expect(timersReducer(state, { type: 'tick', now: NOW })[0].state).toBe(
      'done'
    );
  });

  it('returns the same reference when nothing is due', () => {
    const state = [running({ id: 'a', endsInSec: 30 }), paused(), done()];
    expect(timersReducer(state, { type: 'tick', now: NOW })).toBe(state);
  });
});

describe('expireDue', () => {
  it('lists exactly the newly expired ids', () => {
    const state = [
      running({ id: 'a', endsInSec: -5 }),
      running({ id: 'b', endsInSec: 30, sourceKey: 'kb' }),
      done({ id: 'c' }),
      running({ id: 'd', endsInSec: -1, sourceKey: 'kd2' }),
    ];
    const { timers, expiredIds } = expireDue(state, NOW);
    expect(expiredIds.sort()).toEqual(['a', 'd']);
    expect(timers.map((t) => t.state)).toEqual([
      'done',
      'running',
      'done',
      'done',
    ]);
  });

  it('returns no ids and the same array when nothing expired', () => {
    const state = [running({ endsInSec: 30 }), done()];
    const result = expireDue(state, NOW);
    expect(result.expiredIds).toEqual([]);
    expect(result.timers).toBe(state);
  });
});

describe('orderTimers / barSummary', () => {
  const r1 = running({ id: 'r1', endsInSec: 300, sourceKey: 'a' });
  const r2 = running({ id: 'r2', endsInSec: 60, sourceKey: 'b' });
  const p1 = paused({ id: 'p1', remainingSec: 500, sourceKey: 'c' });
  const p2 = paused({ id: 'p2', remainingSec: 20, sourceKey: 'd' });
  const d1 = done({ id: 'd1', sourceKey: 'e' });

  it('orders done first, then running by soonest end, then paused by least remaining', () => {
    expect(orderTimers([p1, r1, d1, p2, r2], NOW).map((t) => t.id)).toEqual([
      'd1',
      'r2',
      'r1',
      'p2',
      'p1',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [p1, r1, d1];
    orderTimers(input, NOW);
    expect(input.map((t) => t.id)).toEqual(['p1', 'r1', 'd1']);
  });

  it('barSummary picks the first ordered timer and counts the rest', () => {
    const s = barSummary([p1, r1, r2], NOW);
    expect(s.primary).toBe(r2);
    expect(s.othersCount).toBe(2);
  });

  it('barSummary with a done timer puts it first', () => {
    expect(barSummary([r2, d1], NOW).primary).toBe(d1);
  });

  it('barSummary of a single timer has no others', () => {
    expect(barSummary([p1], NOW)).toEqual({ primary: p1, othersCount: 0 });
  });

  it('barSummary of nothing is empty', () => {
    expect(barSummary([], NOW)).toEqual({ primary: null, othersCount: 0 });
  });
});

describe('findTimerForChip', () => {
  const a = running({ id: 'a', recipeId: 1, sourceKey: 's' });
  const b = running({ id: 'b', recipeId: 2, sourceKey: 's' });
  const c = running({ id: 'c', recipeId: 1, sourceKey: 'other' });

  it('matches both recipeId and sourceKey', () => {
    expect(findTimerForChip([a, b, c], 2, 's')).toBe(b);
    expect(findTimerForChip([a, b, c], 1, 'other')).toBe(c);
  });

  it('returns undefined when there is no match', () => {
    expect(findTimerForChip([a, b, c], 3, 's')).toBeUndefined();
    expect(findTimerForChip([b], 1, 's')).toBeUndefined();
  });
});

describe('serializeTimers / parseStoredTimers', () => {
  it('round-trips all fields including step: null', () => {
    const timers = [
      running({ id: 'a', step: null, endsInSec: 120 }),
      paused({ id: 'b', step: 4, sourceKey: 'x' }),
      done({ id: 'c', step: null, sourceKey: 'y' }),
    ];
    const restored = parseStoredTimers(serializeTimers(timers), NOW);
    expect(restored).toEqual(timers);
    expect(restored[0].step).toBeNull();
  });

  it('serializes to a string', () => {
    expect(typeof serializeTimers([])).toBe('string');
    expect(parseStoredTimers(serializeTimers([]), NOW)).toEqual([]);
  });

  it.each([[null], [''], ['garbage'], ['{}'], ['[1,"x",null]']])(
    'returns [] for %p',
    (raw) => {
      expect(parseStoredTimers(raw as string | null, NOW)).toEqual([]);
    }
  );

  const valid = running({ id: 'ok', endsInSec: 120 });
  const parseOne = (item: object) =>
    parseStoredTimers(JSON.stringify([item, valid]), NOW).map((t) => t.id);

  it('drops entries with an unknown state', () => {
    expect(parseOne({ ...running({ id: 'bad' }), state: 'ringing' })).toEqual([
      'ok',
    ]);
  });

  it('drops entries with a missing or non-string id', () => {
    const { id: _omit, ...noId } = running({ sourceKey: 'z' });
    expect(parseOne(noId)).toEqual(['ok']);
    expect(parseOne({ ...running({ sourceKey: 'z' }), id: 5 })).toEqual(['ok']);
  });

  it('drops entries with a non-finite recipeId', () => {
    expect(parseOne({ ...running({ id: 'bad' }), recipeId: 'x' })).toEqual([
      'ok',
    ]);
    expect(parseOne({ ...running({ id: 'bad' }), recipeId: null })).toEqual([
      'ok',
    ]);
  });

  it('drops entries with durationSec <= 0', () => {
    expect(parseOne({ ...running({ id: 'bad' }), durationSec: 0 })).toEqual([
      'ok',
    ]);
    expect(parseOne({ ...running({ id: 'bad' }), durationSec: -30 })).toEqual([
      'ok',
    ]);
  });

  it('drops running entries with an invalid or missing endsAt', () => {
    expect(
      parseOne({ ...running({ id: 'bad' }), endsAt: 'not a date' })
    ).toEqual(['ok']);
    const { endsAt: _omit, ...noEnd } = running({ id: 'bad' });
    expect(parseOne(noEnd)).toEqual(['ok']);
  });

  it('drops paused entries with a missing or negative remainingSec', () => {
    const { remainingSec: _omit, ...noRemaining } = paused({ id: 'bad' });
    expect(parseOne(noRemaining)).toEqual(['ok']);
    expect(parseOne({ ...paused({ id: 'bad' }), remainingSec: -1 })).toEqual([
      'ok',
    ]);
  });

  it('loads a running timer whose end has passed as done', () => {
    const stale = running({ id: 'a', endsInSec: -60 });
    const [t] = parseStoredTimers(JSON.stringify([stale]), NOW);
    expect(t.state).toBe('done');
    expect(t.endsAt).toBeUndefined();
    expect(t.id).toBe('a');
  });

  it('keeps paused timers as they are', () => {
    const p = paused({ id: 'p', remainingSec: 77 });
    expect(parseStoredTimers(JSON.stringify([p]), NOW)).toEqual([p]);
  });

  it('keeps only the first entry for duplicate ids', () => {
    const first = running({ id: 'dup', sourceKey: 'first' });
    const second = paused({ id: 'dup', sourceKey: 'second' });
    const result = parseStoredTimers(JSON.stringify([first, second]), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].sourceKey).toBe('first');
  });
});

describe('formatCountdown', () => {
  it.each([
    [0, '00:00'],
    [-5, '00:00'],
    [59, '00:59'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [5400, '1:30:00'],
    [86400, '24:00:00'],
  ])('%p → %p', (sec, text) => {
    expect(formatCountdown(sec)).toBe(text);
  });
});

describe('formatDurationWords', () => {
  const en = createTranslator('en');
  const pl = createTranslator('pl');

  it.each([
    [5400, '1 hour 30 minutes'],
    [3600, '1 hour'],
    [60, '1 minute'],
    [45, '45 seconds'],
    [90, '1 minute 30 seconds'],
  ])('EN %p → %p', (sec, text) => {
    expect(formatDurationWords(sec, en)).toBe(text);
  });

  it.each([
    [5400, '1 godzina 30 minut'],
    [7200, '2 godziny'],
    [18000, '5 godzin'],
    [60, '1 minuta'],
    [120, '2 minuty'],
    [1320, '22 minuty'],
    [720, '12 minut'],
    [45, '45 sekund'],
  ])('PL %p → %p', (sec, text) => {
    expect(formatDurationWords(sec, pl)).toBe(text);
  });
});

describe('timerLabel', () => {
  it('appends the step number in the UI language', () => {
    expect(timerLabel(createTranslator('en'), 'Bread', 3)).toBe(
      'Bread · step 3'
    );
    expect(timerLabel(createTranslator('pl'), 'Bread', 3)).toBe(
      'Bread · krok 3'
    );
  });

  it('is just the title when there is no step', () => {
    expect(timerLabel(createTranslator('en'), 'Bread', null)).toBe('Bread');
    expect(timerLabel(createTranslator('pl'), 'Bread', null)).toBe('Bread');
  });
});

describe('shouldShowTimerBar', () => {
  it('is hidden with no timers', () => {
    expect(
      shouldShowTimerBar({ pathname: '/', keyboardVisible: false, timerCount: 0 })
    ).toBe(false);
  });

  it('is hidden while the keyboard is visible', () => {
    expect(
      shouldShowTimerBar({ pathname: '/', keyboardVisible: true, timerCount: 2 })
    ).toBe(false);
  });

  it.each([
    '/recipe/new',
    '/recipe/edit',
    '/recipe/add-to-list',
    '/shopping/new',
    '/cookbook/new',
    '/cookbook/edit',
  ])('is hidden on modal route %p', (pathname) => {
    expect(
      shouldShowTimerBar({ pathname, keyboardVisible: false, timerCount: 1 })
    ).toBe(false);
  });

  it.each([
    '/',
    '/shopping',
    '/recipe/5',
    '/cookbook/all',
    '/settings',
    '/shopping/3',
  ])('is shown on %p', (pathname) => {
    expect(
      shouldShowTimerBar({ pathname, keyboardVisible: false, timerCount: 1 })
    ).toBe(true);
  });
});
