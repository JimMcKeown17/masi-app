import React from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
export default function LoadingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>Preparing your offline data</Text>
        <Text style={styles.message}>Checking your saved work before Masi opens.</Text>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typeRoles.displaySheetTitle,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typeRoles.textParagraph,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
  },
});
