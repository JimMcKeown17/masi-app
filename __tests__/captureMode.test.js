import {
  CAPTURE_MODES, DEFAULT_CAPTURE_MODE, isValidCaptureMode, resolveCaptureMode,
} from '../src/constants/egraConstants';

describe('capture mode constants', () => {
  test('exposes grid + sequential, defaulting to sequential', () => {
    expect(CAPTURE_MODES).toEqual({ GRID: 'grid', SEQUENTIAL: 'sequential' });
    expect(DEFAULT_CAPTURE_MODE).toBe('sequential');
  });

  test('isValidCaptureMode accepts only known modes', () => {
    expect(isValidCaptureMode('grid')).toBe(true);
    expect(isValidCaptureMode('sequential')).toBe(true);
    expect(isValidCaptureMode('nope')).toBe(false);
    expect(isValidCaptureMode(undefined)).toBe(false);
    expect(isValidCaptureMode(null)).toBe(false);
  });

  test('resolveCaptureMode honours precedence org > user > device > hardcoded default', () => {
    expect(resolveCaptureMode({ orgDefault: 'grid', userPref: 'sequential', deviceFallback: 'sequential' })).toBe('grid');
    expect(resolveCaptureMode({ userPref: 'grid', deviceFallback: 'sequential' })).toBe('grid');
    expect(resolveCaptureMode({ deviceFallback: 'grid' })).toBe('grid');
    expect(resolveCaptureMode({})).toBe('sequential');
    expect(resolveCaptureMode()).toBe('sequential');
    expect(resolveCaptureMode({ orgDefault: 'bogus', deviceFallback: 'grid' })).toBe('grid');
  });
});
