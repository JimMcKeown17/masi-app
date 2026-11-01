jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/services/assessmentHistoryStatus', () => ({ ...jest.requireActual('../src/services/assessmentHistoryStatus'), useAssessmentHistoryStatus: jest.fn() }));
import { renderHook } from '@testing-library/react-native';
import { useOffline } from '../src/context/OfflineContext';
import { useAssessmentHistoryStatus } from '../src/services/assessmentHistoryStatus';
import useMasterySyncRefresh from '../src/hooks/useMasterySyncRefresh';
import useLetterMasterySyncRefresh from '../src/hooks/useLetterMasterySyncRefresh';
beforeEach(() => { useOffline.mockReturnValue({ lastSyncResult: null }); useAssessmentHistoryStatus.mockReturnValue({ pageVersion: 9 }); });
test('the letter tracker still refreshes on letter_mastery', () => {
  const refresh = jest.fn(); const s = renderHook(() => useLetterMasterySyncRefresh(refresh)); expect(refresh).not.toHaveBeenCalled();
  useOffline.mockReturnValue({ lastSyncResult: { tableResults: { letter_mastery: {} } } }); s.rerender(); expect(refresh).toHaveBeenCalledTimes(1);
  useAssessmentHistoryStatus.mockReturnValue({ pageVersion: 10 }); s.rerender(); expect(refresh).toHaveBeenCalledTimes(2);
});
test('skill_mastery refreshes only for its table and each new page', () => {
  const refresh = jest.fn(); const s = renderHook(() => useMasterySyncRefresh('skill_mastery', refresh));
  useOffline.mockReturnValue({ lastSyncResult: { tableResults: { letter_mastery: {} } } }); s.rerender(); expect(refresh).not.toHaveBeenCalled();
  useOffline.mockReturnValue({ lastSyncResult: { tableResults: { skill_mastery: {} } } }); s.rerender(); expect(refresh).toHaveBeenCalledTimes(1);
  s.rerender(); expect(refresh).toHaveBeenCalledTimes(1);
  useAssessmentHistoryStatus.mockReturnValue({ pageVersion: 10 }); s.rerender(); expect(refresh).toHaveBeenCalledTimes(2);
});
