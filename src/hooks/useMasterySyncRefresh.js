import { useEffect, useRef } from 'react';
import { useOffline } from '../context/OfflineContext';
import { useAssessmentHistoryStatus } from '../services/assessmentHistoryStatus';

// Immediate trackers re-read accepted state after corrections and committed pages.
// Deferred sheets keep their pending changes and do not subscribe here.
export default function useMasterySyncRefresh(tableName, onRefresh) {
  const { lastSyncResult } = useOffline();
  const seen = useRef(lastSyncResult);
  const { pageVersion } = useAssessmentHistoryStatus();
  const seenPage = useRef(pageVersion);
  useEffect(() => {
    if (lastSyncResult === seen.current) return;
    seen.current = lastSyncResult;
    if (lastSyncResult?.tableResults?.[tableName]) onRefresh();
  }, [lastSyncResult, tableName, onRefresh]);
  useEffect(() => {
    if (pageVersion === seenPage.current) return;
    seenPage.current = pageVersion;
    onRefresh();
  }, [pageVersion, onRefresh]);
}
