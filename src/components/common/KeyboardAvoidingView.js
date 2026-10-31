import React from 'react';
import { Keyboard, KeyboardAvoidingView as NativeKeyboardAvoidingView, Platform } from 'react-native';

export default function KeyboardAvoidingView({ enabled, behavior, ...props }) {
  const [visible, setVisible] = React.useState(() => Keyboard.isVisible());
  React.useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    // Floating keyboards can report height zero: visibility comes from event type.
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    setVisible(Keyboard.isVisible());
    return () => { show.remove(); hide.remove(); };
  }, []);

  const android = Platform.OS === 'android';
  const avoiding = enabled !== false && visible;
  // Disabling height alone pins RN's initial height and flex: 0. Omitting the
  // behavior restores caller layout; both RN branches keep the same View/children.
  return (
    <NativeKeyboardAvoidingView
      {...props}
      behavior={android && !avoiding && behavior === 'height' ? undefined : behavior}
      enabled={android ? avoiding : enabled}
    />
  );
}
