import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import ListGroup from '../common/ListGroup';
import SectionHeader from '../common/SectionHeader';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const MISSING = '—';
const shown = (value) => (value === null || value === undefined || value === '' ? MISSING : String(value));
const fact = (text) => text.replace(/ /g, ' ');

function Fact({ label, value, note, large = false }) {
  return <View accessible accessibilityLabel={[label, value, note].filter(Boolean).join(', ')} style={styles.cell}>
    <Text style={styles.label}>{label}</Text>
    <Text selectable style={large ? styles.release : styles.value}>{value}</Text>
    {note ? <Text selectable style={styles.note}>{note}</Text> : null}
  </View>;
}

// A ListGroup row: ListGroup passes showDivider to every row but the last.
function FactRow({ children, showDivider = false }) {
  return <View style={styles.row}>
    {children}
    {showDivider ? <View testID="list-row-divider" pointerEvents="none" style={styles.divider} /> : null}
  </View>;
}

/**
 * Profile's App release section: which release this phone is running, so a tester can
 * tell at a glance whether an update has landed. `release` is getReleaseIdentity().
 */
export default function AppReleaseInfo({ release, device, platform = Platform }) {
  const deviceLine = [
    fact(`Device ${device?.modelName || 'Unknown'}`),
    fact(`${device?.osName || platform.OS} ${device?.osVersion || platform.Version}`),
  ].join(' · ');
  return <View>
    <SectionHeader title="App release" />
    <ListGroup>
      <FactRow><Fact large label="Release" value={shown(release.releaseLabel)} /></FactRow>
      <FactRow>
        <Fact label="Build" value={shown(release.buildLabel)} />
        <Fact label="Channel" value={shown(release.channel)} />
      </FactRow>
      <FactRow>
        <Fact label="Runtime" value={shown(release.runtimeVersion)} />
        <Fact label="Update" value={shown(release.shortUpdateId)} />
      </FactRow>
      <FactRow>
        <Fact label="Running" value={shown(release.launch)} />
        <Fact label="Published" value={shown(release.publishedAt)} />
      </FactRow>
      <FactRow>
        <Fact label="Source" value={shown(release.sourceCommit)} />
        <Fact label="Backend" value={shown(release.backendTarget)} note={release.backendProjectId} />
      </FactRow>
    </ListGroup>
    <Text style={styles.device}>{deviceLine}</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cell: { flex: 1 },
  label: { ...typeRoles.textLabel, color: colors.textSecondary },
  value: { ...typeRoles.textData, color: colors.text, marginTop: 2 },
  release: { ...typeRoles.displayTitle, color: colors.text, fontVariant: ['tabular-nums'], marginTop: 2 },
  note: { ...typeRoles.textCaption, color: colors.textSecondary, fontVariant: ['tabular-nums'], marginTop: 2 },
  divider: { position: 'absolute', left: 16, right: 0, bottom: 0, height: 1, backgroundColor: colors.border },
  device: { ...typeRoles.textCaption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.ms },
});
