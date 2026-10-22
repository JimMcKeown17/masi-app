import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IconCircleButton from '../common/IconCircleButton';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function TestFrame({ title, subtitle, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconCircleButton icon="close" accessibilityLabel="Close test" onPress={onClose} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, gap: spacing.ms },
  headerCopy: { flex: 1 },
  title: { ...typeRoles.displayHeading, color: colors.text },
  subtitle: { ...typeRoles.textCaption, color: colors.textSecondary },
});
