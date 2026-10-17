export const AUTH_REQUEST_TIMEOUT_MS = 30_000;

// Bound the SDK's active request, not just a caller waiting on its promise. A
// non-cooperative transport may finish later, but its response never reaches SDK
// session persistence once this request has aborted.
export const authRequestFetch = async (input, init = {}) => {
  const controller = new AbortController();
  const callerSignal = init.signal ?? input?.signal;
  let timer;
  let abort;
  try {
    return await new Promise((resolve, reject) => {
      abort = () => {
        reject(new TypeError('Network request failed'));
        controller.abort();
      };
      callerSignal?.addEventListener('abort', abort);
      if (callerSignal?.aborted) { abort(); return; }
      timer = setTimeout(abort, AUTH_REQUEST_TIMEOUT_MS);
      Promise.resolve(fetch(input, { ...init, signal: controller.signal })).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
};
