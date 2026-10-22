import { useEffect, useRef } from 'react';
import { useOffline } from '../context/OfflineContext';
import { useAssessmentHistoryStatus } from '../services/assessmentHistoryStatus';

// The letter tracker panel re-reads after a sync pass that sent letter_mastery corrections,
// and after committed history pages, so accepted state is re-read (AR Plans 2–3). Not for
// the session tracker sheet: a re-read under its pending marks can undo a cancelling tap.
export default function useLetterMasterySyncRefresh(onRefresh) {
  const { lastSyncResult } = useOffline();
  const seen = useRef(lastSyncResult);
  const { pageVersion } = useAssessmentHistoryStatus();
  const seenPage = useRef(pageVersion);
  useEffect(() => {
    if (lastSyncResult === seen.current) return;
    seen.current = lastSyncResult;
    if (lastSyncResult?.tableResults?.letter_mastery) onRefresh();
  }, [lastSyncResult, onRefresh]);
  useEffect(() => {
    if (pageVersion === seenPage.current) return;
    seenPage.current = pageVersion;
    onRefresh();
  }, [pageVersion, onRefresh]);
}
