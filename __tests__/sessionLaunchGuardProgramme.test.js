import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useSessionLaunchGuard } from '../src/hooks/useSessionLaunchGuard';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { getClockInStatusForUser, CLOCK_IN_STATUS } from '../src/utils/timeEntryStatus';

jest.mock('../src/services/activeProgrammeGate', () => ({
  getActiveProgrammeGate: jest.fn(),
}));
jest.mock('../src/utils/timeEntryStatus', () => ({
  CLOCK_IN_STATUS: { CLOCKED_IN: 'CLOCKED_IN', NOT_CLOCKED_IN: 'NOT_CLOCKED_IN' },
  getClockInStatusForUser: jest.fn(),
}));

describe('useSessionLaunchGuard — programme gate (covers every launch entry point)', () => {
  const navigate = jest.fn();
  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  const launch = async () => {
    const { result } = renderHook(() =>
      useSessionLaunchGuard({ navigation: { navigate }, userId: 'ea-1' })
    );
    await act(async () => {
      await result.current.requestSessionLaunch();
    });
  };

  test('no active programme → blocks launch, alerts, and never checks clock-in', async () => {
    getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });

    await launch();

    expect(navigate).not.toHaveBeenCalledWith('SessionForm');
    expect(getClockInStatusForUser).not.toHaveBeenCalled(); // gate short-circuits first
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  test('active programme + clocked in → proceeds straight to the session form', async () => {
    getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true, programme: { id: 'p1' } });
    getClockInStatusForUser.mockResolvedValue(CLOCK_IN_STATUS.CLOCKED_IN);

    await launch();

    expect(navigate).toHaveBeenCalledWith('SessionForm');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
