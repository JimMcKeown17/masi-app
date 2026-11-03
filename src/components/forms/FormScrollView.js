import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

const FormScrollView = forwardRef(function FormScrollView({ keepEndVisible = false, style, onContentSizeChange, onLayout, ...props }, ref) {
  const scrollRef = useRef(null);
  const height = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const obstruction = Platform.OS === 'android' && height > 0 ? height + insets.bottom : 0;
  const setRef = useCallback(node => {
    scrollRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  const revealEnd = useCallback(() => {
    if (keepEndVisible) scrollRef.current?.scrollToEnd({ animated: true });
  }, [keepEndVisible]);
  useEffect(() => { if (height > 0) revealEnd(); }, [height, revealEnd]);
  return <ScrollView {...props} ref={setRef}
    style={[style, { marginBottom: obstruction }]}
    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    // The keyboard effect can run before Android has shrunk the viewport; the new layout is the
    // reliable moment to reveal the end again.
    onLayout={event => {
      onLayout?.(event);
      revealEnd();
    }}
    onContentSizeChange={(width, contentHeight) => {
      onContentSizeChange?.(width, contentHeight);
      revealEnd();
    }} />;
});
export default FormScrollView;
