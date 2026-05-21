import { createSupabaseRequestQueue } from '../src/services/supabaseRequestQueue';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

describe('supabaseRequestQueue', () => {
  test('runs queued Supabase preload operations one at a time', async () => {
    const queue = createSupabaseRequestQueue();
    const firstGate = deferred();
    const events = [];

    const first = queue.enqueue(async () => {
      events.push('first-start');
      await firstGate.promise;
      events.push('first-end');
      return 'first';
    });
    const second = queue.enqueue(async () => {
      events.push('second-start');
      return 'second';
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first-start']);

    firstGate.resolve();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(events).toEqual(['first-start', 'first-end', 'second-start']);
  });

  test('continues running later requests after an earlier request fails', async () => {
    const queue = createSupabaseRequestQueue();
    const events = [];

    const first = queue.enqueue(async () => {
      events.push('first-start');
      throw new Error('network down');
    });
    const second = queue.enqueue(async () => {
      events.push('second-start');
      return 'second';
    });

    await expect(first).rejects.toThrow('network down');
    await expect(second).resolves.toBe('second');
    expect(events).toEqual(['first-start', 'second-start']);
  });
});
