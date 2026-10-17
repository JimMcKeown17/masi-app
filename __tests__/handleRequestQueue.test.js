global.__MASI_NO_DEFAULT_HANDLE__ = true;
// __tests__/handleRequestQueue.test.js
import { createHandleRequestQueue } from '../src/session/handleRequestQueue';
import { StaleActorError, isStaleActorError } from '../src/session/staleActor';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('handle request queue', () => {
  test('runs tasks one at a time in order', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    const events = [];
    const first = deferred();
    const aStarted = deferred();
    const a = queue.enqueue(async () => { events.push('a:start'); aStarted.resolve(); await first.promise; events.push('a:end'); return 'a'; });
    const b = queue.enqueue(async () => { events.push('b:start'); return 'b'; });
    // Wait on an explicit barrier, never on a microtask count.
    await aStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['a:start']);
    first.resolve();
    await expect(a).resolves.toBe('a');
    await expect(b).resolves.toBe('b');
    expect(events).toEqual(['a:start', 'a:end', 'b:start']);
  });

  test('a rejected task does not block the next one', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    const failed = queue.enqueue(async () => { throw new Error('boom'); });
    const next = queue.enqueue(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  test('currentTask is null outside a task and set inside one', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    expect(queue.currentTask()).toBeNull();
    let seen = null;
    await queue.enqueue(async () => { seen = queue.currentTask(); });
    expect(seen).not.toBeNull();
    expect(queue.currentTask()).toBeNull();
  });

  test('a stale-marked task rejects with StaleActorError whatever it returned', async () => {
    const queue = createHandleRequestQueue({ isOpen: () => true });
    const result = queue.enqueue(async () => {
      queue.currentTask().markStale();
      return { data: null, error: { code: '', message: 'TypeError: Network request failed' } };
    });
    let caught = null;
    try { await result; } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(StaleActorError);
    expect(isStaleActorError(caught)).toBe(true);
  });

  test('a task enqueued after the handle closed is refused without running', async () => {
    let open = true;
    const queue = createHandleRequestQueue({ isOpen: () => open });
    open = false;
    const ran = jest.fn();
    let caught = null;
    try { await queue.enqueue(async () => { ran(); }); } catch (error) { caught = error; }
    expect(ran).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(StaleActorError);
  });

  test('a task waiting behind a running one is refused if the handle closes first', async () => {
    let open = true;
    const queue = createHandleRequestQueue({ isOpen: () => open });
    const gate = deferred();
    const first = queue.enqueue(async () => { await gate.promise; });
    const ran = jest.fn();
    const second = queue.enqueue(async () => { ran(); });
    open = false;
    gate.resolve();
    await first.catch(() => {});
    let caught = null;
    try { await second; } catch (error) { caught = error; }
    expect(ran).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(StaleActorError);
  });
});
