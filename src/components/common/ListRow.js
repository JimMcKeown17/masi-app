import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const glyphs = { chevron: 'chevron-forward', external: 'open-outline', share: 'share-outline', send: 'send-outline' };
export default function ListRow({
  title, subtitle, lead, trailing, onPress, variant = 'action', busy = false, expanded,
  disabled = false, showDivider = false, accessibilityLabel, accessibilityRole,
  style, accessibilityState, titleNumberOfLines, titleAccessory,
}) {
  const readOnly = variant === 'readOnly';
  const nested = variant === 'nested';
  const label = accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ');
  const rowStyle = [styles.row, nested && styles.nested, style];
  const divider = showDivider ? <View testID="list-row-divider" pointerEvents="none"
    style={[styles.divider, { left: nested ? 104 : lead ? 68 : 16 }]} /> : null;
  if (readOnly) return <View accessible accessibilityLabel={label} style={rowStyle}>
    {lead ? <View style={styles.lead}>{lead}</View> : null}
    <View style={styles.copy}>
      <Text style={styles.readOnlyLabel}>{title}</Text>
      <Text style={[styles.title, styles.below]}>{subtitle}</Text>
    </View>
    {divider}
  </View>;
  const disclosure = trailing === 'disclosure';
  const glyph = disclosure ? (expanded ? 'chevron-up' : 'chevron-down') : glyphs[trailing];
  const titleText = <Text numberOfLines={titleNumberOfLines} ellipsizeMode="tail" style={[styles.title, nested && styles.nestedTitle]}>{title}</Text>;
  return <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole={accessibilityRole ?? 'button'}
    accessibilityLabel={label} accessibilityState={{ ...accessibilityState, busy, disabled: disabled || busy, ...(expanded === undefined ? {} : { expanded }) }}
    style={({ pressed }) => [rowStyle, pressed && styles.pressed]}>
    {lead ? <View style={nested ? styles.nestedLead : styles.lead}>{lead}</View> : null}
    <View style={styles.copy}>
      {titleAccessory != null ? <View style={styles.titleLine}>{titleText}{titleAccessory}</View> : titleText}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {busy ? <ActivityIndicator size={20} color={colors.textSecondary} />
      : glyph ? <Ionicons name={glyph} size={20} color={disclosure && expanded ? colors.text : colors.textSecondary} />
        : React.isValidElement(trailing) ? trailing : null}
    {divider}
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nested: { minHeight: 56, paddingVertical: 8, paddingLeft: 68, paddingRight: 16 },
  lead: { width: 40 },
  nestedLead: { width: 24 },
  copy: { flex: 1 },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  title: { ...typeRoles.textRowTitle, color: colors.text },
  nestedTitle: { ...typeRoles.textBodyStrong },
  subtitle: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
  readOnlyLabel: { ...typeRoles.textLabel, color: colors.textSecondary },
  below: { marginTop: 2 },
  divider: { position: 'absolute', right: 0, bottom: 0, height: 1, backgroundColor: colors.border },
  pressed: { backgroundColor: tints.pressed },
});
