import { useEffect, useRef } from 'react';
import { useOffline } from '../context/OfflineContext';

// The letter tracker panel re-reads after a sync pass that sent letter_mastery corrections,
// so a superseded or refused tap never stays displayed (Assessment Results Plan 2). Not for
// the session tracker sheet: a re-read under its pending marks can undo a cancelling tap.
export default function useLetterMasterySyncRefresh(onRefresh) {
  const { lastSyncResult } = useOffline();
  const seen = useRef(lastSyncResult);
  useEffect(() => {
    if (lastSyncResult === seen.current) return;
    seen.current = lastSyncResult;
    if (lastSyncResult?.tableResults?.letter_mastery) onRefresh();
  }, [lastSyncResult, onRefresh]);
}
