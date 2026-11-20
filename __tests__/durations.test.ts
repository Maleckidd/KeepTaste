// TDD red phase for cooking timers, stage 1 (SPEC.md §5.21) — duration
// detection in recipe Instructions.
//
// Target module (does NOT exist yet): utils/durations.ts
//   parseDurations(text): DurationMatch[]        — sorted by start, non-overlapping
//   splitDurationSegments(text): DurationSegment[]
// Pure: no react-native / expo imports. Must run on Hermes (no lookbehind,
// no \p{..}/u flag) — that is an implementation note, not tested here.
import { parseDurations, splitDurationSegments } from '../utils/durations';

/** Asserts the input yields exactly one match that spans the whole string. */
function expectWhole(text: string, seconds: number) {
  const matches = parseDurations(text);
  expect(matches).toHaveLength(1);
  expect(matches[0]).toEqual({
    start: 0,
    end: text.length,
    text,
    seconds,
  });
}

describe('parseDurations — basic units', () => {
  it('matches "30 min" inside a sentence without eating the trailing period', () => {
    expect(parseDurations('Bake for 30 min.')).toEqual([
      { start: 9, end: 15, text: '30 min', seconds: 1800 },
    ]);
  });

  it.each([
    ['30min', 1800],
    ['30 MIN', 1800],
    ['1 h', 3600],
    ['1h', 3600],
    ['2 hr', 7200],
    ['2 hrs', 7200],
    ['2 hours', 7200],
    ['1 hour', 3600],
    ['45 s', 45],
    ['45 sec', 45],
    ['10 seconds', 10],
    ['30 sek.', 30],
    ['30 sekund', 30],
    ['5 minut', 300],
    ['3 minuty', 180],
    ['1 minutę', 60],
    ['2 godz.', 7200],
    ['1 godzina', 3600],
    ['1 godzinę', 3600],
    ['2 godziny', 7200],
    ['5 godzin', 18000],
  ])('%p → %p s (whole text)', (text, seconds) => {
    expectWhole(text, seconds);
  });

  it('includes the abbreviation dot in "sek." and "godz."', () => {
    expect(parseDurations('30 sek.')[0].text).toBe('30 sek.');
    expect(parseDurations('2 godz.')[0].text).toBe('2 godz.');
  });
});

describe('parseDurations — decimals', () => {
  it.each([
    ['1,5 h', 5400],
    ['1.5 h', 5400],
    ['0,5 godz.', 1800],
    ['2,5 min', 150],
    ['1,25 min', 75],
  ])('%p → %p s', (text, seconds) => {
    expectWhole(text, seconds);
  });
});

describe('parseDurations — compound durations', () => {
  it.each([
    ['1 h 30 min', 5400],
    ['1 godz. 15 min', 4500],
    ['1 hour 30 minutes', 5400],
    ['1 hour and 30 minutes', 5400],
    ['1 godzina i 15 minut', 4500],
    ['2 min 30 s', 150],
    ['1 min 30 sek.', 90],
    ['1 h 5 min 10 s', 3910],
  ])('%p → one match of %p s', (text, seconds) => {
    expectWhole(text, seconds);
  });

  // Two bare digits (00–59) right after an hour unit, closing the phrase (end
  // of text or sentence punctuation), are minutes — "1h30" is common in
  // Polish recipes.
  it.each([
    ['1 h 30', 5400],
    ['1h30', 5400],
    ['1h30min', 5400],
    ['1 godz. 30', 5400],
  ])('reads a bare number after hours as minutes: %p → %p s', (text, seconds) => {
    expectWhole(text, seconds);
  });

  it('keeps the bare-minutes rule inside a sentence', () => {
    expect(parseDurations('Piecz 1h30, potem studź.')).toEqual([
      { start: 6, end: 10, text: '1h30', seconds: 5400 },
    ]);
  });

  it('does not read a bare number after minutes or one starting a range', () => {
    expect(parseDurations('5 min 30')).toEqual([
      { start: 0, end: 5, text: '5 min', seconds: 300 },
    ]);
    expect(parseDurations('1 h 30–35 min').map((m) => m.text)).toEqual([
      '1 h',
      '30–35 min',
    ]);
  });

  it.each([
    ['1 h 30 g mąki', '1 h', 3600],
    ['1 h 2 jajka', '1 h', 3600],
    ['przez 1 h 3 razy mieszaj', '1 h', 3600],
    ['1 h 30 ml', '1 h', 3600],
    ['2 h 1 cup flour', '2 h', 7200],
    ['1 h 30%', '1 h', 3600],
  ])('a number followed by more text is not minutes: %p → only %p', (text, hourText, seconds) => {
    const matches = parseDurations(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe(hourText);
    expect(matches[0].seconds).toBe(seconds);
    expect(text.slice(matches[0].start, matches[0].end)).toBe(hourText);
  });

  it('a compound over 24 h yields no match at all (no tail fragment)', () => {
    expect(parseDurations('24 h 30 min')).toEqual([]);
    expect(parseDurations('Rest 24 h 30 min, then bake.')).toEqual([]);
  });
});

describe('parseDurations — word durations', () => {
  it.each([
    ['pół godziny', 1800],
    ['Półtorej godziny', 5400],
    ['half an hour', 1800],
    ['Half an hour', 1800],
  ])('%p → %p s', (text, seconds) => {
    expectWhole(text, seconds);
  });

  it('starts the match at "pół" in "przez pół godziny"', () => {
    expect(parseDurations('przez pół godziny')).toEqual([
      { start: 6, end: 17, text: 'pół godziny', seconds: 1800 },
    ]);
  });
});

describe('parseDurations — ranges use the lower bound', () => {
  it.each([
    ['20–25 min', 1200],
    ['20—25 min', 1200],
    ['20-25 minut', 1200],
    ['20 - 25 min', 1200],
    ['20 to 25 minutes', 1200],
    ['20 do 25 min', 1200],
    ['1-2 h', 3600],
    ['1,5-2 h', 5400],
    ['25-20 min', 1200],
  ])('%p → one match of %p s spanning the whole range', (text, seconds) => {
    expectWhole(text, seconds);
  });

  it('"do"/"to" before a single duration is not a range', () => {
    expect(parseDurations('Piecz do 25 min')).toEqual([
      { start: 9, end: 15, text: '25 min', seconds: 1500 },
    ]);
    expect(parseDurations('Reduce to 5 min')).toEqual([
      { start: 10, end: 15, text: '5 min', seconds: 300 },
    ]);
  });
});

describe('parseDurations — multiple matches and limits', () => {
  it('finds several durations in order and ignores temperatures', () => {
    const text = 'Rise 1 h, then bake 30–35 min at 220°C.';
    const matches = parseDurations(text);
    expect(matches.map((m) => [m.text, m.seconds])).toEqual([
      ['1 h', 3600],
      ['30–35 min', 1800],
    ]);
    for (const m of matches) {
      expect(text.slice(m.start, m.end)).toBe(m.text);
    }
    expect(matches[0].start).toBeLessThan(matches[1].start);
  });

  it('accepts exactly 24 hours', () => {
    expectWhole('24 h', 86400);
    expectWhole('1440 min', 86400);
  });
});

describe('parseDurations — negatives', () => {
  it.each([
    '',
    '220°C',
    '180 °C',
    'Bake at 200 degrees',
    '250 g flour',
    '2 l water',
    '500 ml',
    '10 szt.',
    '2 szklanki',
    '3 heaped spoons',
    'Step 3',
    'Bake 30',
    '20 to 25',
    '12:30',
    '0 min',
    '2 days',
    '3 dni',
    'leave overnight',
    'odstaw na noc',
    'przez noc',
    '25 h',
    '48 hours',
    '1500 min',
    '20-30 h',
    '23-25 h',
    '5 minutowy',
    'a 30-minute rest',
    // fractions must not parse their denominator ("1/2 h" is not "2 h")
    '1/2 godziny',
    '1/2 h',
    'Piecz 1/2 h',
    '3/4 h',
    '1 1/2 hours',
  ])('%p → no match', (text) => {
    expect(parseDurations(text)).toEqual([]);
  });
});

describe('splitDurationSegments', () => {
  it('splits text around a duration', () => {
    expect(splitDurationSegments('Bake 30 min until golden')).toEqual([
      { kind: 'text', text: 'Bake ' },
      { kind: 'duration', text: '30 min', seconds: 1800, start: 5 },
      { kind: 'text', text: ' until golden' },
    ]);
  });

  it('joined segment texts reproduce the input', () => {
    const input = 'Rise 1 h, then bake 30–35 min at 220°C.';
    const joined = splitDurationSegments(input)
      .map((s) => s.text)
      .join('');
    expect(joined).toBe(input);
  });

  it('returns a single text segment when there is no duration', () => {
    expect(splitDurationSegments('Mix well.')).toEqual([
      { kind: 'text', text: 'Mix well.' },
    ]);
  });

  it('emits no empty text segments for leading/trailing durations', () => {
    expect(splitDurationSegments('30 min')).toEqual([
      { kind: 'duration', text: '30 min', seconds: 1800, start: 0 },
    ]);
    const segs = splitDurationSegments('10 min then 5 min');
    expect(segs).toEqual([
      { kind: 'duration', text: '10 min', seconds: 600, start: 0 },
      { kind: 'text', text: ' then ' },
      { kind: 'duration', text: '5 min', seconds: 300, start: 12 },
    ]);
    for (const s of segs) expect(s.text).not.toBe('');
  });

  it('returns [] for an empty string', () => {
    expect(splitDurationSegments('')).toEqual([]);
  });
});

// Gaps found by mutation testing (docs/mutation-testing.md).
describe('parseDurations — boundaries and edge cases', () => {
  it('reads the digit 9 as a number', () => {
    expectWhole('9 min', 540);
  });

  it('matches the range and compound joiners case-insensitively', () => {
    expectWhole('20 TO 25 min', 1200);
    expectWhole('1 hour AND 30 minutes', 5400);
  });

  it('accepts a range whose upper bound is exactly 24 h', () => {
    expectWhole('20-24 h', 72000);
  });

  it('does not chain a compound part with the same or a larger unit', () => {
    expect(parseDurations('5 min 10 min').map((m) => m.text)).toEqual([
      '5 min',
      '10 min',
    ]);
    expect(parseDurations('5 min 2 h').map((m) => m.text)).toEqual([
      '5 min',
      '2 h',
    ]);
  });

  it('takes bare minutes 59 after an hour, but not 60', () => {
    expectWhole('1h59', 3600 + 59 * 60);
    expect(parseDurations('1h60')).toEqual([
      { start: 0, end: 2, text: '1h', seconds: 3600 },
    ]);
  });

  it('only takes bare minutes directly after the hour unit', () => {
    expect(parseDurations('Bake 2 h, then rest 15.')).toEqual([
      { start: 5, end: 8, text: '2 h', seconds: 7200 },
    ]);
  });

  it.each(['Rest .5 h', 'Rest ,5 h'])(
    '%p → no match (a decimal without its leading digit is not "5 h")',
    (text) => {
      expect(parseDurations(text)).toEqual([]);
    }
  );

  it('finds a number-less phrase mid-sentence after a non-letter', () => {
    expect(parseDurations('Rest (half an hour).')).toEqual([
      { start: 6, end: 18, text: 'half an hour', seconds: 1800 },
    ]);
  });

  it.each(['xhalf an hour', '2half an hour'])(
    '%p → no match (a phrase glued to a word or number)',
    (text) => {
      expect(parseDurations(text)).toEqual([]);
    }
  );
});
