import { timeEntriesRepository } from '../db/repositories/timeEntriesRepository';

export const CLOCK_IN_STATUS = {
  CLOCKED_IN: 'clocked_in',
  CLOCKED_OUT: 'clocked_out',
};

export const getClockInStatusForUser = async (
  userId,
  repository = timeEntriesRepository
) => {
  if (!userId) return CLOCK_IN_STATUS.CLOCKED_OUT;

  const activeEntry = await repository.getActiveTimeEntry(userId);
  return activeEntry ? CLOCK_IN_STATUS.CLOCKED_IN : CLOCK_IN_STATUS.CLOCKED_OUT;
};
