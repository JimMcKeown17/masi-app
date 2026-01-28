import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  TIME_ENTRIES: '@time_entries',
  SESSIONS: '@sessions',
  CHILDREN: '@children',
  GROUPS: '@groups',
  SYNC_QUEUE: '@sync_queue',
  SYNC_META: '@sync_meta',
  USER_PROFILE: '@user_profile',
};

export const storage = {
  // Generic get/set
  async getItem(key) {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting ${key}:`, error);
      return null;
    }
  },

  async setItem(key, value) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  },

  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing ${key}:`, error);
      return false;
    }
  },

  async clear() {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  },

  // Time entries
  async getTimeEntries() {
    return await this.getItem(STORAGE_KEYS.TIME_ENTRIES) || [];
  },

  async saveTimeEntry(entry) {
    const entries = await this.getTimeEntries();
    entries.push(entry);
    return await this.setItem(STORAGE_KEYS.TIME_ENTRIES, entries);
  },

  async updateTimeEntry(id, updates) {
    const entries = await this.getTimeEntries();
    const index = entries.findIndex(e => e.id === id);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      return await this.setItem(STORAGE_KEYS.TIME_ENTRIES, entries);
    }
    return false;
  },

  // Sessions
  async getSessions() {
    return await this.getItem(STORAGE_KEYS.SESSIONS) || [];
  },

  async saveSession(session) {
    const sessions = await this.getSessions();
    sessions.push(session);
    return await this.setItem(STORAGE_KEYS.SESSIONS, sessions);
  },

  // Children
  async getChildren() {
    return await this.getItem(STORAGE_KEYS.CHILDREN) || [];
  },

  async saveChild(child) {
    const children = await this.getChildren();
    children.push(child);
    return await this.setItem(STORAGE_KEYS.CHILDREN, children);
  },

  async updateChild(id, updates) {
    const children = await this.getChildren();
    const index = children.findIndex(c => c.id === id);
    if (index !== -1) {
      children[index] = { ...children[index], ...updates };
      return await this.setItem(STORAGE_KEYS.CHILDREN, children);
    }
    return false;
  },

  // Groups
  async getGroups() {
    return await this.getItem(STORAGE_KEYS.GROUPS) || [];
  },

  async saveGroup(group) {
    const groups = await this.getGroups();
    groups.push(group);
    return await this.setItem(STORAGE_KEYS.GROUPS, groups);
  },

  async updateGroup(id, updates) {
    const groups = await this.getGroups();
    const index = groups.findIndex(g => g.id === id);
    if (index !== -1) {
      groups[index] = { ...groups[index], ...updates };
      return await this.setItem(STORAGE_KEYS.GROUPS, groups);
    }
    return false;
  },

  // Generic methods for sync operations
  async getUnsyncedRecords(table) {
    const key = STORAGE_KEYS[table.toUpperCase()];
    if (!key) return [];
    const records = await this.getItem(key) || [];
    return records.filter(record => record.synced === false);
  },

  async markAsSynced(table, id) {
    const key = STORAGE_KEYS[table.toUpperCase()];
    if (!key) return false;

    const records = await this.getItem(key) || [];
    const index = records.findIndex(r => r.id === id);
    if (index !== -1) {
      records[index].synced = true;
      return await this.setItem(key, records);
    }
    return false;
  },

  async getAllUnsyncedCount() {
    const tables = ['TIME_ENTRIES', 'SESSIONS', 'CHILDREN', 'GROUPS'];
    let totalCount = 0;

    for (const table of tables) {
      const unsynced = await this.getUnsyncedRecords(table);
      totalCount += unsynced.length;
    }

    return totalCount;
  },

  // Sync queue
  async getSyncQueue() {
    return await this.getItem(STORAGE_KEYS.SYNC_QUEUE) || [];
  },

  async addToSyncQueue(item) {
    const queue = await this.getSyncQueue();
    queue.push(item);
    return await this.setItem(STORAGE_KEYS.SYNC_QUEUE, queue);
  },

  async removeFromSyncQueue(id) {
    const queue = await this.getSyncQueue();
    const filtered = queue.filter(item => item.id !== id);
    return await this.setItem(STORAGE_KEYS.SYNC_QUEUE, filtered);
  },

  async clearSyncQueue() {
    return await this.setItem(STORAGE_KEYS.SYNC_QUEUE, []);
  },

  // User profile
  async getUserProfile() {
    return await this.getItem(STORAGE_KEYS.USER_PROFILE);
  },

  async saveUserProfile(profile) {
    return await this.setItem(STORAGE_KEYS.USER_PROFILE, profile);
  },

  async clearUserProfile() {
    return await this.removeItem(STORAGE_KEYS.USER_PROFILE);
  },

  // Sync metadata (tracks retry attempts, last sync time, etc.)
  async getSyncMeta() {
    return await this.getItem(STORAGE_KEYS.SYNC_META) || {
      lastSyncTime: null,
      retryAttempts: {},
      failedItems: [],
    };
  },

  async updateSyncMeta(updates) {
    const currentMeta = await this.getSyncMeta();
    const newMeta = { ...currentMeta, ...updates };
    return await this.setItem(STORAGE_KEYS.SYNC_META, newMeta);
  },

  async recordRetryAttempt(table, id) {
    const meta = await this.getSyncMeta();
    const key = `${table}_${id}`;
    meta.retryAttempts[key] = (meta.retryAttempts[key] || 0) + 1;
    return await this.setItem(STORAGE_KEYS.SYNC_META, meta);
  },

  async getRetryAttempts(table, id) {
    const meta = await this.getSyncMeta();
    const key = `${table}_${id}`;
    return meta.retryAttempts[key] || 0;
  },

  async clearRetryAttempts(table, id) {
    const meta = await this.getSyncMeta();
    const key = `${table}_${id}`;
    delete meta.retryAttempts[key];
    return await this.setItem(STORAGE_KEYS.SYNC_META, meta);
  },
};

export { STORAGE_KEYS };
