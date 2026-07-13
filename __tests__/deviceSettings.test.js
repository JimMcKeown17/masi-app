import { localStateRepository } from '../src/db/repositories/localStateRepository';
import { deviceSettings } from '../src/services/deviceSettings';

jest.mock('../src/db/repositories/localStateRepository');

describe('deviceSettings', () => {
  beforeEach(() => {
    localStateRepository.set.mockResolvedValue(true);
    localStateRepository.remove.mockResolvedValue(true);
  });

  afterEach(() => jest.clearAllMocks());

  test('returns null when no user profile is stored', async () => {
    localStateRepository.get.mockResolvedValue(null);

    await expect(deviceSettings.getUserProfile()).resolves.toBeNull();
    expect(localStateRepository.get).toHaveBeenCalledWith('user_profile', null);
  });

  test('round-trips and clears the user profile under its existing key', async () => {
    const profile = { id: 'user-1', first_name: 'Nomsa' };
    localStateRepository.get.mockResolvedValue(profile);

    await expect(deviceSettings.saveUserProfile(profile)).resolves.toBe(true);
    expect(localStateRepository.set).toHaveBeenCalledWith('user_profile', profile);
    await expect(deviceSettings.getUserProfile()).resolves.toEqual(profile);
    await expect(deviceSettings.clearUserProfile()).resolves.toBe(true);
    expect(localStateRepository.remove).toHaveBeenCalledWith('user_profile');
  });

  test('resolves a valid stored capture mode', async () => {
    localStateRepository.get.mockResolvedValue('grid');

    await expect(deviceSettings.getCaptureMode()).resolves.toBe('grid');
    expect(localStateRepository.get).toHaveBeenCalledWith('assessment_capture_mode');
  });

  test('falls back to sequential when the stored capture mode is unset or invalid', async () => {
    localStateRepository.get.mockResolvedValueOnce(null).mockResolvedValueOnce('bogus');

    await expect(deviceSettings.getCaptureMode()).resolves.toBe('sequential');
    await expect(deviceSettings.getCaptureMode()).resolves.toBe('sequential');
  });

  test('validates and persists capture mode under its existing key', async () => {
    await expect(deviceSettings.setCaptureMode('bogus')).rejects.toThrow(/invalid capture mode/i);

    await expect(deviceSettings.setCaptureMode('sequential')).resolves.toBe(true);
    expect(localStateRepository.set).toHaveBeenCalledWith('assessment_capture_mode', 'sequential');
  });
});
