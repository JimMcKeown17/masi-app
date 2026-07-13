import { getDaysWorkedThisMonth } from '../src/utils/dashboardStats';

describe('dashboard stats local-day attribution', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('counts a 00:30 SAST clock-in on the first as part of the current month', () => {
    expect(getDaysWorkedThisMonth([{
      sign_in_time: '2026-06-30T22:30:00.000Z',
      sign_out_time: '2026-06-30T23:30:00.000Z',
    }])).toBe(1);
  });
});
