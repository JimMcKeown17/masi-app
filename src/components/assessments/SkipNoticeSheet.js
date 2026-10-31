import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

// The longest word in a Question title, "comprehension", is about 97dp wide in
// textSmall at 100% text. A column needs that, its 12dp padding on each side and
// a margin, or Android breaks the word in two. When two columns can't each get
// this width, each list wraps onto its own full-width row.
const COLUMN_WIDTH_AT_100_PERCENT_TEXT = 136;

function QuestionList({ title, questions, columnWidth }) {
  return <View testID="skip-notice-list" style={[styles.list, { flexBasis: columnWidth }]}>
    <Text accessibilityRole="header" style={styles.label}>{title}</Text>
    {questions.map(question => <Text key={question} style={styles.question}>{question}</Text>)}
  </View>;
}

export default function SkipNoticeSheet({ visible, title, body, stillToDo, skipped, onAcknowledge }) {
  const { fontScale } = useWindowDimensions();
  const columnWidth = COLUMN_WIDTH_AT_100_PERCENT_TEXT * fontScale;
  const [bodyHeight, setBodyHeight] = React.useState(0);
  const [contentHeight, setContentHeight] = React.useState(0);
  // At large text the lists can outgrow the sheet. The standard footer rule then
  // shows that the body scrolls and more sits above Got it.
  const scrolls = bodyHeight > 0 && contentHeight > bodyHeight + 1;
  return <BottomSheet visible={visible} title={title} panelRole="alertdialog"
    dismissible={false} keyboardAvoiding={false}
    footerStyle={[styles.footer, scrolls && styles.footerRuled]}
    scrollViewProps={{
      onLayout: ({ nativeEvent: { layout } }) => setBodyHeight(layout.height),
      onContentSizeChange: (_width, height) => setContentHeight(height),
    }}
    footer={<BrandButton label="Got it" size="lg" onPress={onAcknowledge} />}>
    <Text style={styles.body}>{body}</Text>
    <View testID="skip-notice-lists" style={styles.lists}>
      {stillToDo.length > 0 && <QuestionList title="Still to do" questions={stillToDo} columnWidth={columnWidth} />}
      <QuestionList title="Skipped" questions={skipped} columnWidth={columnWidth} />
    </View>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  body: { ...typeRoles.textParagraph, color: colors.textSecondary },
  lists: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  list: { flexGrow: 1, flexShrink: 1, backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.ms, gap: spacing.xs },
  label: { ...typeRoles.textSectionLabel, color: colors.textSecondary },
  question: { ...typeRoles.textSmall, color: colors.text },
  footer: { borderTopWidth: 0, paddingTop: spacing.sm },
  footerRuled: { borderTopWidth: 1 },
});
