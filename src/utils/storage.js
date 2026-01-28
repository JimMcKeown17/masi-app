import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  TIME_ENTRIES: '@time_entries',
  SESSIONS: '@sessions',
  CHILDREN: '@children',
  SYNC_QUEUE: '@sync_queue',
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
};

export { STORAGE_KEYS };
