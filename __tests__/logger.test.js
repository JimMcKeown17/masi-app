import { logger } from '../src/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('logger.addLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logger.buffer = [];
    logger.persisted = [];
    logger.loaded = true;
    logger.initPromise = null;
    logger.setRuntimeContext(null);
  });

  test('preserves Error message and stack', () => {
    logger.addLog('ERROR', ['App crashed:', new Error('boom')]);

    expect(logger.buffer[0].message).toContain('boom');
    expect(logger.buffer[0].message).toContain('Error');
    expect(logger.buffer[0].message).toContain('at ');
  });

  test('never throws on circular objects', () => {
    const circular = {};
    circular.self = circular;

    expect(() => logger.addLog('LOG', [circular])).not.toThrow();
    expect(logger.buffer[0].message).toContain('[unserializable');
  });

  test('null still logs as "null"', () => {
    logger.addLog('LOG', [null]);

    expect(logger.buffer[0].message).toBe('null');
  });

  test('plain objects unchanged', () => {
    logger.addLog('LOG', [{ a: 1 }]);

    expect(logger.buffer[0].message).toBe('{"a":1}');
  });

  test('exports a diagnostic header and launch session id before log entries', async () => {
    logger.setRuntimeContext({
      application: { version: '1.2.0', build: '47' },
      device: { modelName: 'Pixel 8a', osVersion: '15' },
      backend: { projectId: 'segygjzpujphwvrubusm' },
    });
    logger.addLog('WARN', ['sync stalled']);

    const exported = await logger.exportLogs();

    expect(exported).toContain('MASI DIAGNOSTIC LOG');
    expect(exported).toContain('Launch session:');
    expect(exported).toContain('"build": "47"');
    expect(exported).toContain('"modelName": "Pixel 8a"');
    expect(exported).toContain('WARN: sync stalled');
  });

  test('waits for stored-log hydration before flushing startup logs', async () => {
    let resolveHydration;
    logger.loaded = false;
    logger.initPromise = new Promise((resolve) => {
      resolveHydration = resolve;
    });
    logger.addLog('WARN', ['startup sync warning']);

    const logsPromise = logger.getLogs();
    await Promise.resolve();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    const storedEntry = {
      timestamp: new Date().toISOString(),
      level: 'LOG',
      sessionId: 'previous-launch',
      message: 'previous field log',
    };
    logger.persisted = [storedEntry];
    logger.loaded = true;
    resolveHydration();

    await expect(logsPromise).resolves.toEqual([
      storedEntry,
      expect.objectContaining({ message: 'startup sync warning' }),
    ]);
  });
});
