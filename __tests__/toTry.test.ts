// TDD red phase for the pure to-try partition helper (SPEC.md §5.19).
// utils/toTry.ts does not exist yet — this suite fails to resolve until the
// Coder adds it. The helper is fed a list already sorted updated_at-desc and
// must partition (not re-sort) it into a leading "normal" bucket and a trailing
// "to try" bucket, preserving the input order within each.
import { partitionToTry, countToTry } from '../utils/toTry';

type Row = { id: number; toTry: number };

function row(id: number, toTry: number): Row {
  return { id, toTry };
}

describe('partitionToTry', () => {
  it('returns two empty buckets for empty input', () => {
    expect(partitionToTry([])).toEqual({ normal: [], toTry: [] });
  });

  it('puts every row in normal when none are to-try', () => {
    const rows = [row(1, 0), row(2, 0), row(3, 0)];
    const { normal, toTry } = partitionToTry(rows);
    expect(normal.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(toTry).toEqual([]);
  });

  it('puts every row in toTry when all are to-try', () => {
    const rows = [row(1, 1), row(2, 1), row(3, 1)];
    const { normal, toTry } = partitionToTry(rows);
    expect(normal).toEqual([]);
    expect(toTry.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('splits a mixed list, preserving the relative (updated_at-desc) order in both buckets', () => {
    // Input already sorted updated_at desc: ids 5,4,3,2,1.
    const rows = [row(5, 0), row(4, 1), row(3, 0), row(2, 1), row(1, 0)];
    const { normal, toTry } = partitionToTry(rows);
    expect(normal.map((r) => r.id)).toEqual([5, 3, 1]);
    expect(toTry.map((r) => r.id)).toEqual([4, 2]);
  });

  it('treats toTry 1 as to-try and 0 as normal', () => {
    const { normal, toTry } = partitionToTry([row(1, 1), row(2, 0)]);
    expect(normal.map((r) => r.id)).toEqual([2]);
    expect(toTry.map((r) => r.id)).toEqual([1]);
  });

  it('does not mutate the input array', () => {
    const rows = [row(1, 1), row(2, 0)];
    const snapshot = rows.map((r) => ({ ...r }));
    partitionToTry(rows);
    expect(rows).toEqual(snapshot);
  });
});

describe('countToTry', () => {
  it('is 0 for empty input', () => {
    expect(countToTry([])).toBe(0);
  });

  it('counts only the to-try rows', () => {
    expect(countToTry([row(1, 1), row(2, 0), row(3, 1), row(4, 0)])).toBe(2);
  });

  it('is 0 when nothing is to-try', () => {
    expect(countToTry([row(1, 0), row(2, 0)])).toBe(0);
  });
});
