import React, { useCallback, useContext, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IconCircleButton from './IconCircleButton';
import { colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function ScreenHeader({ navigation, route, options, back }) {
  const insets = useSafeAreaInsets();
  const { headerLeftIcon = 'back', headerBackVisible, headerRight, headerScrolled } = options;
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : options.title ?? route.name;
  const showClose = headerLeftIcon === 'close';
  const showBack = Boolean(back) && headerLeftIcon === 'back' && headerBackVisible !== false;

  return (
    <View testID="screen-header" style={[styles.container, { paddingTop: insets.top + 9 }]}>
      <View testID="screen-header-row" style={styles.row}>
        {showClose || showBack ? (
          <IconCircleButton
            icon={showClose ? 'close' : 'chevron-back'}
            accessibilityLabel={showClose ? 'Close' : 'Back'}
            onPress={() => navigation.goBack()}
          />
        ) : null}
        {title === '' ? <View style={styles.titleSpacer} /> : (
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>{title}</Text>
        )}
        {headerRight?.({ canGoBack: Boolean(back), tintColor: colors.text })}
      </View>
      {headerScrolled ? <View testID="screen-header-hairline" style={styles.hairline} /> : null}
    </View>
  );
}

export function useHeaderHairline(navigation) {
  const contextNavigation = useContext(NavigationContext);
  const targetNavigation = navigation ?? contextNavigation;
  const wasScrolled = useRef(false);
  return useCallback(({ nativeEvent }) => {
    if (!targetNavigation) return;
    const headerScrolled = nativeEvent.contentOffset.y > 0;
    if (headerScrolled === wasScrolled.current) return;
    wasScrolled.current = headerScrolled;
    targetNavigation.setOptions({ headerScrolled });
  }, [targetNavigation]);
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, paddingHorizontal: 24, paddingBottom: 6 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { ...typeRoles.displayTitle, color: colors.text, paddingTop: 6, flex: 1, textAlign: 'left' },
  titleSpacer: { flex: 1 },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: tints.rule },
});
