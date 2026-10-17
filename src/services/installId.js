import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

export const INSTALL_ID_KEY = 'masi:device:installId';
let pending = null; // device-level: one install id per phone, shared by every EA

export const getInstallId = () => {
  if (!pending) {
    pending = (async () => {
      const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
      if (existing) return existing;
      const created = uuidv4();
      await AsyncStorage.setItem(INSTALL_ID_KEY, created);
      return created;
    })().catch((error) => { pending = null; throw error; });
  }
  return pending;
};

export const resetInstallIdForTests = () => { pending = null; };
