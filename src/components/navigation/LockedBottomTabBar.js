import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSessionLaunchGuard } from '../../hooks/useSessionLaunchGuard';
import BottomTabIcon from './BottomTabIcon';
import ClockInBeforeSessionSheet from '../sessions/ClockInBeforeSessionSheet';
import { colors, shadows, spacing } from '../../constants/colors';

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
        size={22}
      />
      <Text style={[styles.label, focused ? styles.labelFocused : null]}>{label}</Text>
    </Pressable>
  );
};

export default function LockedBottomTabBar({ state, descriptors, navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {leftRoutes.map((route, index) => renderDestination({
          route,
          index,
          state,
          descriptors,
          navigation,
        }))}

        <Pressable
          onPress={() => requestSessionLaunch()}
          accessibilityRole="button"
          accessibilityLabel="Record a session"
          style={styles.recordAction}
        >
          <View style={styles.fab}>
            <Ionicons name="add" size={31} color={colors.onDark} />
          </View>
          <Text style={styles.recordLabel}>Record</Text>
        </Pressable>

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
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  destination: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    paddingBottom: 2,
  },
  label: {
    color: colors.tabInactive,
    fontSize: 10,
    fontWeight: '700',
  },
  labelFocused: {
    color: colors.tabActive,
  },
  recordAction: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -28,
  },
  fab: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
    ...shadows.elevated,
  },
  recordLabel: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
});
