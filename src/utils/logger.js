import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_LOGS = 1000;
const LOGS_KEY = '@app_logs';

class Logger {
  async init() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      this.addLog('LOG', args);
      originalLog(...args);
    };

    console.error = (...args) => {
      this.addLog('ERROR', args);
      originalError(...args);
    };

    console.warn = (...args) => {
      this.addLog('WARN', args);
      originalWarn(...args);
    };
  }

  async addLog(level, args) {
    try {
      const logs = await this.getLogs();
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
      };

      logs.push(logEntry);

      if (logs.length > MAX_LOGS) {
        logs.shift(); // Remove oldest
      }

      await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    } catch (error) {
      // Fail silently to avoid infinite loops
    }
  }

  async getLogs() {
    try {
      const logs = await AsyncStorage.getItem(LOGS_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch {
      return [];
    }
  }

  async exportLogs() {
    const logs = await this.getLogs();
    return logs.map(log =>
      `[${log.timestamp}] ${log.level}: ${log.message}`
    ).join('\n');
  }

  async clearLogs() {
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify([]));
  }
}

export const logger = new Logger();
