import { storage } from '../src/utils/storage';
import { localStateRepository } from '../src/db/repositories/localStateRepository';

jest.mock('../src/db/repositories/localStateRepository');

describe('storage capture mode', () => {
  afterEach(() => jest.clearAllMocks());

  test('getCaptureMode returns stored value when valid', async () => {
    localStateRepository.get.mockResolvedValue('grid');
    expect(await storage.getCaptureMode()).toBe('grid');
  });

  test('getCaptureMode falls back to the default (sequential) when unset/invalid', async () => {
    localStateRepository.get.mockResolvedValue(null);
    expect(await storage.getCaptureMode()).toBe('sequential');
    localStateRepository.get.mockResolvedValue('bogus');
    expect(await storage.getCaptureMode()).toBe('sequential');
  });

  test('setCaptureMode validates then persists under the device key', async () => {
    await storage.setCaptureMode('grid');
    expect(localStateRepository.set).toHaveBeenCalledWith('assessment_capture_mode', 'grid');
    await expect(storage.setCaptureMode('bogus')).rejects.toThrow(/invalid capture mode/i);
  });
});
