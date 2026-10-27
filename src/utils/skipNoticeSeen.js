// Session-only acknowledgement: reopening the app may show an unfinished run's notice again.
const seenRunIds = new Set();

export const hasSeenSkipNotice = runId => seenRunIds.has(runId);
export const markSkipNoticeSeen = runId => { seenRunIds.add(runId); };
export const resetSkipNoticeSeen = () => { seenRunIds.clear(); };
