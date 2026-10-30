import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { isStaleActorError } from '../../session/staleActor';

export default function SendDiagnosticsSheet({ visible, onClose, onSubmit, handle }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const running = useRef(null);
  const reset = useCallback(() => { running.current = null; setPending(false); setError(null); }, []);
  useLayoutEffect(() => {
    reset();
    return () => { running.current = null; };
  }, [visible, handle, reset]);
  const dismiss = () => { reset(); onClose(); };
  const submit = async () => {
    if (!visible || !handle.isCurrent() || running.current) return;
    const attempt = {};
    running.current = attempt;
    setPending(true); setError(null);
    try {
      const result = await onSubmit();
      if (running.current !== attempt || !handle.isCurrent()) return;
      if (result?.error) setError(result.error);
      else if (!result?.abandoned) dismiss();
    } catch (failure) {
      if (running.current === attempt && handle.isCurrent() && !isStaleActorError(failure)) setError('Could not save diagnostics. Please try again.');
    } finally {
      if (running.current === attempt) { running.current = null; setPending(false); }
    }
  };
  return <BottomSheet visible={visible} onDismiss={dismiss} title="Send diagnostics"
    dismissLabel="Dismiss send diagnostics" footer={<View style={styles.actions}>
      {error ? <InlineNote>{error}</InlineNote> : null}
      <BrandButton label="Send" loading={pending} onPress={submit} />
      <BrandButton label="Cancel" variant="tertiary" tone="ink" onPress={dismiss} />
    </View>}>
    <Text style={styles.description}>Send app information to the Masi team to help us investigate problems.</Text>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  description: { ...typeRoles.textParagraph, color: colors.text },
  actions: { gap: spacing.sm },
});
