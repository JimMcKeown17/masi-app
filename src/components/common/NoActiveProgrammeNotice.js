import React from 'react';
import { View, StyleSheet } from 'react-native';
import EmptyState from './EmptyState';

/**
 * Actionable empty-state shown on the Sessions / Assessments capture surfaces when
 * the signed-in EA has no active programme assignment. Front-loads the data
 * layer's "no resolvable programme" fail-safe so the EA never fills a form that
 * fails at save — instead they see what to do about it.
 *
 * Presentational only: the screen decides when to render this (see
 * getActiveProgrammeGate). `action` names the blocked task for the copy.
 */
export default function NoActiveProgrammeNotice({ action = 'record sessions or assessments' }) {
  return <View style={styles.container}>
    <EmptyState title="No active programme"
      body={`You don't have a programme assigned yet. Contact your supervisor to be assigned before you can ${action}.`} />
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 24 } });
