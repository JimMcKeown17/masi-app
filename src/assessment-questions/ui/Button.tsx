import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { UiText } from './Text';

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  flex?: boolean;
};

type PrimaryTone = 'ink' | 'marked' | 'error' | 'danger';

const pill: ViewStyle = {
  minHeight: 52,
  borderRadius: tokens.radius.pill,
  paddingVertical: tokens.space.md,
  paddingHorizontal: tokens.space.lg,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  alignSelf: 'stretch',
  gap: tokens.space.sm,
};

function interactionStyle(style: StyleProp<ViewStyle>, disabled: boolean) {
  return ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
    style, { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
  ];
}

function PillButton({ label, onPress, icon, disabled = false, testID, accessibilityLabel, flex, tone, outlined = false }: ButtonProps & {
  tone: PrimaryTone;
  outlined?: boolean;
}) {
  const fill = { ink: tokens.color.ink, marked: tokens.color.marked, error: tokens.color.error, danger: tokens.color.primary }[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { if (!disabled) onPress(); }}
      style={interactionStyle([
        pill,
        { backgroundColor: outlined ? tokens.color.surface : fill },
        outlined && { borderWidth: 1.5, borderColor: tokens.color.ink },
        flex && { flex: 1 },
      ], disabled)}
    >
      {icon && <Icon name={icon} tone={outlined ? 'ink' : 'onInk'} />}
      <UiText variant="label" tone={outlined ? 'ink' : 'onInk'} align="center" style={{ flexShrink: 1 }}>{label}</UiText>
    </Pressable>
  );
}

export function PrimaryButton({ tone = 'ink', ...props }: ButtonProps & { tone?: PrimaryTone }) {
  return <PillButton {...props} tone={tone} />;
}

export function SecondaryButton(props: ButtonProps) {
  return <PillButton {...props} tone="ink" outlined />;
}

export function TextLink({ label, onPress, tone = 'ink', testID, disabled = false }: {
  label: string; onPress: () => void; tone?: 'ink' | 'danger'; testID?: string; disabled?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { if (!disabled) onPress(); }}
      style={interactionStyle({ minHeight: 44, paddingHorizontal: tokens.space.sm, justifyContent: 'center', alignItems: 'center' }, disabled)}
    >
      <UiText variant="label" tone={tone} align="center" style={{ flexShrink: 1 }}>{label}</UiText>
    </Pressable>
  );
}

export function IconButton({ icon, accessibilityLabel, onPress, disabled = false, testID }: {
  icon: IconName; accessibilityLabel: string; onPress: () => void; disabled?: boolean; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { if (!disabled) onPress(); }}
      style={interactionStyle({ width: 44, height: 44, borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: tokens.color.line, alignItems: 'center', justifyContent: 'center' }, disabled)}
    >
      <Icon name={icon} />
    </Pressable>
  );
}
