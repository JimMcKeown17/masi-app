import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const MAX_LOGS = 2000;
const LOGS_KEY = '@app_logs';
const FLUSH_INTERVAL = 30000; // Flush to disk every 30 seconds
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // Keep one field-reporting week
const MAX_MESSAGE_LENGTH = 20000;

const makeSessionId = () => (
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
);

const serializeArg = (arg) => {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack}`;
  }

  if (arg !== null && typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      let type = typeof arg;
      try {
        type = arg.constructor?.name || type;
      } catch {}
      return `[unserializable: ${type}]`;
    }
  }

  return String(arg);
};

const utf8Size = text => {
  let bytes = 0;
  for (const char of text) { const cp = char.codePointAt(0); bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
  return bytes;
};
const bytePrefix = (text, limit) => {
  let bytes = 0; let end = 0;
  for (const char of text) { const n = utf8Size(char); if (bytes+n > limit) break; bytes += n; end += char.length; }
  return text.slice(0,end);
};

class Logger {
  constructor() {
    this.buffer = [];
    this.persisted = [];
    this.loaded = false;
    this.flushTimer = null;
    this.initPromise = null;
    this.consoleIntercepted = false;
    this.runtimeContext = null;
    this.breadcrumbSink = null;
    this.sessionId = makeSessionId();
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
    };
  }

  installConsoleInterceptor() {
    if (this.consoleIntercepted) return;
    this.consoleIntercepted = true;
    console.log = (...args) => {
      this.addLog('LOG', args);
      if (__DEV__) this.originalConsole.log(...args);
    };

    console.error = (...args) => {
      this.addLog('ERROR', args);
      if (__DEV__) this.originalConsole.error(...args);
    };

    console.warn = (...args) => {
      this.addLog('WARN', args);
      if (__DEV__) this.originalConsole.warn(...args);
    };
  }

  init({ runtimeContext, breadcrumbSink } = {}) {
    if (runtimeContext) this.setRuntimeContext(runtimeContext);
    if (breadcrumbSink) this.setBreadcrumbSink(breadcrumbSink);
    this.installConsoleInterceptor();

    if (this.initPromise) return this.initPromise;

    // Install capture synchronously, then hydrate older entries in the
    // background so startup logs are not missed while AsyncStorage is read.
    this.initPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
          this.persisted = Array.isArray(parsed)
            ? parsed.filter(log => log.timestamp >= cutoff)
            : [];
        }
      } catch {
        this.persisted = [];
      }
      this.loaded = true;
    })();

    // Flush periodically
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);

    // Flush when app goes to background
    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state.match(/inactive|background/)) {
        this.flush();
      }
    });

    return this.initPromise;
  }

  setRuntimeContext(runtimeContext) {
    this.runtimeContext = runtimeContext;
  }

  setBreadcrumbSink(breadcrumbSink) {
    this.breadcrumbSink = typeof breadcrumbSink === 'function' ? breadcrumbSink : null;
  }

  addLog(level, args) {
    const serialized = args.map(serializeArg).join(' ');
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      sessionId: this.sessionId,
      message: serialized.length > MAX_MESSAGE_LENGTH
        ? `${serialized.slice(0, MAX_MESSAGE_LENGTH)} [truncated]`
        : serialized,
    };
    this.buffer.push(entry);

    try {
      this.breadcrumbSink?.(entry);
    } catch {
      // Logging must never make the app less stable.
    }
  }

  async flush() {
    // Startup capture begins before AsyncStorage hydration completes. Wait for
    // that read before composing the first write, otherwise an early export or
    // background transition can overwrite the previous launch's logs.
    if (!this.loaded && this.initPromise) {
      await this.initPromise;
    }
    if (this.buffer.length === 0) return;

    const newEntries = this.buffer;
    this.buffer = [];
    try {
      // Build the next snapshot without mutating the last successfully
      // persisted snapshot. A failed disk write can then retry without
      // duplicating entries in memory.
      const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
      let nextPersisted = [...this.persisted, ...newEntries]
        .filter(log => log.timestamp >= cutoff);
      if (nextPersisted.length > MAX_LOGS) {
        nextPersisted = nextPersisted.slice(-MAX_LOGS);
      }

      await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(nextPersisted));
      this.persisted = nextPersisted;
    } catch {
      // Restore unsaved entries for a later attempt. Never use console here:
      // it is intercepted by this logger and would recurse.
      this.buffer.unshift(...newEntries);
    }
  }

  async tail({ maxBytes = 2*1024*1024, maxEntryBytes = 4096 } = {}) {
    if (!this.loaded && this.initPromise) await this.initPromise;
    const entries = []; let bytes = 2;
    // These arrays are already hydrated by normal logging. Do not flush or copy the history.
    for (const source of [this.buffer, this.persisted]) {
      for (let i = source.length-1; i >= 0 && entries.length < MAX_LOGS; i--) {
        const original = source[i];
        const entry = { ...original, message: bytePrefix(original.message, Math.max(0, maxEntryBytes-512)) };
        if (entry.message !== original.message) {
          entry.messageTruncated = true; entry.messageOriginalBytes = utf8Size(original.message);
        }
        // Escaping can expand JSON beyond the source byte budget.
        while (utf8Size(JSON.stringify(entry)) > maxEntryBytes && entry.message.length) {
          entry.message = bytePrefix(entry.message, Math.floor(utf8Size(entry.message)/2));
          entry.messageTruncated = true; entry.messageOriginalBytes = utf8Size(original.message);
        }
        const n = utf8Size(JSON.stringify(entry));
        if (n > maxEntryBytes || bytes+n+(entries.length ? 1 : 0) > maxBytes) return entries;
        bytes += n+(entries.length ? 1 : 0); entries.push(entry);
      }
    }
    return entries;
  }

  async getLogs() {
    // Flush any buffered entries first so export is complete
    await this.flush();
    return this.persisted;
  }

  async exportLogs() {
    const logs = await this.getLogs();
    const header = [
      'MASI DIAGNOSTIC LOG',
      `Exported at: ${new Date().toISOString()}`,
      `Launch session: ${this.sessionId}`,
      'Runtime context:',
      JSON.stringify(this.runtimeContext || { unavailable: true }, null, 2),
      '',
      'Log entries:',
    ].join('\n');
    const entries = logs.map(log =>
      `[${log.timestamp}] ${log.level}: ${log.message}`
    ).join('\n');
    return `${header}\n${entries}`;
  }

  async clearLogs() {
    this.buffer = [];
    this.persisted = [];
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify([]));
  }
}

export const logger = new Logger();
