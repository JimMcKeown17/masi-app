import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { logger } from './logger';
import { debugDump } from '../db/debugDump';
import { getReleaseMetadata } from './releaseMetadata';

/**
 * Write content to a temp file and share it via the native share sheet.
 * Users will see a file attachment they can send via WhatsApp, email, etc.
 */
const shareFile = async (filename, content, mimeType) => {
  const file = new File(Paths.cache, filename);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(content);

  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: filename,
  });
};

/**
 * Export local SQLite support diagnostics as a .json file via native Share.
 */
export const exportDatabase = async () => {
  try {
    const releaseMetadata = getReleaseMetadata();
    const exportData = {
      exported_at: new Date().toISOString(),
      app_version: releaseMetadata.appVersion,
      sqlite_refactor_build: 'plan-6',
      ios_build_number: releaseMetadata.iosBuildNumber,
      android_version_code: releaseMetadata.androidVersionCode,
      runtime_version: releaseMetadata.runtimeVersion,
      releaseMetadata,
      device_info: {
        platform: Platform.OS,
        version: Platform.Version,
      },
      database: await debugDump(),
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await shareFile(`masi-database-${timestamp}.json`, jsonString, 'application/json');

    return { success: true };
  } catch (error) {
    console.error('Export database error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Export logs as a .txt file via native Share
 */
export const exportLogs = async () => {
  try {
    const logs = await logger.exportLogs();

    if (!logs || logs.length === 0) {
      return { success: false, error: 'No logs to export' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await shareFile(`masi-logs-${timestamp}.txt`, logs, 'text/plain');

    return { success: true };
  } catch (error) {
    console.error('Export logs error:', error);
    return { success: false, error: error.message };
  }
};
