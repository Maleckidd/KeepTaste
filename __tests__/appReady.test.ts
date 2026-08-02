import {
  isAppReady,
  markAppReady,
  subscribeAppReady,
  resetAppReadyForTests,
} from '../utils/appReady';

describe('appReady signal', () => {
  beforeEach(() => {
    resetAppReadyForTests();
  });

  it('starts not ready', () => {
    expect(isAppReady()).toBe(false);
  });

  it('markAppReady flips the flag and notifies subscribers once', () => {
    const listener = jest.fn();
    subscribeAppReady(listener);

    markAppReady();
    expect(isAppReady()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // Idempotent — a second mark never re-notifies.
    markAppReady();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe prevents notification', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAppReady(listener);
    unsubscribe();

    markAppReady();
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribing after ready is a no-op (nothing left to wait for)', () => {
    markAppReady();
    const listener = jest.fn();
    const unsubscribe = subscribeAppReady(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('notifies multiple subscribers', () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeAppReady(a);
    subscribeAppReady(b);

    markAppReady();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
