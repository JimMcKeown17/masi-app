// src/session/handleRequestQueue.js
import { StaleActorError } from './staleActor';

// One serial queue per signed-in EA handle (spec §5.3). The running task's token lets the
// fenced fetch mark exactly the task that tried to send (spec §5.2): tasks run one at a time,
// so the refusal cannot be attributed to the wrong task.
export const createHandleRequestQueue = ({ isOpen }) => {
  let tail = Promise.resolve();
  let running = null;

  const enqueue = (task) => {
    const run = tail.catch(() => null).then(async () => {
      if (!isOpen()) throw new StaleActorError();
      const token = { stale: false, markStale() { this.stale = true; } };
      running = token;
      let outcome;
      try {
        outcome = { value: await task() };
      } catch (error) {
        outcome = { error };
      } finally {
        running = null;
      }
      if (token.stale) throw new StaleActorError();
      if ('error' in outcome) throw outcome.error;
      return outcome.value;
    });
    tail = run.catch(() => null);
    return run;
  };

  return {
    enqueue,
    currentTask: () => running,
  };
};
