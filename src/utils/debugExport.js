import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share, Platform } from 'react-native';
import { logger } from './logger';

/**
 * Export all AsyncStorage as JSON file via native Share
 */
export const exportDatabase = async () => {
  try {
    // Get all keys and values
    const keys = await AsyncStorage.getAllKeys();
    const items = await AsyncStorage.multiGet(keys);

    // Format as object
    const database = items.reduce((acc, [key, value]) => {
      try {
        acc[key] = JSON.parse(value);
      } catch {
        acc[key] = value; // Keep as string if not JSON
      }
      return acc;
    }, {});

    // Add metadata
    const exportData = {
      exported_at: new Date().toISOString(),
      app_version: '1.0.0',
      device_info: {
        platform: Platform.OS,
        version: Platform.Version,
      },
      database,
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    // Share as text (iOS/Android will handle saving)
    await Share.share({
      message: jsonString,
      title: 'Masi App Database Export',
    });

    return { success: true };
  } catch (error) {
    console.error('Export database error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Export logs as text via native Share
 */
export const exportLogs = async () => {
  try {
    const logs = await logger.exportLogs();

    if (!logs || logs.length === 0) {
      return { success: false, error: 'No logs to export' };
    }

    await Share.share({
      message: logs,
      title: 'Masi App Logs Export',
    });

    return { success: true };
  } catch (error) {
    console.error('Export logs error:', error);
    return { success: false, error: error.message };
  }
};
