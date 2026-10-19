import React from 'react';
import { Pressable, StyleSheet, Text, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, shadows, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useMotion } from '../../context/MotionContext';

function appearance(variant, surface, tone, pressed, disabled) {
  if (variant === 'tertiary') {
    return { backgroundColor: 'transparent', color: disabled ? colors.disabled
      : tone === 'ink' ? colors.text : tone === 'onRed' ? colors.onDark
        : pressed ? colors.primaryDark : colors.primary };
  }
  if (variant === 'primary') {
    if (surface === 'red') return {
      backgroundColor: disabled ? tints.onRedDisabled : pressed ? colors.red50 : colors.surface,
      color: disabled || pressed ? colors.red700 : colors.primary,
      ...(!disabled && !pressed ? shadows.onRedButton : {}),
    };
    return {
      backgroundColor: disabled ? colors.border : pressed ? colors.primaryDark : colors.primary,
      color: disabled ? colors.disabled : colors.onDark,
      ...(!disabled && !pressed ? shadows.primaryButton : {}),
    };
  }
  if (disabled) return { backgroundColor: colors.border, color: colors.disabled };
  if (variant === 'secondary' && surface === 'red') return {
    backgroundColor: pressed ? tints.onRedTile : 'transparent', color: colors.onDark,
    borderWidth: 1.5, borderColor: tints.onRedOutline,
  };
  if (variant === 'secondary' || variant === 'destructiveQuiet') return {
    backgroundColor: pressed ? colors.background : colors.surface,
    color: variant === 'destructiveQuiet' ? colors.error : colors.text,
    borderWidth: 1.5, borderColor: tints.control,
  };
  if (variant === 'warning') return {
    backgroundColor: colors.warningBg, color: colors.warningText,
    borderWidth: 1.5, borderColor: tints.warningControl,
  };
  return { backgroundColor: variant === 'success' ? colors.successText : colors.error, color: colors.onDark };
}

const BrandButton = React.forwardRef(function BrandButton({
  label, onPress, variant = 'primary', size = 'lg', surface = 'canvas', tone = 'accent',
  icon, loading = false, loadingLabel, disabled = false, accessibilityLabel, style, testID,
}, ref) {
  const { reduceMotion } = useMotion();
  const isDisabled = disabled || loading;
  const tertiary = variant === 'tertiary';
  const outlined = ['secondary', 'destructiveQuiet', 'warning'].includes(variant);
  const labelRole = variant === 'warning' || (tertiary && tone === 'ink') ? typeRoles.textButtonM
    : tertiary ? (size === 'sm' ? typeRoles.textLink : typeRoles.textButton)
      : size === 'lg' ? typeRoles.textButtonL : typeRoles.textButton;
  const look = (pressed) => appearance(variant, surface, tone, pressed && !isDisabled, disabled && !loading);
  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (loading ? loadingLabel ?? label : label)}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => {
        const { color, ...chrome } = look(pressed);
        return [styles.button, {
          minHeight: tertiary || size !== 'lg' ? 44 : 56,
          paddingHorizontal: tertiary ? 2 : size === 'lg' ? 24 : outlined ? 18 : 20,
          alignSelf: tertiary && tone !== 'ink' ? 'flex-start' : 'stretch',
        }, chrome, pressed && !isDisabled && !reduceMotion && styles.pressed, style];
      }}
    >
      {({ pressed }) => {
        const { color } = look(pressed);
        return <View style={styles.content}>
          {loading ? <ActivityIndicator size={18} color={color} />
            : variant === 'warning' ? <Ionicons name="warning-outline" size={18} color={disabled ? colors.disabled : colors.warning} />
              : icon ? <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={color} /> : null}
          <Text style={[styles.label, labelRole, { color }, tertiary && tone === 'onRed' && styles.underline]}>
            {loading ? loadingLabel ?? label : label}
          </Text>
        </View>;
      }}
    </Pressable>
  );
});

export default BrandButton;

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.pill, paddingVertical: 10 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { textAlign: 'center', flexShrink: 1 },
  pressed: { transform: [{ scale: 0.98 }] },
  underline: { textDecorationLine: 'underline' },
});
