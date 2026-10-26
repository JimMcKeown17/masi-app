import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

function QuestionList({ title, questions }) {
  return <View style={styles.list}>
    <Text accessibilityRole="header" style={styles.label}>{title}</Text>
    {questions.map(question => <Text key={question} style={styles.question}>{question}</Text>)}
  </View>;
}

export default function SkipNoticeSheet({ visible, title, body, stillToDo, skipped, onDismiss }) {
  return <BottomSheet visible={visible} title={title} panelRole="alertdialog"
    onDismiss={onDismiss} dismissLabel="Dismiss skip notice" keyboardAvoiding={false}
    footerStyle={styles.footer}
    footer={<BrandButton label="Got it" size="lg" onPress={onDismiss} />}>
    <Text style={styles.body}>{body}</Text>
    <View style={styles.lists}>
      {stillToDo.length > 0 && <QuestionList title="Still to do" questions={stillToDo} />}
      <QuestionList title="Skipped" questions={skipped} />
    </View>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  body: { ...typeRoles.textParagraph, color: colors.textSecondary },
  lists: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  list: { flex: 1, backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.ms, gap: spacing.xs },
  label: { ...typeRoles.textSectionLabel, color: colors.textSecondary },
  question: { ...typeRoles.textSmall, color: colors.text },
  footer: { borderTopWidth: 0, paddingTop: spacing.lg },
});
