const mockNativeModule = jest.fn();
const mockPickerLoaded = jest.fn();
const mockLauncher = jest.fn();
const mockFileInfo = jest.fn();
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: (...args) => mockFileInfo(...args) }));
let mockMissingLauncher = false;
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: (...args) => mockNativeModule(...args),
}));
jest.mock('expo-image-picker', () => {
  mockPickerLoaded();
  return mockMissingLauncher ? {} : { launchImageLibraryAsync: mockLauncher };
});

test('native-null preflight never loads expo-image-picker JS', () => {
  mockNativeModule.mockReturnValue(null);
  jest.isolateModules(() => {
    const { availablePicker } = require('../src/utils/supportScreenshot');
    expect(availablePicker()).toBeNull();
  });
  expect(mockNativeModule).toHaveBeenCalledWith('ExponentImagePicker');
  expect(mockPickerLoaded).not.toHaveBeenCalled();
});

test('native-present loads picker JS once and checks that the launcher is usable', () => {
  mockNativeModule.mockReturnValue({});
  jest.isolateModules(() => {
    const { availablePicker } = require('../src/utils/supportScreenshot');
    expect(availablePicker().launchImageLibraryAsync).toBe(mockLauncher);
    expect(availablePicker().launchImageLibraryAsync).toBe(mockLauncher);
  });
  expect(mockPickerLoaded).toHaveBeenCalledTimes(1);
  mockMissingLauncher = true;
  jest.isolateModules(() => {
    const { availablePicker } = require('../src/utils/supportScreenshot');
    expect(availablePicker()).toBeNull();
  });
});

test('picker unavailability is a plain retryable attachment error', async () => {
  mockNativeModule.mockReturnValue(null);
  const { pickSupportScreenshot } = require('../src/utils/supportScreenshot');
  await expect(pickSupportScreenshot()).rejects.toThrow('Screenshots are unavailable in this app build. You can still send your report.');
  expect(mockLauncher).not.toHaveBeenCalled();
});

test.each([
  [{ uri: 'https://example.test/a.png', mimeType: 'image/png' }, { exists: true, size: 100 }],
  [{ uri: 'file:///private/a.gif', mimeType: 'image/gif' }, { exists: true, size: 100 }],
  [{ uri: 'file:///private/a.png', mimeType: 'image/png' }, { exists: false }],
  [{ uri: 'file:///private/a.png', mimeType: 'image/png' }, { exists: true }],
])('invalid or unreadable attachment metadata stays an error: %j', async (asset, info) => {
  mockLauncher.mockResolvedValue({ canceled: false, assets: [asset] });
  mockFileInfo.mockResolvedValue(info);
  const { pickSupportScreenshot } = require('../src/utils/supportScreenshot');
  await expect(pickSupportScreenshot()).rejects.toThrow('Choose a JPEG, PNG, HEIC or HEIF screenshot from your phone.');
});

test('a file over the 15 MB limit is refused before attachment', async () => {
  mockLauncher.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///private/large.png', mimeType: 'image/png' }] });
  mockFileInfo.mockResolvedValue({ exists: true, size: 15 * 1024 * 1024 + 1 });
  const { pickSupportScreenshot } = require('../src/utils/supportScreenshot');
  await expect(pickSupportScreenshot()).rejects.toThrow('Choose a screenshot of 15 MB or less.');
});

test('cancel returns no attachment', async () => {
  mockLauncher.mockResolvedValue({ canceled: true, assets: null });
  const { pickSupportScreenshot } = require('../src/utils/supportScreenshot');
  await expect(pickSupportScreenshot()).resolves.toBeNull();
  expect(mockFileInfo).not.toHaveBeenCalled();
});
beforeEach(() => {
  jest.clearAllMocks(); mockMissingLauncher = false;
  mockNativeModule.mockReturnValue({});
  mockFileInfo.mockResolvedValue({ exists: true, size: 1234 });
});

test.each([
  ['jpg', 'image/jpeg'], ['png', 'image/png'], ['heic', 'image/heic'], ['heif', 'image/heif'],
])('selects a single %s gallery image and preserves its original format and private URI', async (extension, mimeType) => {
  const uri = `file:///private/picker/screenshot.${extension}`;
  mockLauncher.mockResolvedValue({ canceled: false, assets: [{ uri, fileName: `screenshot.${extension}`, mimeType, fileSize: 1234 }] });
  const { pickSupportScreenshot } = require('../src/utils/supportScreenshot');
  expect(typeof pickSupportScreenshot).toBe('function');
  expect(await pickSupportScreenshot()).toEqual({ uri, extension, mimeType, fileSize: 1234 });
  expect(mockLauncher).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsEditing: false, quality: 0.5, allowsMultipleSelection: false });
});
