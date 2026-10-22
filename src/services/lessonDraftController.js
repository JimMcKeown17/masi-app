import { StaleActorError } from '../session/staleActor';

export class LessonDraftBusyError extends Error {
  constructor() { super('This lesson is busy.'); this.name = 'LessonDraftBusyError'; }
}
export class LessonDraftWriteError extends Error {
  constructor() { super("Couldn't save your last change."); this.name = 'LessonDraftWriteError'; }
}

// One owner per handle: screens attach to this view and never write a copied JSON field.
export const createLessonDraftController = ({ repositories, onClose }) => {
  const drafts = repositories.lessonDrafts;
  const listeners = new Set();
  const waiting = new Set();
  let generation = 0;
  let current = null;
  let closed = false;
  let locked = false;
  let tail = Promise.resolve();
  let snapshot = { status: 'empty', draft: null, error: null, existingDraftId: null };
  const assertOpen = () => { if (closed) throw new StaleActorError(); };
  const publish = values => {
    snapshot = { ...snapshot, ...values };
    for (const listener of listeners) listener();
  };
  const view = context => context.pending.reduce((row, entry) => ({
    ...row, ...entry.transition(row, ...entry.args),
  }), context.persisted);
  const isCurrent = context => !closed && current === context && context.generation === generation;
  const refresh = (context, values = {}) => {
    if (isCurrent(context)) publish({
      draft: view(context), status: locked ? 'saving' : context.persisted.id ? 'ready' : 'unsaved', ...values,
    });
  };
  // Closing rejects callers immediately, even if the native operation has not settled yet.
  const enqueue = task => {
    const run = tail.then(() => { assertOpen(); return task(); });
    tail = run.catch(() => {});
    return new Promise((resolve, reject) => {
      const cancel = () => reject(new StaleActorError());
      waiting.add(cancel);
      run.then(resolve, reject).finally(() => waiting.delete(cancel));
    });
  };
  const clear = () => {
    generation += 1;
    current = null;
    locked = false;
    publish({ status: 'empty', draft: null, error: null, existingDraftId: null });
  };
  const recordError = (context, error) => {
    if (!isCurrent(context)) return;
    const status = error?.name === 'LessonDraftExistsError' ? 'exists'
      : error?.name === 'LessonDraftCorruptError' ? 'corrupt' : null;
    refresh(context, { error: "Couldn't save your last change.",
      ...(status ? { status, existingDraftId: error.draftId } : {}) });
  };
  const createIfNeeded = async context => {
    if (context.persisted.id) return context.persisted;
    const row = await drafts.create(context.persisted);
    context.persisted = row;
    if (isCurrent(context)) context.generation = ++generation;
    refresh(context, { error: null });
    return row;
  };
  const open = options => {
    try {
      assertOpen();
      const key = options.start ? JSON.stringify(options.start) : null;
      if (current && (options.draftId && (current.persisted?.id ?? current.id) === options.draftId
        || key && current.key === key)) return Promise.resolve(snapshot.draft);
      if (locked) throw new LessonDraftBusyError();
      const context = { generation: ++generation, id: options.draftId, key, pending: [], failed: false,
        persisted: options.start ?? null };
      current = context;
      publish({ status: options.start ? 'unsaved' : 'loading', draft: options.start ?? null,
        error: null, existingDraftId: null });
      return enqueue(async () => {
        if (options.start) return isCurrent(context) ? view(context) : snapshot.draft;
        try {
          const row = await drafts.getActive();
          if (!isCurrent(context)) return snapshot.draft;
          context.persisted = row?.id === options.draftId ? row : null;
          if (!context.persisted) {
            publish({ status: 'missing', draft: null });
            return null;
          }
          refresh(context);
          return snapshot.draft;
        } catch (error) {
          if (!isCurrent(context)) return snapshot.draft;
          if (error?.name !== 'LessonDraftCorruptError') throw error;
          context.id = error.draftId;
          publish({ status: 'corrupt', draft: null, error, existingDraftId: error.draftId });
          return null;
        }
      });
    } catch (error) { return Promise.reject(error); }
  };
  const apply = (transition, ...args) => {
    try {
      assertOpen();
      if (locked) throw new LessonDraftBusyError();
      if (!current?.persisted) throw new Error('No lesson is open');
      const context = current;
      const entry = { transition, args: JSON.parse(JSON.stringify(args)) };
      // Validate the pure transition before admitting it to the queue.
      transition(view(context), ...entry.args);
      context.pending.push(entry);
      refresh(context);
      return enqueue(async () => {
        let succeeded = false;
        try {
          const patch = transition(context.persisted, ...entry.args);
          const row = context.persisted.id
            ? await drafts.update(context.persisted.id, patch)
            : await drafts.create({ ...context.persisted, ...patch });
          if (!context.persisted.id && isCurrent(context)) context.generation = ++generation;
          context.persisted = row;
          succeeded = true;
          return row;
        } catch (error) {
          context.failed = true;
          recordError(context, error);
          throw error;
        } finally {
          context.pending = context.pending.filter(item => item !== entry);
          // Rebase every remaining transition on the confirmed row, including after failure.
          if (succeeded || !['exists', 'corrupt'].includes(snapshot.status)) refresh(context, succeeded ? { error: null } : {});
          else if (isCurrent(context)) publish({ draft: view(context) });
        }
      });
    } catch (error) { return Promise.reject(error); }
  };
  const ensureDraft = () => {
    try {
      assertOpen();
      if (locked) throw new LessonDraftBusyError();
      if (!current?.persisted) throw new Error('No lesson is open');
      const context = current;
      return enqueue(async () => {
        try { const row = await createIfNeeded(context); refresh(context); return row; }
        catch (error) { recordError(context, error); throw error; }
      });
    } catch (error) { return Promise.reject(error); }
  };
  const beginSave = () => {
    try {
      assertOpen();
      if (locked) throw new LessonDraftBusyError();
      if (!current?.persisted) throw new Error('No lesson is open');
      const context = current;
      locked = true;
      refresh(context);
      return enqueue(async () => {
        try {
          if (context.failed) { context.failed = false; throw new LessonDraftWriteError(); }
          const row = await createIfNeeded(context);
          refresh(context);
          return row;
        } catch (error) {
          locked = false;
          refresh(context);
          throw error;
        }
      });
    } catch (error) { return Promise.reject(error); }
  };
  const endSave = ({ saved }) => {
    assertOpen();
    if (saved) clear();
    else { locked = false; if (current?.persisted) refresh(current); }
  };
  const discard = () => {
    try {
      assertOpen();
      const context = current;
      const discardGeneration = ++generation;
      locked = true;
      publish({ status: 'loading' });
      return enqueue(async () => {
        const id = context?.persisted?.id ?? context?.id ?? snapshot.existingDraftId;
        if (id) await drafts.discard(id);
        if (!closed && generation === discardGeneration) clear();
      }).catch(error => {
        if (!closed && generation === discardGeneration) {
          locked = false;
          if (context) { context.generation = generation; refresh(context, { error }); }
        }
        throw error;
      });
    } catch (error) { return Promise.reject(error); }
  };
  onClose(() => {
    closed = true;
    generation += 1;
    current = null;
    for (const cancel of waiting) cancel();
    waiting.clear();
    publish({ status: 'closed', draft: null, error: null, existingDraftId: null });
    listeners.clear();
  });
  return {
    open, apply, ensureDraft, beginSave, endSave, discard,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
  };
};
