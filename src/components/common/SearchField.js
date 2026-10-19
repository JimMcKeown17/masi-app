import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';

export default function SearchField({ value, onChangeText, placeholder, accessibilityLabel, autoFocus }) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  return <View style={styles.wrapper}>
    {focused ? <View testID="search-field-halo" pointerEvents="none" style={styles.halo} /> : null}
    <View style={[styles.box, { borderWidth: focused ? 2 : 1.5, borderColor: focused ? colors.text : colors.fieldEdge }]}>
      <Ionicons name="search-outline" size={20} color={focused ? colors.text : colors.textSecondary} accessible={false} />
      <TextInput {...NO_TEXT_SUGGESTIONS} ref={inputRef} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.placeholder} autoFocus={autoFocus}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={styles.input} />
      {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}
        onPress={() => { onChangeText(''); inputRef.current?.focus(); }}>
        <View style={styles.disc}><Ionicons name="close" size={14} color={colors.text} /></View>
      </Pressable> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  halo: { position: 'absolute', top: -4, bottom: -4, left: -4, right: -4, borderRadius: borderRadius.lg, backgroundColor: tints.pressed },
  box: { minHeight: 48, borderRadius: borderRadius.md, backgroundColor: colors.surface, paddingLeft: 16, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { ...typeRoles.textSearch, color: colors.text, flex: 1, paddingVertical: 8, paddingHorizontal: 0 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
