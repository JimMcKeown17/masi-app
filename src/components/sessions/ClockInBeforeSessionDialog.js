import React from 'react';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { SESSION_CLOCK_WARNING } from '../../hooks/useSessionLaunchGuard';

export default function ClockInBeforeSessionDialog({
  visible,
  onDismiss,
  onClockInNow,
  onContinueAnyway,
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Clock In First?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{SESSION_CLOCK_WARNING}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClockInNow}>Clock In Now</Button>
          <Button onPress={onContinueAnyway}>Continue Anyway</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
