import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, findNodeHandle } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import TextField from '../common/TextField';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { availablePicker, pickSupportScreenshot } from '../../utils/supportScreenshot';
import { isStaleActorError } from '../../session/staleActor';

export default function ReportProblemSheet({ visible, onClose, onSubmit, handle }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(null);
  const attachRef = useRef(null);
  const [refocusAttach, setRefocusAttach] = useState(false);
  const running = useRef(null);
  const picker = visible ? availablePicker() : null;
  const reset = useCallback(() => {
    running.current = null;
    pickingRef.current = null;
    setMessage(''); setError(null); setFormError(null); setPending(false);
    setScreenshotFile(null); setPicking(false); setRefocusAttach(false);
  }, []);
  useLayoutEffect(() => {
    reset();
    return () => { running.current = null; pickingRef.current = null; };
  }, [visible, handle, reset]);
  // Removing unmounts the focused Remove button; hand focus back to Attach.
  useEffect(() => {
    if (!refocusAttach) return undefined;
    const frame = requestAnimationFrame(() => {
      setRefocusAttach(false);
      const node = findNodeHandle(attachRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [refocusAttach]);
  const removeScreenshot = () => { setScreenshotFile(null); setRefocusAttach(true); };
  const dismiss = () => { reset(); onClose(); };
  const submit = async () => {
    if (!visible || !handle.isCurrent() || running.current || pickingRef.current) return;
    if (!message.trim()) { setError('Please describe what went wrong.'); return; }
    if (message.length > 4000) { setError('Use 4,000 characters or fewer.'); return; }
    const attempt = {};
    running.current = attempt;
    setPending(true);
    setFormError(null);
    try {
      const result = await onSubmit({ message, ...(screenshotFile ? { screenshotFile } : {}) });
      if (running.current !== attempt || !handle.isCurrent()) return;
      if (result?.error) setFormError(result.error);
      else if (!result?.abandoned) dismiss();
    } catch (failure) {
      if (running.current === attempt && handle.isCurrent() && !isStaleActorError(failure)) setFormError('Could not save your report. Please try again.');
    } finally {
      if (running.current === attempt) { running.current = null; setPending(false); }
    }
  };
  const attach = async () => {
    if (!visible || !handle.isCurrent() || running.current || pickingRef.current) return;
    const attempt = {};
    pickingRef.current = attempt;
    setPicking(true); setFormError(null);
    try {
      const selected = await pickSupportScreenshot();
      if (pickingRef.current === attempt && handle.isCurrent() && selected) setScreenshotFile(selected);
    } catch (failure) {
      if (pickingRef.current === attempt && handle.isCurrent() && !isStaleActorError(failure)) setFormError(failure?.message || 'Could not attach the screenshot. Please try again.');
    } finally {
      if (pickingRef.current === attempt) { pickingRef.current = null; setPicking(false); }
    }
  };
  return <BottomSheet visible={visible} onDismiss={dismiss} title="Report a problem"
    dismissLabel="Dismiss report a problem" footer={<View style={styles.actions}>
      {formError ? <InlineNote>{formError}</InlineNote> : null}
      <BrandButton label="Send" loading={pending} disabled={picking} onPress={submit} />
      <BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={dismiss} />
    </View>} scrollViewProps={{ keyboardShouldPersistTaps: 'handled' }}>
    <TextField label="What went wrong?" value={message} onChangeText={(text) => { setMessage(text); setError(null); setFormError(null); }} multiline error={error} disabled={pending} />
    {picker ? <View style={styles.attachment}>
      {screenshotFile ? <Text style={styles.caption}>Screenshot attached.</Text> : null}
      {/* One stable row: the button that opens the picker is relabelled, never remounted, so a
          screen reader keeps its place when the picker returns. */}
      <View testID="screenshot-actions" style={styles.screenshotActions}>
        <BrandButton ref={attachRef} label={screenshotFile ? 'Replace' : 'Attach a screenshot'}
          accessibilityLabel={screenshotFile ? 'Replace screenshot' : 'Attach a screenshot'} icon="image-outline"
          variant="tertiary" disabled={pending} loading={picking} onPress={attach} />
        {screenshotFile ? <BrandButton label="Remove" accessibilityLabel="Remove screenshot" icon="trash-outline"
          variant="tertiary" disabled={pending || picking} onPress={removeScreenshot} /> : null}
      </View>
    </View> : null}
  </BottomSheet>;
}
const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  screenshotActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attachment: { marginTop: spacing.md },
  caption: { ...typeRoles.textCaption, color: colors.textSecondary },
});
