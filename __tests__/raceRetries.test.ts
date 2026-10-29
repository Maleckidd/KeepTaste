import { raceRetries } from '../utils/raceRetries';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const OPTS = { retryAfterMs: 1000, maxAttempts: 3, giveUpMs: 10000 };

// Lets pending promise callbacks run between timer advances.
const flush = () => new Promise((r) => jest.requireActual('timers').setImmediate(r));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('raceRetries', () => {
  it('resolves with the first attempt when it settles in time', async () => {
    const start = jest.fn(() => Promise.resolve('a'));
    await expect(raceRetries(start, OPTS)).resolves.toBe('a');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts another attempt alongside a stalled one', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const start = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const result = raceRetries(start, OPTS);

    jest.advanceTimersByTime(999);
    expect(start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(2);

    second.resolve('b');
    await expect(result).resolves.toBe('b');
  });

  it('still accepts the stalled attempt if it finishes first', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const start = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const result = raceRetries(start, OPTS);
    jest.advanceTimersByTime(1000);

    first.resolve('a');
    await expect(result).resolves.toBe('a');
  });

  it('never starts more than maxAttempts', async () => {
    const start = jest.fn(() => new Promise<string>(() => {}));
    const result = raceRetries(start, OPTS);
    jest.advanceTimersByTime(9999);
    expect(start).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(1);
    await expect(result).rejects.toThrow();
  });

  it('rejects after giveUpMs with nothing resolved', async () => {
    const start = jest.fn(() => new Promise<string>(() => {}));
    const result = raceRetries(start, OPTS);
    jest.advanceTimersByTime(10000);
    await expect(result).rejects.toThrow(/10000/);
  });

  it('retries at once after a rejection instead of waiting', async () => {
    const start = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(Promise.reject(new Error('boom')))
      .mockReturnValueOnce(Promise.resolve('b'));
    await expect(raceRetries(start, OPTS)).resolves.toBe('b');
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('rejects with the last error when every attempt rejects', async () => {
    let n = 0;
    const start = jest.fn(() => Promise.reject(new Error(`fail ${++n}`)));
    await expect(raceRetries(start, OPTS)).rejects.toThrow('fail 3');
    expect(start).toHaveBeenCalledTimes(3);
  });

  it('hands results arriving after the winner to discard', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const start = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const discard = jest.fn();
    const result = raceRetries(start, { ...OPTS, discard });
    jest.advanceTimersByTime(1000);

    second.resolve('b');
    await expect(result).resolves.toBe('b');
    first.resolve('a');
    await flush();
    expect(discard).toHaveBeenCalledWith('a');
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('discards a result that arrives after giving up', async () => {
    const first = deferred<string>();
    const start = jest.fn(() => first.promise);
    const discard = jest.fn();
    const result = raceRetries(start, { ...OPTS, maxAttempts: 1, discard });
    jest.advanceTimersByTime(10000);
    await expect(result).rejects.toThrow();
    first.resolve('late');
    await flush();
    expect(discard).toHaveBeenCalledWith('late');
  });

  it('starts no more attempts once settled', async () => {
    const start = jest.fn(() => Promise.resolve('a'));
    await raceRetries(start, OPTS);
    jest.advanceTimersByTime(20000);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
