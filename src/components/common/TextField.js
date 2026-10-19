import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import InlineNote from './InlineNote';

export default function TextField({
  label, value, onChangeText, icon, placeholder, error, errorPlacement = 'field', disabled = false,
  secureTextEntry, onToggleSecure, multiline = false, surface = 'canvas', inputRef,
  accessibilityLabel, onFocus, onBlur, style, ...textInputProps
}) {
  const localRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const setRef = useCallback((input) => {
    localRef.current = input;
    if (typeof inputRef === 'function') inputRef(input);
    else if (inputRef) inputRef.current = input;
  }, [inputRef]);
  const onRed = surface === 'red';
  const canvasDisabled = disabled && !onRed;
  const redDisabled = disabled && onRed;
  const haloColor = onRed
    ? error ? colors.errorBg : focused ? tints.onRedHalo : null
    : focused && !error && !disabled ? tints.pressed : null;
  const iconColor = onRed
    ? error ? colors.error : value || focused ? colors.text : colors.textSecondary
    : disabled ? colors.disabled : colors.textSecondary;

  return <View>
    <View style={styles.wrapper}>
      {haloColor ? <View testID="text-field-halo" pointerEvents="none"
        style={[styles.halo, { backgroundColor: haloColor }]} /> : null}
      <Pressable testID="text-field-box" accessible={false} disabled={disabled}
        onPress={() => localRef.current?.focus()}
        style={[styles.box, multiline && styles.multiline, onToggleSecure && styles.trailing, {
          backgroundColor: canvasDisabled ? colors.border : colors.surface,
          borderColor: canvasDisabled ? 'transparent' : error ? colors.error : focused ? colors.text : onRed ? 'transparent' : colors.fieldEdge,
        }]}
      >
        {icon ? <Ionicons name={icon} size={22} color={iconColor} accessible={false}
          style={redDisabled && styles.dimmedChrome} /> : null}
        <View style={styles.values}>
          <Text style={[styles.label, { color: error ? colors.error : colors.textSecondary },
            redDisabled && styles.dimmedChrome]}>{label}</Text>
          <TextInput {...textInputProps} ref={setRef} value={value} onChangeText={onChangeText}
            placeholder={placeholder} placeholderTextColor={colors.placeholder}
            accessibilityLabel={error ? `${label}, error: ${error}` : accessibilityLabel ?? label}
            editable={disabled ? false : textInputProps.editable}
            secureTextEntry={secureTextEntry} multiline={multiline}
            onFocus={(event) => { setFocused(true); onFocus?.(event); }}
            onBlur={(event) => { setFocused(false); onBlur?.(event); }}
            style={[styles.input, secureTextEntry && value ? typeRoles.textMasked : typeRoles.textInput,
              multiline && styles.multilineInput, { color: canvasDisabled ? colors.disabled : colors.text },
              redDisabled && styles.dimmedValue, style]}
          />
        </View>
        {onToggleSecure ? <Pressable onPress={onToggleSecure} disabled={disabled}
          accessibilityRole="button" accessibilityLabel={secureTextEntry ? 'Show password' : 'Hide password'}
          accessibilityState={{ disabled }} style={[styles.toggle, redDisabled && styles.dimmedChrome]}>
          <Ionicons name={secureTextEntry ? 'eye-outline' : 'eye-off-outline'} size={22}
            color={onRed ? colors.text : disabled ? colors.disabled : colors.textSecondary} />
        </Pressable> : null}
      </Pressable>
    </View>
    {error && errorPlacement === 'field' ? <View style={styles.note}><InlineNote>{error}</InlineNote></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  halo: { position: 'absolute', top: -4, bottom: -4, left: -4, right: -4, borderRadius: borderRadius.lg, backgroundColor: tints.pressed },
  box: { minHeight: 60, borderRadius: borderRadius.md, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trailing: { paddingRight: 4 },
  values: { flex: 1 },
  label: { ...typeRoles.textLabel, marginBottom: 2 },
  input: { padding: 0 },
  multiline: { minHeight: 112, paddingVertical: 12, alignItems: 'flex-start' },
  multilineInput: { minHeight: 66, textAlignVertical: 'top' },
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dimmedValue: { opacity: 0.7 },
  dimmedChrome: { opacity: 0.5 },
  note: { marginTop: 8 },
});
