export const createSupabaseRequestQueue = () => {
  let tail = Promise.resolve();

  const enqueue = (task) => {
    const run = tail.catch(() => null).then(task);
    tail = run.catch(() => null);
    return run;
  };

  return { enqueue };
};

const defaultQueue = createSupabaseRequestQueue();

export const enqueueSupabaseRequest = (task) => defaultQueue.enqueue(task);
