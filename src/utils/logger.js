import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const MAX_LOGS = 1000;
const LOGS_KEY = '@app_logs';
const FLUSH_INTERVAL = 30000; // Flush to disk every 30 seconds
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // Drop logs older than 48 hours

class Logger {
  constructor() {
    this.buffer = [];
    this.persisted = [];
    this.loaded = false;
    this.flushTimer = null;
  }

  async init() {
    // Load existing logs from disk once at startup
    try {
      const stored = await AsyncStorage.getItem(LOGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Prune anything older than 48 hours
        const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
        this.persisted = parsed.filter(log => log.timestamp >= cutoff);
      }
    } catch {
      this.persisted = [];
    }
    this.loaded = true;

    // Intercept console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      this.addLog('LOG', args);
      if (__DEV__) originalLog(...args);
    };

    console.error = (...args) => {
      this.addLog('ERROR', args);
      if (__DEV__) originalError(...args);
    };

    console.warn = (...args) => {
      this.addLog('WARN', args);
      if (__DEV__) originalWarn(...args);
    };

    // Flush periodically
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);

    // Flush when app goes to background
    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state.match(/inactive|background/)) {
        this.flush();
      }
    });
  }

  addLog(level, args) {
    this.buffer.push({
      timestamp: new Date().toISOString(),
      level,
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
    });
  }

  async flush() {
    if (this.buffer.length === 0) return;

    try {
      // Move buffer entries to persisted list
      const newEntries = this.buffer;
      this.buffer = [];
      this.persisted.push(...newEntries);

      // Prune old entries (> 48 hours) and cap at MAX_LOGS
      const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
      this.persisted = this.persisted.filter(log => log.timestamp >= cutoff);
      if (this.persisted.length > MAX_LOGS) {
        this.persisted = this.persisted.slice(-MAX_LOGS);
      }

      await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(this.persisted));
    } catch {
      // Fail silently to avoid infinite loops
    }
  }

  async getLogs() {
    // Flush any buffered entries first so export is complete
    await this.flush();
    return this.persisted;
  }

  async exportLogs() {
    const logs = await this.getLogs();
    return logs.map(log =>
      `[${log.timestamp}] ${log.level}: ${log.message}`
    ).join('\n');
  }

  async clearLogs() {
    this.buffer = [];
    this.persisted = [];
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify([]));
  }
}

export const logger = new Logger();
