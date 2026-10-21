global.__MASI_NO_DEFAULT_HANDLE__ = true;

jest.mock('expo-updates', () => ({ channel: null }));
import { getContentDiagnostics } from '../src/lessonPlan/packs/contentDiagnostics';

test('reports the release packs and a clean self-check in a normal build', () => {
  expect(getContentDiagnostics()).toEqual({
    previewContentAllowed: false,
    currentPacks: { xh: 'isixhosa-interim-letters-v1', en: 'english-interim-letters-v1', af: 'afrikaans-interim-letters-v1' },
    bundledPackIds: expect.arrayContaining(['isixhosa-candidates-preview-v1', 'english-interim-letters-v1']),
    decodabilitySelfCheck: { vectorVersion: 1, passed: 72, failed: [] },
  });
});

test('a developer build reports the isiXhosa preview pack', () => {
  expect(getContentDiagnostics({ allowPreview: true }).currentPacks.xh).toBe('isixhosa-candidates-preview-v1');
});

test('returns { error } instead of throwing', () => {
  jest.doMock('../src/utils/decodability/index.js', () => ({
    ...jest.requireActual('../src/utils/decodability/index.js'),
    analyzeToken: () => { throw new Error('checker failed'); },
  }));
  try {
    jest.isolateModules(() => {
      const diagnostics = require('../src/lessonPlan/packs/contentDiagnostics');
      expect(diagnostics.getContentDiagnostics()).toEqual({ error: 'Error: checker failed' });
    });
  } finally {
    jest.dontMock('../src/utils/decodability/index.js');
  }
});

test('null options return an error instead of throwing before the error boundary', () => {
  expect(getContentDiagnostics(null)).toEqual({ error: expect.any(String) });
});

test('self-check counts and labels normalization, step and sound mismatches', () => {
  jest.doMock('../src/utils/decodability/index.js', () => {
    const actual = jest.requireActual('../src/utils/decodability/index.js');
    return {
      ...actual,
      normalizeToken: raw => raw === 'Molo,' ? 'wrong' : actual.normalizeToken(raw),
      analyzeToken: (token, sequence) => {
        const result = actual.analyzeToken(token, sequence);
        if (token === 'tshisa') return { ...result, step: -1 };
        if (token === 'indlu') return { ...result, sounds: [] };
        return result;
      },
    };
  });
  try {
    jest.isolateModules(() => {
      const diagnostics = require('../src/lessonPlan/packs/contentDiagnostics');
      expect(diagnostics.getContentDiagnostics().decodabilitySelfCheck).toEqual({
        vectorVersion: 1, passed: 69, failed: ['normalize:Molo,', 'token:tshisa', 'token:indlu'],
      });
    });
  } finally {
    jest.dontMock('../src/utils/decodability/index.js');
  }
});
