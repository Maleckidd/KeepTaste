// TDD red phase for cooking timers, stage 2 (SPEC.md §5.21) — background
// alarms via local OS notifications.
//
// Target module (does NOT exist yet): utils/timerNotifications.ts — pure,
// imports only utils/i18n (Translator) and utils/timers (timerLabel, Timer).
// No expo-notifications / react-native import, so no jest mapper is needed.
//   TIMER_CHANNEL_ID, TIMER_NOTIFICATION_PREFIX, FIRE_TIME_TOLERANCE_MS,
//   LIVE_EXPIRY_WINDOW_MS, timerNotificationId, timerIdFromNotificationId,
//   buildTimerNotificationContent, fireTimeFromTrigger,
//   planTimerNotifications, parseTimerNotificationResponse,
//   nextAlarmPermissionStep, shouldAlertOnExpire, timerForegroundBehavior,
//   startedTimerIds, createLatestRunner
//
// Content strings come from i18n/dictionary.ts: title = 'timer.done'
// ("Time's up" / "Czas minął"), body = timerLabel(t, title, step)
// ("Bread · step 3" / "Bread · krok 3", or just the title without a step).
import {
  TIMER_CHANNEL_ID,
  TIMER_NOTIFICATION_PREFIX,
  FIRE_TIME_TOLERANCE_MS,
  LIVE_EXPIRY_WINDOW_MS,
  timerNotificationId,
  timerIdFromNotificationId,
  buildTimerNotificationContent,
  fireTimeFromTrigger,
  planTimerNotifications,
  parseTimerNotificationResponse,
  nextAlarmPermissionStep,
  shouldAlertOnExpire,
  timerForegroundBehavior,
  startedTimerIds,
  createLatestRunner,
  armedAfterSync,
  EXACT_ALARM_NOTICE_MAX,
  nextExactAlarmStep,
  shouldRearmOnExactChange,
  parseNoticeCount,
} from '../utils/timerNotifications';
import type {
  ScheduledTimerNotification,
  AlarmPermission,
} from '../utils/timerNotifications';
import type { Timer } from '../utils/timers';
import { createTranslator, type Translator } from '../utils/i18n';

const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const en = createTranslator('en');
const pl = createTranslator('pl');

function running(over: Partial<Timer> & { endsInSec?: number } = {}): Timer {
  const { endsInSec = 300, ...rest } = over;
  return {
    id: 't1',
    recipeId: 1,
    sourceKey: 'k1',
    title: 'Bread',
    step: 3,
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

/** A scheduled entry exactly matching what the plan would want for `timer`. */
function scheduledFor(
  timer: Timer,
  t: Translator = en,
  over: Partial<ScheduledTimerNotification> = {},
): ScheduledTimerNotification {
  const content = buildTimerNotificationContent(timer, t);
  return {
    identifier: timerNotificationId(timer.id),
    fireAtMs: timer.endsAt ? Date.parse(timer.endsAt) : null,
    title: content.title,
    body: content.body,
    ...over,
  };
}

function plan(o: {
  timers?: Timer[];
  scheduled?: ScheduledTimerNotification[];
  presented?: string[];
  t?: Translator;
  rearm?: boolean;
  nowMs?: number;
}) {
  return planTimerNotifications({
    timers: o.timers ?? [],
    nowMs: o.nowMs ?? NOW,
    t: o.t ?? en,
    scheduled: o.scheduled ?? [],
    presented: o.presented ?? [],
    ...(o.rearm === undefined ? {} : { rearm: o.rearm }),
  });
}

const EMPTY_PLAN = { cancel: [], schedule: [], dismiss: [] };

describe('constants', () => {
  it('exposes the channel id, prefix and windows', () => {
    expect(TIMER_CHANNEL_ID).toBe('timers');
    expect(TIMER_NOTIFICATION_PREFIX).toBe('timer:');
    expect(FIRE_TIME_TOLERANCE_MS).toBe(1000);
    expect(LIVE_EXPIRY_WINDOW_MS).toBe(5000);
  });
});

describe('notification ids', () => {
  it('prefixes the timer id', () => {
    expect(timerNotificationId('abc')).toBe('timer:abc');
  });

  it('round-trips', () => {
    expect(timerIdFromNotificationId(timerNotificationId('abc'))).toBe('abc');
    expect(timerIdFromNotificationId(timerNotificationId('t-1730000000-x'))).toBe(
      't-1730000000-x',
    );
  });

  it('returns null for foreign identifiers', () => {
    expect(timerIdFromNotificationId('other:1')).toBeNull();
    expect(timerIdFromNotificationId('abc')).toBeNull();
    expect(timerIdFromNotificationId('')).toBeNull();
  });

  it('returns null for the bare prefix', () => {
    expect(timerIdFromNotificationId('timer:')).toBeNull();
  });
});

describe('buildTimerNotificationContent', () => {
  it('EN without a step: title is "Time\'s up", body is the recipe title', () => {
    const c = buildTimerNotificationContent(running({ step: null }), en);
    expect(c.title).toBe("Time's up");
    expect(c.body).toBe('Bread');
  });

  it('EN with a step: body is the step label', () => {
    const c = buildTimerNotificationContent(running({ step: 3 }), en);
    expect(c.title).toBe("Time's up");
    expect(c.body).toBe('Bread · step 3');
  });

  it('PL with a step', () => {
    const c = buildTimerNotificationContent(running({ step: 3 }), pl);
    expect(c.title).toBe('Czas minął');
    expect(c.body).toBe('Bread · krok 3');
  });

  it('PL without a step', () => {
    const c = buildTimerNotificationContent(running({ step: null }), pl);
    expect(c.title).toBe('Czas minął');
    expect(c.body).toBe('Bread');
  });

  it('carries recipeId, timerId and the localized Stop label in data', () => {
    const c = buildTimerNotificationContent(
      running({ id: 'abc', recipeId: 7 }),
      en,
    );
    expect(c.data).toEqual({ recipeId: 7, timerId: 'abc', stopLabel: 'Stop' });
  });

  // Ringing alarm: the native TimerPresentationDelegate reads `stopLabel` from
  // the data body for the notification's "Stop" action button.
  it('stopLabel is t(\'timer.alarmStop\'): EN "Stop", PL "Wyłącz"', () => {
    expect(buildTimerNotificationContent(running(), en).data.stopLabel).toBe('Stop');
    expect(buildTimerNotificationContent(running(), pl).data.stopLabel).toBe('Wyłącz');
    expect(buildTimerNotificationContent(running(), pl).data.stopLabel).toBe(
      pl('timer.alarmStop' as Parameters<Translator>[0]),
    );
  });
});

describe('fireTimeFromTrigger', () => {
  it('reads an Android DATE trigger', () => {
    expect(fireTimeFromTrigger({ type: 'date', value: 1730000000000 })).toBe(
      1730000000000,
    );
    expect(
      fireTimeFromTrigger({
        type: 'date',
        repeats: false,
        value: 1730000000000,
        channelId: 'timers',
      }),
    ).toBe(1730000000000);
  });

  it('returns null for a non-numeric or NaN value', () => {
    expect(fireTimeFromTrigger({ type: 'date', value: 'x' })).toBeNull();
    expect(fireTimeFromTrigger({ type: 'date', value: NaN })).toBeNull();
    expect(fireTimeFromTrigger({ type: 'date' })).toBeNull();
  });

  it('returns null for null / undefined / non-objects', () => {
    expect(fireTimeFromTrigger(null)).toBeNull();
    expect(fireTimeFromTrigger(undefined)).toBeNull();
    expect(fireTimeFromTrigger(1730000000000)).toBeNull();
    expect(fireTimeFromTrigger('date')).toBeNull();
  });

  it('returns null for other trigger types', () => {
    expect(fireTimeFromTrigger({ type: 'timeInterval', seconds: 5 })).toBeNull();
  });
});

describe('planTimerNotifications', () => {
  it('1: schedules a running future timer that has nothing scheduled', () => {
    const t = running({ id: 'a', recipeId: 4, step: 3, endsInSec: 120 });
    expect(plan({ timers: [t] })).toEqual({
      cancel: [],
      dismiss: [],
      schedule: [
        {
          identifier: 'timer:a',
          fireAtMs: Date.parse(t.endsAt!),
          timerId: 'a',
          recipeId: 4,
          title: "Time's up",
          body: 'Bread · step 3',
        },
      ],
    });
  });

  it('2: is a no-op when the same fire time and content are scheduled', () => {
    const t = running({ id: 'a' });
    expect(plan({ timers: [t], scheduled: [scheduledFor(t)] })).toEqual(EMPTY_PLAN);
  });

  it('3: tolerates fire-time drift up to 1000 ms', () => {
    const t = running({ id: 'a' });
    const at = Date.parse(t.endsAt!);
    expect(
      plan({ timers: [t], scheduled: [scheduledFor(t, en, { fireAtMs: at + 999 })] }),
    ).toEqual(EMPTY_PLAN);
    expect(
      plan({ timers: [t], scheduled: [scheduledFor(t, en, { fireAtMs: at - 999 })] }),
    ).toEqual(EMPTY_PLAN);
    expect(
      plan({ timers: [t], scheduled: [scheduledFor(t, en, { fireAtMs: at + 1000 })] }),
    ).toEqual(EMPTY_PLAN);

    const off = plan({
      timers: [t],
      scheduled: [scheduledFor(t, en, { fireAtMs: at + 1001 })],
    });
    expect(off.schedule.map((r) => r.identifier)).toEqual(['timer:a']);
    expect(off.schedule[0].fireAtMs).toBe(at);
    expect(off.cancel).toEqual([]);
  });

  it('4: reschedules after +1 min', () => {
    const before = running({ id: 'a', endsInSec: 120 });
    const after = running({ id: 'a', endsInSec: 180 });
    const p = plan({ timers: [after], scheduled: [scheduledFor(before)] });
    expect(p.schedule).toHaveLength(1);
    expect(p.schedule[0].identifier).toBe('timer:a');
    expect(p.schedule[0].fireAtMs).toBe(Date.parse(after.endsAt!));
    expect(p.cancel).toEqual([]);
  });

  it('5: reschedules with new content after a language switch', () => {
    const t = running({ id: 'a', step: 3 });
    const p = plan({ timers: [t], t: pl, scheduled: [scheduledFor(t, en)] });
    expect(p.schedule).toHaveLength(1);
    expect(p.schedule[0].title).toBe('Czas minął');
    expect(p.schedule[0].body).toBe('Bread · krok 3');
    expect(p.cancel).toEqual([]);
  });

  it('5b: reschedules when only the body differs', () => {
    const t = running({ id: 'a', step: 3 });
    const p = plan({
      timers: [t],
      scheduled: [scheduledFor(t, en, { body: 'Bread · step 2' })],
    });
    expect(p.schedule.map((r) => r.identifier)).toEqual(['timer:a']);
  });

  it('5c: reschedules when the scheduled title/body are unknown (null)', () => {
    const t = running({ id: 'a' });
    const p = plan({
      timers: [t],
      scheduled: [scheduledFor(t, en, { title: null, body: null })],
    });
    expect(p.schedule.map((r) => r.identifier)).toEqual(['timer:a']);
  });

  it('6: reschedules when the scheduled fire time is unknown', () => {
    const t = running({ id: 'a' });
    const p = plan({ timers: [t], scheduled: [scheduledFor(t, en, { fireAtMs: null })] });
    expect(p.schedule.map((r) => r.identifier)).toEqual(['timer:a']);
    expect(p.cancel).toEqual([]);
  });

  it('7: cancels a paused timer that is scheduled; nothing without an entry', () => {
    const p = paused({ id: 'p' });
    expect(
      plan({
        timers: [p],
        scheduled: [
          { identifier: 'timer:p', fireAtMs: NOW + 60_000, title: "Time's up", body: 'Bread' },
        ],
      }),
    ).toEqual({ cancel: ['timer:p'], schedule: [], dismiss: [] });
    expect(plan({ timers: [p] })).toEqual(EMPTY_PLAN);
  });

  it('8: cancels a scheduled entry whose timer is gone (stopped)', () => {
    const p = plan({
      timers: [],
      scheduled: [
        { identifier: 'timer:gone', fireAtMs: NOW + 60_000, title: "Time's up", body: 'Bread' },
      ],
    });
    expect(p).toEqual({ cancel: ['timer:gone'], schedule: [], dismiss: [] });
  });

  it('9: stopForRecipe cancels only that recipe\'s entries', () => {
    const a = running({ id: 'a', recipeId: 1 });
    const b = running({ id: 'b', recipeId: 1, endsInSec: 400 });
    const c = running({ id: 'c', recipeId: 2, endsInSec: 500 });
    const scheduled = [scheduledFor(a), scheduledFor(c), scheduledFor(b)];
    const p = plan({ timers: [c], scheduled });
    expect(p.cancel).toEqual(['timer:a', 'timer:b']);
    expect(p.schedule).toEqual([]);
    expect(p.dismiss).toEqual([]);
  });

  it('10: no timers left → every scheduled timer entry is cancelled', () => {
    const scheduled = ['x', 'y', 'z'].map((id) =>
      scheduledFor(running({ id })),
    );
    expect(plan({ timers: [], scheduled })).toEqual({
      cancel: ['timer:x', 'timer:y', 'timer:z'],
      schedule: [],
      dismiss: [],
    });
  });

  it('11: running past endsAt is not scheduled and its entry is not cancelled', () => {
    const due = running({ id: 'a', endsInSec: 0 });
    const late = running({ id: 'b', endsInSec: -5 });
    expect(plan({ timers: [due, late] })).toEqual(EMPTY_PLAN);
    expect(
      plan({ timers: [due, late], scheduled: [scheduledFor(due), scheduledFor(late)] }),
    ).toEqual(EMPTY_PLAN);
  });

  it('12: a done timer with a leftover scheduled entry is left alone', () => {
    const d = done({ id: 'd' });
    expect(
      plan({
        timers: [d],
        scheduled: [
          { identifier: 'timer:d', fireAtMs: NOW - 1000, title: "Time's up", body: 'Bread · step 1' },
        ],
      }),
    ).toEqual(EMPTY_PLAN);
  });

  it('13: running without (or with an unparseable) endsAt schedules nothing', () => {
    const noEnd = running({ id: 'a' });
    delete noEnd.endsAt;
    const badEnd = running({ id: 'b', endsAt: 'not a date' });
    expect(plan({ timers: [noEnd, badEnd] })).toEqual(EMPTY_PLAN);
  });

  it('14: ignores non-prefixed identifiers everywhere', () => {
    const t = running({ id: 'a' });
    const foreign: ScheduledTimerNotification[] = [
      { identifier: 'a', fireAtMs: NOW + 1000, title: 'x', body: 'y' },
      { identifier: 'other:a', fireAtMs: null, title: null, body: null },
      { identifier: 'timers:a', fireAtMs: NOW, title: 'x', body: 'y' },
    ];
    const presented = ['a', 'other:1', 'reminder'];
    expect(plan({ timers: [], scheduled: foreign, presented })).toEqual(EMPTY_PLAN);

    const p = plan({ timers: [t], scheduled: foreign, presented });
    expect(p.cancel).toEqual([]);
    expect(p.dismiss).toEqual([]);
    expect(p.schedule.map((r) => r.identifier)).toEqual(['timer:a']);
  });

  it('15: rearm schedules every desired timer even when it matches', () => {
    const a = running({ id: 'a' });
    const b = running({ id: 'b', endsInSec: 900 });
    const p = paused({ id: 'p' });
    const past = running({ id: 'late', endsInSec: -1 });
    const scheduled = [
      scheduledFor(a),
      scheduledFor(b),
      { identifier: 'timer:p', fireAtMs: NOW + 1000, title: "Time's up", body: 'Bread' },
    ];
    const r = plan({ timers: [a, b, p, past], scheduled, rearm: true });
    expect(r.schedule.map((x) => x.identifier)).toEqual(['timer:a', 'timer:b']);
    expect(r.cancel).toEqual(['timer:p']);
    expect(r.dismiss).toEqual([]);

    expect(plan({ timers: [a, b, p, past], scheduled, rearm: false })).toEqual({
      cancel: ['timer:p'],
      schedule: [],
      dismiss: [],
    });
  });

  it('16: dismisses presented notifications unless the timer is done', () => {
    const d = done({ id: 'd' });
    const again = running({ id: 'again', endsInSec: 60 }); // done + 1 min
    const p = paused({ id: 'p' });
    const r = plan({
      timers: [d, again, p],
      presented: ['timer:d', 'timer:missing', 'timer:again', 'timer:p'],
    });
    expect(r.dismiss).toEqual(['timer:missing', 'timer:again', 'timer:p']);
    expect(r.schedule.map((x) => x.identifier)).toEqual(['timer:again']);
    expect(r.cancel).toEqual([]);
  });

  it('16b: keeps the ringing notification of a running timer already past its end', () => {
    const due = running({ id: 'due', endsInSec: -0.5 });
    const r = plan({ timers: [due], presented: ['timer:due'] });
    expect(r.dismiss).toEqual([]);
  });

  it('16b: a done timer\'s presented notification is kept', () => {
    expect(plan({ timers: [done({ id: 'd' })], presented: ['timer:d'] })).toEqual(
      EMPTY_PLAN,
    );
  });

  it('17: schedule follows the timer-list order', () => {
    const timers = [
      running({ id: 'z', endsInSec: 900 }),
      running({ id: 'a', endsInSec: 60 }),
      running({ id: 'm', endsInSec: 300 }),
    ];
    expect(plan({ timers }).schedule.map((r) => r.timerId)).toEqual(['z', 'a', 'm']);
  });
});

describe('parseTimerNotificationResponse', () => {
  it('returns the timer and recipe ids for a valid response', () => {
    expect(
      parseTimerNotificationResponse('timer:abc', { recipeId: 5, timerId: 'abc' }),
    ).toEqual({ timerId: 'abc', recipeId: 5 });
  });

  it('rejects a foreign identifier', () => {
    expect(
      parseTimerNotificationResponse('other:abc', { recipeId: 5, timerId: 'abc' }),
    ).toBeNull();
    expect(
      parseTimerNotificationResponse('timer:', { recipeId: 5, timerId: '' }),
    ).toBeNull();
  });

  it('rejects missing or non-object data', () => {
    expect(parseTimerNotificationResponse('timer:abc', null)).toBeNull();
    expect(parseTimerNotificationResponse('timer:abc', undefined)).toBeNull();
    expect(parseTimerNotificationResponse('timer:abc', 'abc')).toBeNull();
    expect(parseTimerNotificationResponse('timer:abc', 5)).toBeNull();
  });

  it('rejects a recipeId that is not a positive integer', () => {
    for (const recipeId of ['5', 0, 1.5, NaN, undefined]) {
      expect(
        parseTimerNotificationResponse('timer:abc', { recipeId, timerId: 'abc' }),
      ).toBeNull();
    }
  });

  it('rejects data whose timerId does not match the identifier', () => {
    expect(
      parseTimerNotificationResponse('timer:abc', { recipeId: 5, timerId: 'xyz' }),
    ).toBeNull();
  });
});

describe('nextAlarmPermissionStep', () => {
  const perm = (
    status: AlarmPermission['status'],
    canAskAgain: boolean,
  ): AlarmPermission => ({ status, canAskAgain });

  it('granted → none, whatever the flags', () => {
    for (const canAskAgain of [true, false])
      for (const askedThisSession of [true, false])
        for (const noticeShown of [true, false])
          expect(
            nextAlarmPermissionStep(perm('granted', canAskAgain), {
              askedThisSession,
              noticeShown,
            }),
          ).toBe('none');
  });

  it('undetermined + can ask + not asked → request', () => {
    expect(
      nextAlarmPermissionStep(perm('undetermined', true), {
        askedThisSession: false,
        noticeShown: false,
      }),
    ).toBe('request');
    expect(
      nextAlarmPermissionStep(perm('undetermined', true), {
        askedThisSession: false,
        noticeShown: true,
      }),
    ).toBe('request');
  });

  it('denied + can ask + not asked → request', () => {
    expect(
      nextAlarmPermissionStep(perm('denied', true), {
        askedThisSession: false,
        noticeShown: false,
      }),
    ).toBe('request');
  });

  it('denied + cannot ask → notice once, then none', () => {
    expect(
      nextAlarmPermissionStep(perm('denied', false), {
        askedThisSession: false,
        noticeShown: false,
      }),
    ).toBe('notice');
    expect(
      nextAlarmPermissionStep(perm('denied', false), {
        askedThisSession: false,
        noticeShown: true,
      }),
    ).toBe('none');
  });

  it('asked this session and still denied → notice once, then none', () => {
    expect(
      nextAlarmPermissionStep(perm('denied', true), {
        askedThisSession: true,
        noticeShown: false,
      }),
    ).toBe('notice');
    expect(
      nextAlarmPermissionStep(perm('denied', true), {
        askedThisSession: true,
        noticeShown: true,
      }),
    ).toBe('none');
  });

  it('asked this session and still undetermined → notice', () => {
    expect(
      nextAlarmPermissionStep(perm('undetermined', true), {
        askedThisSession: true,
        noticeShown: false,
      }),
    ).toBe('notice');
  });
});

// Ringing alarm (stage 2 addendum, plan "ring until dismissed"): the input
// gains `exactAllowed`. Truth table:
//   !osAlarmEnabled → true (not armed: the in-app vibration is the alarm)
//   exactAllowed    → false (the OS notification rings in the foreground too)
//   otherwise       → appActive && endedAgoMs <= LIVE_EXPIRY_WINDOW_MS
describe('shouldAlertOnExpire', () => {
  it('always alerts when the OS alarm is disabled, whatever exactAllowed says', () => {
    for (const exactAllowed of [true, false])
      for (const appActive of [true, false])
        for (const endedAgoMs of [0, 800, 5001, 3_600_000])
          expect(
            shouldAlertOnExpire({ osAlarmEnabled: false, exactAllowed, appActive, endedAgoMs }),
          ).toBe(true);
  });

  it('armed with exact alarms allowed → never alerts in-app (the notification rings)', () => {
    for (const appActive of [true, false])
      for (const endedAgoMs of [0, 800, 5000, 5001, 3_600_000])
        expect(
          shouldAlertOnExpire({ osAlarmEnabled: true, exactAllowed: true, appActive, endedAgoMs }),
        ).toBe(false);
  });

  it('armed but inexact: alerts only for a live expiry in the foreground', () => {
    const inexact = { osAlarmEnabled: true, exactAllowed: false, appActive: true };
    expect(shouldAlertOnExpire({ ...inexact, endedAgoMs: 0 })).toBe(true);
    expect(shouldAlertOnExpire({ ...inexact, endedAgoMs: 800 })).toBe(true);
    expect(shouldAlertOnExpire({ ...inexact, endedAgoMs: 5000 })).toBe(true);
    expect(shouldAlertOnExpire({ ...inexact, endedAgoMs: 5001 })).toBe(false);
  });

  it('armed but inexact and the app inactive → no alert', () => {
    for (const endedAgoMs of [0, 800, 5001])
      expect(
        shouldAlertOnExpire({
          osAlarmEnabled: true,
          exactAllowed: false,
          appActive: false,
          endedAgoMs,
        }),
      ).toBe(false);
  });
});

describe('timerForegroundBehavior', () => {
  it('shows timer notifications with sound in the foreground (single ringer)', () => {
    expect(timerForegroundBehavior('timer:x')).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('shows other notifications silently', () => {
    expect(timerForegroundBehavior('other:x')).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('treats the bare prefix as a non-timer id (silent)', () => {
    expect(timerForegroundBehavior('timer:').shouldPlaySound).toBe(false);
  });
});

describe('startedTimerIds', () => {
  it('null previous set is the baseline → []', () => {
    expect(startedTimerIds(null, [running({ id: 'a' })])).toEqual([]);
  });

  it('reports a new running id', () => {
    expect(
      startedTimerIds(new Set(['a']), [running({ id: 'a' }), running({ id: 'b' })]),
    ).toEqual(['b']);
  });

  it('ignores an existing id resumed from paused', () => {
    expect(startedTimerIds(new Set(['a']), [running({ id: 'a' })])).toEqual([]);
  });

  it('reports the new id when a done timer is replaced', () => {
    expect(startedTimerIds(new Set(['old']), [running({ id: 'new' })])).toEqual([
      'new',
    ]);
  });

  it('ignores a new id that is not running', () => {
    expect(
      startedTimerIds(new Set<string>(), [done({ id: 'd' }), paused({ id: 'p' })]),
    ).toEqual([]);
  });
});

describe('createLatestRunner', () => {
  type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void };
  function deferred(): Deferred {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  const flush = () => new Promise<void>((r) => setImmediate(r));

  function harness(onError?: (e: unknown) => void) {
    const calls: string[] = [];
    const pending: Deferred[] = [];
    let active = 0;
    let maxActive = 0;
    const runner = createLatestRunner<string>((arg) => {
      calls.push(arg);
      active++;
      maxActive = Math.max(maxActive, active);
      const d = deferred();
      pending.push(d);
      return d.promise.finally(() => {
        active--;
      });
    }, onError);
    return { runner, calls, pending, maxActive: () => maxActive };
  }

  it('runs a single request once', async () => {
    const h = harness();
    h.runner.request('a');
    await flush();
    expect(h.calls).toEqual(['a']);
    h.pending[0].resolve();
    await flush();
    expect(h.calls).toEqual(['a']);
  });

  it('coalesces requests made while a run is in flight to the latest', async () => {
    const h = harness();
    h.runner.request('a');
    await flush();
    h.runner.request('b');
    h.runner.request('c');
    await flush();
    expect(h.calls).toEqual(['a']);
    h.pending[0].resolve();
    await flush();
    expect(h.calls).toEqual(['a', 'c']);
    h.pending[1].resolve();
    await flush();
    expect(h.calls).toEqual(['a', 'c']);
    expect(h.maxActive()).toBe(1);
  });

  it('never runs more than one at a time', async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) {
      h.runner.request(`r${i}`);
      await flush();
      h.runner.request(`s${i}`);
      h.pending[h.pending.length - 1].resolve();
      await flush();
    }
    h.pending[h.pending.length - 1].resolve();
    await flush();
    expect(h.maxActive()).toBe(1);
  });

  it('reports a rejection to onError and still runs the next request', async () => {
    const onError = jest.fn();
    const h = harness(onError);
    h.runner.request('a');
    await flush();
    h.runner.request('b');
    const boom = new Error('boom');
    h.pending[0].reject(boom);
    await flush();
    expect(onError).toHaveBeenCalledWith(boom);
    expect(h.calls).toEqual(['a', 'b']);
    h.pending[1].resolve();
    await flush();

    h.runner.request('c');
    await flush();
    expect(h.calls).toEqual(['a', 'b', 'c']);
    h.pending[2].resolve();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('idle() resolves immediately when nothing is running', async () => {
    const h = harness();
    let settled = false;
    void h.runner.idle().then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(true);
  });

  it('idle() resolves only after the final queued run', async () => {
    const h = harness();
    h.runner.request('a');
    await flush();
    h.runner.request('b');
    let settled = false;
    const idle = h.runner.idle().then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    h.pending[0].resolve();
    await flush();
    expect(h.calls).toEqual(['a', 'b']);
    expect(settled).toBe(false);
    h.pending[1].resolve();
    await idle;
    expect(settled).toBe(true);
  });
});

// Coder addition (reviewer fix): per-timer armed set — any native failure for a
// timer must fall back to the stage-1 in-app alert on return.
describe('armedAfterSync', () => {
  const none = new Set<string>();
  const arm = (o: {
    prev?: Set<string>;
    timers: Timer[];
    failed?: Set<string>;
  }) =>
    [...armedAfterSync({ prev: o.prev ?? none, timers: o.timers, nowMs: NOW, failed: o.failed ?? none })].sort();

  it('arms every running future timer whose schedule did not fail', () => {
    expect(arm({ timers: [running({ id: 'a' }), running({ id: 'b', endsInSec: 60 })] })).toEqual([
      'a',
      'b',
    ]);
  });

  it('does not arm a timer whose schedule call failed', () => {
    expect(
      arm({
        prev: new Set(['a', 'b']),
        timers: [running({ id: 'a' }), running({ id: 'b' })],
        failed: new Set(['a']),
      }),
    ).toEqual(['b']);
  });

  it('a running timer past its end keeps its previous status', () => {
    const due = running({ id: 'due', endsInSec: 0 });
    const late = running({ id: 'late', endsInSec: -5 });
    expect(arm({ prev: new Set(['due']), timers: [due, late] })).toEqual(['due']);
  });

  it('drops paused, done and missing timers', () => {
    expect(
      arm({
        prev: new Set(['p', 'd', 'gone']),
        timers: [paused({ id: 'p' }), done({ id: 'd' })],
      }),
    ).toEqual([]);
  });

  it('never arms a running timer without a parseable end', () => {
    const noEnd = running({ id: 'a' });
    delete noEnd.endsAt;
    expect(arm({ timers: [noEnd, running({ id: 'b', endsAt: 'nope' })] })).toEqual([]);
  });

  it('does not mutate the previous set', () => {
    const prev = new Set(['x']);
    armedAfterSync({ prev, timers: [running({ id: 'a' })], nowMs: NOW, failed: none });
    expect([...prev]).toEqual(['x']);
  });
});

// TDD red phase — exact timer alarms (stage 2 addendum). Without exact-alarm
// access Android fires an inexact alarm up to 3/4 of the duration late, so the
// app asks for "Alarms & reminders" via a snackbar: at most once per session,
// at most EXACT_ALARM_NOTICE_MAX sessions in total, only while notifications
// are allowed. A false -> true change in exact access re-arms the schedule.
describe('EXACT_ALARM_NOTICE_MAX', () => {
  it('caps the exact-alarm notice at 3 sessions', () => {
    expect(EXACT_ALARM_NOTICE_MAX).toBe(3);
  });
});

describe('nextExactAlarmStep', () => {
  const base = {
    osAlarmEnabled: true,
    exactAllowed: false,
    shownThisSession: false,
    timesShown: 0,
  };
  const step = (over: Partial<typeof base> = {}) => nextExactAlarmStep({ ...base, ...over });

  it('shows nothing while OS alarms are off (notifications denied or module missing)', () => {
    expect(step({ osAlarmEnabled: false })).toBe('none');
  });

  it('shows nothing when exact alarms are already allowed', () => {
    expect(step({ exactAllowed: true })).toBe('none');
  });

  it('shows nothing a second time in the same session', () => {
    expect(step({ shownThisSession: true })).toBe('none');
  });

  it.each([0, 1, 2])('shows the notice when it was shown %i times before', (timesShown) => {
    expect(step({ timesShown })).toBe('notice');
  });

  it.each([3, 4])('stops after the cap (shown %i times)', (timesShown) => {
    expect(step({ timesShown })).toBe('none');
  });

  it('the cap is EXACT_ALARM_NOTICE_MAX', () => {
    expect(step({ timesShown: EXACT_ALARM_NOTICE_MAX - 1 })).toBe('notice');
    expect(step({ timesShown: EXACT_ALARM_NOTICE_MAX })).toBe('none');
  });

  it('shows nothing when every blocker applies at once', () => {
    expect(
      step({ osAlarmEnabled: false, exactAllowed: true, shownThisSession: true, timesShown: 5 }),
    ).toBe('none');
  });
});

describe('shouldRearmOnExactChange', () => {
  it.each<[boolean | null, boolean, boolean]>([
    [null, true, false],
    [null, false, false],
    [false, true, true],
    [true, true, false],
    [true, false, false],
    [false, false, false],
  ])('prev %p -> next %p re-arms: %p', (prev, next, expected) => {
    expect(shouldRearmOnExactChange(prev, next)).toBe(expected);
  });
});

describe('parseNoticeCount', () => {
  it.each<[string, number]>([
    ['0', 0],
    ['1', 1],
    ['3', 3],
    ['12', 12],
  ])('parses %p as %p', (raw, expected) => {
    expect(parseNoticeCount(raw)).toBe(expected);
  });

  it.each<[string | null | undefined]>([
    [null],
    [undefined],
    [''],
    ['-1'],
    ['x'],
    ['1.5'],
    ['NaN'],
    ['Infinity'],
  ])('falls back to 0 for %p', (raw) => {
    expect(parseNoticeCount(raw)).toBe(0);
  });
});
