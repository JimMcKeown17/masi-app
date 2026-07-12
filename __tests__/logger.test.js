import { logger } from '../src/utils/logger';

describe('logger.addLog', () => {
  beforeEach(() => {
    logger.buffer = [];
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
});
