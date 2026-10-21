import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { isPreviewContentAllowed } from '../../../config/previewContentConfig';

export function isPreviewContentEnabled() {
  try {
    return isPreviewContentAllowed({
      extra: Constants.expoConfig?.extra,
      channel: Updates.channel,
    });
  } catch {
    return false;
  }
}
