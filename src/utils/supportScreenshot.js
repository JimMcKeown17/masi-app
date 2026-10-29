import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';

let picker;
export function availablePicker() {
  // Older pilot binaries receive OTA JavaScript without this native module.
  // Metro can report a fatal import before a caller's catch, so preflight first.
  if (!requireOptionalNativeModule('ExponentImagePicker')) return null;
  if (!picker) picker = require('expo-image-picker');
  return typeof picker.launchImageLibraryAsync === 'function' ? picker : null;
}

export async function pickSupportScreenshot() {
  const imagePicker = availablePicker();
  if (!imagePicker) throw new Error('Screenshots are unavailable in this app build. You can still send your report.');
  const result = await imagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: false, quality: 0.5, allowsMultipleSelection: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  const extension = (asset?.fileName || asset?.uri || '').split('.').pop().toLowerCase();
  const invalid = 'Choose a JPEG, PNG, HEIC or HEIF screenshot from your phone.';
  if (!asset?.uri?.startsWith('file://') ||
      !['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(extension) ||
      !['image/jpeg', 'image/png', 'image/heic', 'image/heif'].includes(asset.mimeType)) throw new Error(invalid);
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory || !Number.isFinite(info.size) || info.size <= 0) throw new Error(invalid);
  if (info.size > 15 * 1024 * 1024) throw new Error('Choose a screenshot of 15 MB or less.');
  return { uri: asset.uri, extension, mimeType: asset.mimeType, fileSize: info.size };
}
