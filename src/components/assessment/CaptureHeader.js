import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import CountdownTimer from './CountdownTimer';

const CaptureHeader = React.memo(function CaptureHeader({
  getElapsedMs,
  pageLabel,
  currentPage,
  totalPages,
}) {
  return (
    <>
      <View style={styles.timerRow}>
        <CountdownTimer getElapsedMs={getElapsedMs} />
      </View>

      <View style={styles.pageInfo}>
        <Text variant="bodySmall" style={styles.pageText}>
          {pageLabel} {currentPage + 1} of {totalPages}
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: totalPages }).map((_, index) => (
            <View
              key={index}
              testID={`capture-page-dot-${index}`}
              style={[styles.dot, index === currentPage && styles.dotActive]}
            />
          ))}
        </View>
      </View>
    </>
  );
});

export default CaptureHeader;

const styles = StyleSheet.create({
  timerRow: {
    paddingVertical: spacing.md,
  },
  pageInfo: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  pageText: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
});
