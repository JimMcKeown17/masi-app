import { getClockInStatusForUser } from '../src/utils/timeEntryStatus';

const repository = {
  getActiveTimeEntry: jest.fn(),
};

describe('time entry status helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reports clocked out when there is no active time entry', async () => {
    repository.getActiveTimeEntry.mockResolvedValueOnce(null);

    await expect(getClockInStatusForUser('user-1', repository)).resolves.toBe('clocked_out');
    expect(repository.getActiveTimeEntry).toHaveBeenCalledWith('user-1');
  });

  test('reports clocked out without querying when the user id is missing', async () => {
    await expect(getClockInStatusForUser(null, repository)).resolves.toBe('clocked_out');
    expect(repository.getActiveTimeEntry).not.toHaveBeenCalled();
  });

  test('reports clocked in when the user has an active time entry', async () => {
    repository.getActiveTimeEntry.mockResolvedValueOnce({
      id: 'time-entry-1',
      user_id: 'user-1',
      sign_out_time: null,
    });

    await expect(getClockInStatusForUser('user-1', repository)).resolves.toBe('clocked_in');
  });
});
