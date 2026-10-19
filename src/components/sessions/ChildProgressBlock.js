import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getInitials } from '../../utils/initials';
import Avatar from '../common/Avatar';
import ListGroup from '../common/ListGroup';
import ListRow from '../common/ListRow';
import StatusBadge from '../common/StatusBadge';

function ChildHeading({ child, className, showDivider }) {
  return <View style={[styles.head, showDivider && styles.headDivider]}>
    <Avatar label={getInitials(child.first_name, child.last_name)} size={40} />
    <View style={styles.identity}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.name}>{child.first_name} {child.last_name}</Text>
      <Text style={styles.className}>{className || 'No class'}</Text>
    </View>
  </View>;
}

function ProgressValue({ children }) {
  return <View style={styles.valueRow}>
    {children}
    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
  </View>;
}

export default function ChildProgressBlock({ child, className, readingLevel, trackerChangeCount, onOpenLevel, onOpenTracker }) {
  const name = `${child.first_name} ${child.last_name}`;
  const level = readingLevel || 'Not set';
  return <ListGroup>
    <ChildHeading child={child} className={className} />
    <ListRow title={<Text style={styles.label}>Reading level</Text>} style={styles.row}
      accessibilityLabel={`${name}, reading level, ${level}`} onPress={() => onOpenLevel(child.id)}
      trailing={<ProgressValue><Text style={readingLevel ? styles.value : styles.unset}>{level}</Text></ProgressValue>} />
    <ListRow title={<Text style={styles.label}>Letter tracker</Text>} style={styles.row}
      accessibilityLabel={`${name}, letter tracker, ${trackerChangeCount > 0 ? `${trackerChangeCount} new` : 'Update'}`}
      onPress={() => onOpenTracker(child)}
      trailing={<ProgressValue>{trackerChangeCount > 0
        ? <StatusBadge tone="successStrong" label={`+${trackerChangeCount} new`} />
        : <Text style={styles.value}>Update</Text>}</ProgressValue>} />
  </ListGroup>;
}

const styles = StyleSheet.create({
  head: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  identity: { flex: 1 },
  name: { ...typeRoles.textRowTitle, color: colors.text },
  className: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
  row: { minHeight: 52, paddingVertical: 0, paddingLeft: 16, paddingRight: 12 },
  label: { ...typeRoles.textBodySemi, color: colors.text },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { ...typeRoles.textBodyStrong, color: colors.text },
  unset: { ...typeRoles.textBody, color: colors.textSecondary },
});
