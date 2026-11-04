// Duration detection in recipe Instructions for cooking-timer chips
// (SPEC.md §5.21). Pure: no react-native / expo imports.
//
// Hermes-safe on purpose: no regex lookbehind, no `u` flag / \p{…}. The
// "not preceded by" boundary is checked in code; the "not followed by a
// letter" boundary is a lookahead, which Hermes supports.

export type DurationMatch = {
  start: number;
  /** Exclusive. */
  end: number;
  text: string;
  seconds: number;
};

export type DurationSegment =
  | { kind: 'text'; text: string }
  | { kind: 'duration'; text: string; seconds: number; start: number };

/** Longest timer we offer — anything longer is a rest/proof, not a timer. */
const MAX_SECONDS = 24 * 60 * 60;

// Unit spellings (EN + PL), roughly longest-first. The dot is part of the unit
// only for the Polish abbreviations "godz." and "sek." — "30 min." keeps its
// sentence-ending period outside the match.
const HOUR = 'hours|hour|hrs|hr|godziny|godzinę|godzina|godzin|godz\\.?|h';
const MINUTE = 'minutes|minute|minuty|minutę|minuta|minut|mins|min';
const SECOND = 'seconds|second|secs|sec|sekundy|sekundę|sekunda|sekund|sek\\.?|s';

/** Letters that may not directly follow a unit ("5 minutowy", "3 heaped"). */
const LETTER = 'A-Za-z\\u00C0-\\u024F';

const NUMBER_SRC = '(\\d+(?:[.,]\\d+)?)';
const NUMBER_RE = new RegExp(`^${NUMBER_SRC}`);
// Optional whitespace, then a unit not followed by a letter.
const UNIT_RE = new RegExp(
  `^\\s*(?:(${HOUR})|(${MINUTE})|(${SECOND}))(?![${LETTER}])`,
  'i'
);
// A range joiner plus the upper (or second) bound: "20–25", "20 - 25", "20 to 25".
const RANGE_RE = new RegExp(`^(?:\\s*[-\\u2013\\u2014]\\s*|\\s+(?:to|do)\\s+)${NUMBER_SRC}`, 'i');
// The next part of a compound duration: "1 h 30 min", "1h30min", "1 hour and
// 30 minutes". No whitespace is needed — a unit can't be followed by a letter.
const COMPOUND_RE = new RegExp(`^\\s*(?:(?:and|i)\\s+)?${NUMBER_SRC}`, 'i');
// Bare minutes right after an hour unit: "1h30", "1h05", "1 godz. 30". Exactly
// two digits, then only optional whitespace and the end of the text or
// sentence punctuation — anything else ("1 h 30 g mąki", "1 h 2 jajka",
// "1 h 30%", "1 h 30–35 min") is a quantity or a range, so the match stays the
// hour part. "1h30 potem studź" → "1h" is an accepted false negative.
const BARE_MINUTES_RE = /^\s*(\d{2})(?=\s*(?:$|[;!?)]|[.,](?!\d)))/;
// Number-less phrases.
const WORD_RE = new RegExp(
  `^(?:(półtorej|półtora|pół)\\s+godziny|(half)\\s+an\\s+hour)(?![${LETTER}])`,
  'i'
);

const LETTER_CHAR = new RegExp(`[${LETTER}]`);

/** Unit multipliers by UNIT_RE capture group: 1 = hour, 2 = minute, 3 = second. */
const UNIT_SECONDS = [0, 3600, 60, 1] as const;

function toNumber(raw: string): number {
  return Number(raw.replace(',', '.'));
}

/** Matches a unit at the start of `s`; returns its size class and match length. */
function matchUnit(s: string): { mult: number; length: number } | null {
  const m = UNIT_RE.exec(s);
  if (!m) return null;
  const group = m[1] !== undefined ? 1 : m[2] !== undefined ? 2 : 3;
  return { mult: UNIT_SECONDS[group], length: m[0].length };
}

function valid(seconds: number): boolean {
  return seconds > 0 && seconds <= MAX_SECONDS;
}

/**
 * Tries a number-led duration (single, range, or compound) at the start of
 * `s`. `seconds: null` means "a duration, but out of limits": the caller skips
 * the whole span, so "24 h 30 min" never leaves a "30 min" tail fragment.
 */
function parseNumberLed(s: string): { length: number; seconds: number | null } | null {
  const first = NUMBER_RE.exec(s);
  if (!first) return null;
  const n1 = toNumber(first[1]);
  let pos = first[0].length;

  // Range: "20–25 min" → lower bound, whole range text. Both bounds must be in
  // limits ("20-30 h" is not a timer). Without a unit it is not a range.
  const range = RANGE_RE.exec(s.slice(pos));
  if (range) {
    const afterRange = pos + range[0].length;
    const unit = matchUnit(s.slice(afterRange));
    if (unit) {
      const a = n1 * unit.mult;
      const b = toNumber(range[1]) * unit.mult;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const length = afterRange + unit.length;
      if (!valid(lo) || hi > MAX_SECONDS) return { length, seconds: null };
      return { length, seconds: Math.round(lo) };
    }
  }

  const unit = matchUnit(s.slice(pos));
  if (!unit) return null;
  let total = n1 * unit.mult;
  pos += unit.length;
  let lastMult = unit.mult;

  // Compound: each further part must use a strictly smaller unit.
  for (;;) {
    const next = COMPOUND_RE.exec(s.slice(pos));
    const nextUnit = next ? matchUnit(s.slice(pos + next[0].length)) : null;
    if (next && nextUnit && nextUnit.mult < lastMult) {
      total += toNumber(next[1]) * nextUnit.mult;
      pos += next[0].length + nextUnit.length;
      lastMult = nextUnit.mult;
      continue;
    }
    // "1h30": two bare digits (00–59) closing the phrase after hours = minutes.
    if (lastMult === UNIT_SECONDS[1]) {
      const bare = BARE_MINUTES_RE.exec(s.slice(pos));
      const minutes = bare ? Number(bare[1]) : 0;
      if (bare && minutes <= 59) {
        total += minutes * 60;
        pos += bare[0].length;
      }
    }
    break;
  }

  const seconds = Math.round(total);
  return { length: pos, seconds: valid(seconds) ? seconds : null };
}

function parseWord(s: string): { length: number; seconds: number } | null {
  const m = WORD_RE.exec(s);
  if (!m) return null;
  const word = (m[1] ?? m[2]).toLowerCase();
  const seconds = word === 'pół' || word === 'half' ? 1800 : 5400;
  return { length: m[0].length, seconds };
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Finds cooking durations in a piece of Instructions text, sorted by start and
 * non-overlapping. Ranges resolve to their lower bound; compounds sum up.
 * Rejects 0 and anything over 24 h.
 */
export function parseDurations(text: string): DurationMatch[] {
  const matches: DurationMatch[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    let found: { length: number; seconds: number | null } | null = null;
    if (isDigit(ch)) {
      // Not mid-number ("1500", "1.5"), not a fraction's denominator ("1/2 h"
      // must not read as "2 h") and not glued to a word ("x30 min").
      const boundary =
        prev === '' ||
        !(
          isDigit(prev) ||
          prev === '.' ||
          prev === ',' ||
          prev === '/' ||
          LETTER_CHAR.test(prev)
        );
      if (boundary) found = parseNumberLed(text.slice(i));
    } else if (/[phPH]/.test(ch)) {
      const boundary = prev === '' || !(isDigit(prev) || LETTER_CHAR.test(prev));
      if (boundary) found = parseWord(text.slice(i));
    }
    if (found && found.seconds === null) {
      // Out of limits — skip the whole span, never match a fragment of it.
      i += found.length;
    } else if (found && found.seconds !== null) {
      matches.push({
        start: i,
        end: i + found.length,
        text: text.slice(i, i + found.length),
        seconds: found.seconds,
      });
      i += found.length;
    } else {
      i += 1;
    }
  }
  return matches;
}

/**
 * Splits text into plain-text and duration segments for rendering chips. The
 * joined segment texts reproduce the input; no empty text segments.
 */
export function splitDurationSegments(text: string): DurationSegment[] {
  const segments: DurationSegment[] = [];
  let cursor = 0;
  for (const m of parseDurations(text)) {
    if (m.start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, m.start) });
    }
    segments.push({ kind: 'duration', text: m.text, seconds: m.seconds, start: m.start });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}
