import React, { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useToastObstruction } from '../../context/ToastContext';
import { useSessionLaunchGuard } from '../../hooks/useSessionLaunchGuard';
import BottomTabIcon from './BottomTabIcon';
import ClockInBeforeSessionSheet from '../sessions/ClockInBeforeSessionSheet';
import { colors, shadows, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export const FAB_OVERHANG = 24;

const renderDestination = ({
  route,
  index,
  state,
  descriptors,
  navigation,
}) => {
  const focused = state.index === index;
  const options = descriptors[route.key]?.options || {};
  const label = options.tabBarLabel || options.title || route.name;

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event?.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const onLongPress = () => {
    navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  return (
    <Pressable
      key={route.key}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label + ' tab'}
      style={styles.destination}
    >
      <BottomTabIcon
        routeName={route.name}
        focused={focused}
        color={focused ? colors.tabActive : colors.tabInactive}
        size={24}
      />
      <Text style={focused ? styles.labelFocused : styles.label} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
};

export default function LockedBottomTabBar({ state, descriptors, navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const parentNavigation = useContext(NavigationContext);
  const [isFocused, setIsFocused] = useState(() => parentNavigation ? parentNavigation.isFocused() : true);
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    if (!parentNavigation) {
      setIsFocused(true);
      return undefined;
    }
    const unsubscribeFocus = parentNavigation.addListener('focus', () => setIsFocused(true));
    const unsubscribeBlur = parentNavigation.addListener('blur', () => setIsFocused(false));
    setIsFocused(parentNavigation.isFocused());
    return () => { unsubscribeFocus(); unsubscribeBlur(); };
  }, [parentNavigation]);
  useToastObstruction(barHeight + FAB_OVERHANG + 5, isFocused);
  const {
    warningVisible,
    requestSessionLaunch,
    continueAnyway,
    clockInNow,
    dismissWarning,
  } = useSessionLaunchGuard({
    navigation,
    userId: user?.id,
  });
  const leftRoutes = state.routes.slice(0, 2);
  const rightRoutes = state.routes.slice(2);

  return (
    <>
      <View
        testID="bottom-tab-bar"
        onLayout={({ nativeEvent }) => setBarHeight(nativeEvent.layout.height)}
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      >
        {leftRoutes.map((route, index) => renderDestination({
          route,
          index,
          state,
          descriptors,
          navigation,
        }))}

        <View style={styles.recordSlot}>
          <Pressable
            onPress={() => requestSessionLaunch()}
            accessibilityRole="button"
            accessibilityLabel="Record a session"
            style={styles.recordAction}
          >
            <View testID="record-ring" style={styles.recordRing}>
              <View testID="record-disc" style={styles.fab}>
                <Ionicons name="add" size={28} color={colors.onDark} />
              </View>
            </View>
            <Text style={styles.recordLabel} maxFontSizeMultiplier={1.3}>Record</Text>
          </Pressable>
        </View>

        {rightRoutes.map((route, offset) => renderDestination({
          route,
          index: offset + 2,
          state,
          descriptors,
          navigation,
        }))}
      </View>

      <ClockInBeforeSessionSheet
        visible={warningVisible}
        onDismiss={dismissWarning}
        onClockInNow={clockInNow}
        onContinueAnyway={continueAnyway}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 4,
    ...shadows.nav,
  },
  destination: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    paddingTop: 6,
    gap: 3,
  },
  label: {
    color: colors.tabInactive,
    ...typeRoles.textNavInactive,
  },
  labelFocused: {
    color: colors.tabActive,
    ...typeRoles.textNavActive,
  },
  recordSlot: {
    flex: 1,
    height: 56,
    alignItems: 'center',
  },
  recordAction: {
    position: 'absolute',
    top: -(FAB_OVERHANG + 5),
    alignItems: 'center',
  },
  recordRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  fab: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    backgroundColor: colors.primary,
  },
  recordLabel: {
    color: colors.text,
    ...typeRoles.textNavRecord,
    marginTop: -2,
  },
});
