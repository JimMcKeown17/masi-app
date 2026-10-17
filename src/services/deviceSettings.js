import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveCaptureMode, isValidCaptureMode } from '../constants/egraConstants';

const CAPTURE_MODE_KEY = 'masi:device:captureMode';
export const deviceSettings = {
  async getCaptureMode() {
    const stored = await AsyncStorage.getItem(CAPTURE_MODE_KEY);
    return resolveCaptureMode({ deviceFallback: stored });
  },
  async setCaptureMode(mode) {
    if (!isValidCaptureMode(mode)) throw new Error('Invalid capture mode: ' + mode);
    return AsyncStorage.setItem(CAPTURE_MODE_KEY, mode);
  },
};
