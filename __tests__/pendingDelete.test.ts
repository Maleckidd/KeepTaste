import {
  pendingDeleteKey,
  schedulePendingDelete,
  isPendingDelete,
  cancelPendingDelete,
  commitPendingDelete,
  filterPendingDeletes,
  subscribePendingDeletes,
  __resetPendingDeletesForTests,
} from '../utils/pendingDelete';

beforeEach(() => {
  __resetPendingDeletesForTests();
});

describe('pendingDeleteKey', () => {
  it('builds a kind:id key', () => {
    expect(pendingDeleteKey('recipe', 7)).toBe('recipe:7');
    expect(pendingDeleteKey('cookbook', 1)).toBe('cookbook:1');
  });
});

describe('schedule / isPending / cancel / commit', () => {
  it('marks a key pending after scheduling', () => {
    schedulePendingDelete('recipe:1', () => {});
    expect(isPendingDelete('recipe:1')).toBe(true);
    expect(isPendingDelete('recipe:2')).toBe(false);
  });

  it('cancel removes the pending entry without committing', async () => {
    const commit = jest.fn();
    schedulePendingDelete('recipe:1', commit);
    expect(cancelPendingDelete('recipe:1')).toBe(true);
    expect(isPendingDelete('recipe:1')).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel returns false for unknown keys', () => {
    expect(cancelPendingDelete('recipe:99')).toBe(false);
  });

  it('commit runs the commit function exactly once and clears the entry', async () => {
    const commit = jest.fn();
    schedulePendingDelete('recipe:1', commit);
    await commitPendingDelete('recipe:1');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(isPendingDelete('recipe:1')).toBe(false);
    // Second commit is a no-op.
    await commitPendingDelete('recipe:1');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('commit awaits async commit functions', async () => {
    let done = false;
    schedulePendingDelete('recipe:1', async () => {
      await Promise.resolve();
      done = true;
    });
    await commitPendingDelete('recipe:1');
    expect(done).toBe(true);
  });

  it('re-scheduling the same key commits the previous entry first', async () => {
    const first = jest.fn();
    const second = jest.fn();
    schedulePendingDelete('recipe:1', first);
    schedulePendingDelete('recipe:1', second);
    // Old delete must not be silently dropped — it gets committed.
    expect(first).toHaveBeenCalledTimes(1);
    expect(isPendingDelete('recipe:1')).toBe(true);
    await commitPendingDelete('recipe:1');
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('filterPendingDeletes', () => {
  const items = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];

  it('hides items whose delete is pending', () => {
    schedulePendingDelete(pendingDeleteKey('recipe', 2), () => {});
    const visible = filterPendingDeletes(items, 'recipe', (i) => i.id);
    expect(visible.map((i) => i.id)).toEqual([1, 3]);
  });

  it('returns all items when nothing is pending', () => {
    expect(filterPendingDeletes(items, 'recipe', (i) => i.id)).toHaveLength(3);
  });

  it('only hides items of the matching kind', () => {
    schedulePendingDelete(pendingDeleteKey('cookbook', 2), () => {});
    expect(filterPendingDeletes(items, 'recipe', (i) => i.id)).toHaveLength(3);
  });
});

describe('subscribePendingDeletes', () => {
  it('notifies on schedule, cancel and commit', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribePendingDeletes(listener);
    schedulePendingDelete('recipe:1', () => {});
    expect(listener).toHaveBeenCalledTimes(1);
    cancelPendingDelete('recipe:1');
    expect(listener).toHaveBeenCalledTimes(2);
    schedulePendingDelete('recipe:2', () => {});
    await commitPendingDelete('recipe:2');
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    schedulePendingDelete('recipe:3', () => {});
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('commit errors do not break the registry', async () => {
    schedulePendingDelete('recipe:1', () => {
      throw new Error('boom');
    });
    await expect(commitPendingDelete('recipe:1')).resolves.toBeUndefined();
    expect(isPendingDelete('recipe:1')).toBe(false);
  });
});
