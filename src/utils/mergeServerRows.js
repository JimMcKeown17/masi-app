import { hasUnpushedLocalChanges } from '../db/repositories/domainRepositoryUtils';

const isDirtyLocal = (row) => (
  row.synced === false
  || (row.sync_status && row.sync_status !== 'synced')
);

// UI-state pull merge. Must mirror the repository pull guard
// (serverPullWouldClobberPendingLocal) so React state agrees with what the
// repositories persisted:
// - id on server + any dirty signal (synced: false or pending/failed status) →
//   local wins, in the server row's position (ZZ F7: a pending edit must
//   survive the pull; the repository skipped the server row too). For terminal
//   rows this errs toward the local copy for one cycle — SQLite applies the
//   server row and state converges on the next storage reload.
// - id on server, local synced             → server row wins
// - id not on server, dirty local          → keep (new local row, not yet pushed)
// - id not on server, synced local         → drop (server no longer returns it)
//
// unpushedRows: the UNFILTERED dirty rows for the table (getUnsynced*). The
// cached list is an active-only read, so a row tombstoned offline (removed,
// archived, hidden, exited) is invisible in `cached` while the server still
// returns its id until the push lands. Those ids must suppress their server
// copy, or the pull visibly resurrects the item the user just removed.
export const mergeServerRows = (cached, serverRows, { unpushedRows = [] } = {}) => {
  const serverIds = new Set(serverRows.map(row => row.id));
  const cachedIds = new Set(cached.map(row => row.id));
  const localWinnersById = new Map(
    cached
      .filter(row => serverIds.has(row.id) && hasUnpushedLocalChanges(row))
      .map(row => [row.id, row])
  );
  const tombstonedIds = new Set(
    unpushedRows
      .filter(row => hasUnpushedLocalChanges(row) && !cachedIds.has(row.id))
      .map(row => row.id)
  );
  const mergedServerRows = serverRows
    .filter(row => !tombstonedIds.has(row.id))
    .map(row => localWinnersById.get(row.id) || row);
  const localToKeep = cached.filter(row => !serverIds.has(row.id) && isDirtyLocal(row));
  return [...mergedServerRows, ...localToKeep];
};
