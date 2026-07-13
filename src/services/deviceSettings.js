import { resolveCaptureMode, isValidCaptureMode } from '../constants/egraConstants';
import { localStateRepository } from '../db/repositories/localStateRepository';

const USER_PROFILE_KEY = 'user_profile';
const CAPTURE_MODE_KEY = 'assessment_capture_mode';

export const deviceSettings = {
  async getUserProfile() {
    return localStateRepository.get(USER_PROFILE_KEY, null);
  },

  async saveUserProfile(profile) {
    return localStateRepository.set(USER_PROFILE_KEY, profile);
  },

  async clearUserProfile() {
    return localStateRepository.remove(USER_PROFILE_KEY);
  },

  async getCaptureMode() {
    const stored = await localStateRepository.get(CAPTURE_MODE_KEY);
    return resolveCaptureMode({ deviceFallback: stored });
  },

  async setCaptureMode(mode) {
    if (!isValidCaptureMode(mode)) {
      throw new Error('Invalid capture mode: ' + mode);
    }
    return localStateRepository.set(CAPTURE_MODE_KEY, mode);
  },
};
