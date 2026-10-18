// src/components/home/AttentionArea.js
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const ICONS = { sync_attention: 'cloud-outline', auto_clock_out: 'alarm-outline', assessment_due: 'clipboard-outline' };
// Ink at ~12% (0x1F), the same token-plus-alpha pattern as the pressed fill.
const CARD_BORDER = colors.text + '1F';

function AttentionCard({ item, onOpen, onDismiss }) {
  const warning = item.tone === 'warning';
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={item.accessibilityLabel}
        style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
      >
        <View style={[styles.tile, warning ? styles.tileWarning : null]}>
          <Ionicons name={ICONS[item.kind]} size={22} color={warning ? colors.warningText : colors.text} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </View>
        {!item.dismissible ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
      </Pressable>
      {item.dismissible ? (
        <Pressable
          onPress={() => onDismiss(item)}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: ${item.title}`}
          style={styles.dismiss}
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AttentionArea({ items, onOpen, onDismiss }) {
  if (!items || items.length === 0) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel="Needs your attention" style={styles.area}>
      {items.map((item) => (
        <AttentionCard key={item.key} item={item} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', minHeight: 60, borderRadius: 18,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: CARD_BORDER, overflow: 'hidden',
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 11 },
  pressed: { transform: [{ scale: 0.98 }], backgroundColor: colors.text + '0F' },
  tile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  tileWarning: { backgroundColor: colors.warningBg },
  copy: { flex: 1, gap: 2 },
  title: { ...typeRoles.textBodyStrong, color: colors.text },
  subtitle: { ...typeRoles.textCaption, color: colors.textSecondary },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
