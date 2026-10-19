import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const fact = (text) => text.replace(/ /g, '\u00a0');

export function formatReleaseLines({ releaseMetadata, runtimeDiagnostics, platform = Platform }) {
  const { application, device, update } = runtimeDiagnostics;
  return [
    [fact(`Version ${application.version} (Build ${application.build || '?'})`), fact(`Backend ${releaseMetadata.supabaseTarget}`)].join(' · '),
    fact(`Project ${releaseMetadata.supabaseProjectId}`),
    [fact(`Device ${device.modelName || 'Unknown'}`), fact(`${device.osName || platform.OS} ${device.osVersion || platform.Version}`), fact(`Update ${update.id || 'Embedded'}`)].join(' · '),
  ];
}

export default function AppReleaseInfo({ releaseMetadata, runtimeDiagnostics }) {
  return (
    <View>
      {formatReleaseLines({ releaseMetadata, runtimeDiagnostics }).map((line, index) => (
        <Text key={index} style={styles.line}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { ...typeRoles.textCaption, color: colors.textSecondary, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
