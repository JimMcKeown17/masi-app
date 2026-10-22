import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import SelectableRow from '../forms/SelectableRow';

export default React.memo(function LessonBookSection({ draft, choices, isEcd, onToggle }) {
  if (isEcd) return null;
  const book = choices.books.find(item => item.suggested);
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>3 · Pair reading · 5 min</Text>
    {!choices.contentAvailable.books ? <Text style={styles.body}>{`No books for ${LANGUAGE_LABELS[draft.language_code]} yet.`}</Text>
      : book ? <>
        <View style={styles.book}>
          <View style={styles.cover} accessible={false}>
            <Ionicons name="book-outline" size={32} color={colors.primary} accessible={false} />
          </View>
          <View style={styles.description}>
            <Text style={styles.title}>{book.title}</Text>
            <Text style={styles.body}>{`Step ${book.step}`}</Text>
          </View>
        </View>
        <SelectableRow variant="checkbox" title="Read" accessibilityLabel="Read" position="only"
          selected={(draft.ticks.books ?? []).some(item => item.id === book.id)} onPress={() => onToggle(book.id)} />
      </> : null}
  </View>;
});
const styles = StyleSheet.create({
  section: { gap: spacing.ms },
  heading: { ...typeRoles.displayHeading, color: colors.text },
  body: { ...typeRoles.textBody, color: colors.textSecondary },
  book: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cover: { minWidth: 64, minHeight: 80, borderRadius: borderRadius.md,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  description: { flex: 1, gap: spacing.xs },
  title: { ...typeRoles.textRowTitle, color: colors.text },
});
