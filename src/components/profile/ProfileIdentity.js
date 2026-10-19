import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Avatar from '../common/Avatar';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getInitials } from '../../utils/initials';

export default function ProfileIdentity({ profile, email }) {
  const name = [profile?.first_name, profile?.last_name]
    .map((part) => (part ?? '').trim()).filter(Boolean).join(' ');

  return (
    <View style={styles.row}>
      <Avatar size={64} label={getInitials(profile?.first_name, profile?.last_name)} icon={name ? undefined : 'person-outline'} />
      <View style={styles.identity}>
        <Text accessibilityRole="header" style={styles.name}>{name || email || ''}</Text>
        {profile?.jobTitleName ? <Text style={styles.jobTitle}>{profile.jobTitleName}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identity: { flex: 1 },
  name: { ...typeRoles.displaySheetTitle, color: colors.text },
  jobTitle: { ...typeRoles.textParagraph, color: colors.textSecondary, marginTop: 2 },
});
