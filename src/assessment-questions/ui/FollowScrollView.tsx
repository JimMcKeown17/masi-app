import React, { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '../theme/tokens';

export function scrollOffsetFor(target: { y: number; height: number },
  viewport: { offset: number; height: number }, margin: number): number | null {
  const top = target.y - margin;
  if (target.height > viewport.height - 2 * margin) {
    return Math.max(0, top) === viewport.offset ? null : Math.max(0, top);
  }
  if (target.y < viewport.offset + margin) return Math.max(0, top);
  if (target.y + target.height > viewport.offset + viewport.height - margin) {
    return Math.max(0, target.y + target.height + margin - viewport.height);
  }
  return null;
}

type Targets = {
  register: (index: number, view: View | null) => void;
  follow: (index?: number) => void;
};
const TargetContext = createContext<Targets | null>(null);
const styles = StyleSheet.create({ scroll: { flex: 1 } });

export function FollowScrollView({ testID, focus, contentContainerStyle, children }: {
  testID?: string;
  focus?: number | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const targets = useRef(new Map<number, View>());
  const viewport = useRef({ offset: 0, height: 0 });
  const currentFocus = useRef(focus);
  currentFocus.current = focus;
  const measurement = useRef(0);

  const follow = useCallback((index?: number) => {
    const focused = currentFocus.current;
    if (focused == null || (index !== undefined && index !== focused)) return;
    const target = targets.current.get(focused);
    const container = content.current;
    if (!target || !container || viewport.current.height <= 0) return;
    const request = ++measurement.current;
    target.measureLayout(container, (_x, y, _width, height) => {
      // Native measurements can return after Back, review, a relayout or unmount.
      if (request !== measurement.current || currentFocus.current !== focused ||
          content.current !== container || targets.current.get(focused) !== target) return;
      const offset = scrollOffsetFor({ y, height }, viewport.current, tokens.space.lg);
      if (offset !== null) scroll.current?.scrollTo({ y: offset, animated: true });
    }, () => {});
  }, []);
  const register = useCallback((index: number, view: View | null) => {
    if (view) targets.current.set(index, view);
    else targets.current.delete(index);
  }, []);
  const context = React.useMemo(() => ({ register, follow }), [register, follow]);

  useLayoutEffect(() => {
    follow();
    return () => { measurement.current += 1; };
  }, [focus, follow]);

  return <TargetContext.Provider value={context}>
    <ScrollView ref={scroll} testID={testID} style={styles.scroll} scrollEventThrottle={16}
      onLayout={event => {
        viewport.current.height = event.nativeEvent.layout.height;
        follow();
      }}
      onScroll={event => { viewport.current.offset = event.nativeEvent.contentOffset.y; }}>
      {/* Padding belongs to this measured origin so target y is a scroll-content coordinate. */}
      <View ref={content} collapsable={false} style={contentContainerStyle} onLayout={() => follow()}>
        {children}
      </View>
    </ScrollView>
  </TargetContext.Provider>;
}

export function FollowTarget({ index, children }: { index: number; children: React.ReactNode }) {
  const context = useContext(TargetContext);
  const register = context?.register;
  const ref = useCallback((view: View | null) => register?.(index, view), [register, index]);
  return <View ref={ref} collapsable={false} onLayout={() => context?.follow(index)}>{children}</View>;
}
