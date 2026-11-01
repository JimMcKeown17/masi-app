import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { stepPhrase, tickWhenLines } from '../../numeracyLesson/copy';
import { tickedByLine } from '../../numeracyLesson/trackerModel';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';

const STATE_WORDS = { ticked: 'Ticked', assessment: 'Assessment', implied: 'Known', not_yet: 'Not yet' };

export default function StepSheet({ visible, onDismiss, curriculum, row, childFirstName, onTick, readOnly }) {
  const lines = row?.nextStepKey ? tickWhenLines(curriculum, row.nextStepKey) : null;
  return <BottomSheet visible={visible} onDismiss={onDismiss} title={row?.label} dismissLabel="Close steps"
    footer={row?.nextStepKey && !readOnly ? <BrandButton label="Tick" onPress={() => onTick(row.nextStepKey)} /> : null}>
    {row?.tiles.map(tile => {
      const byLine = tickedByLine(tile);
      return <View key={tile.stepKey} style={styles.step}>
        <Text style={styles.phrase}>{stepPhrase(curriculum, tile.stepKey)}</Text>
        <Text style={styles.secondary}>{STATE_WORDS[tile.state]}</Text>
        {byLine ? <Text style={styles.secondary}>{byLine}</Text> : null}
      </View>;
    })}
    {lines ? <View style={styles.box}>
      <Text style={styles.title}>Tick when</Text>
      <Text style={styles.body}>{`Ask ${childFirstName} on their own:`}</Text>
      <Text style={styles.body}>{lines.setup}</Text>
      {lines.items.map((item, index) => <Text key={index} style={styles.body}>{`${item.ask} → ${item.expected}`}</Text>)}
      <Text style={styles.phrase}>{lines.rule}</Text>
    </View> : null}
  </BottomSheet>;
}
const styles = StyleSheet.create({
  step: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  phrase: { ...typeRoles.textBodyStrong, color: colors.text },
  secondary: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: spacing.xs },
  box: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.md, gap: spacing.sm, marginVertical: spacing.md },
  title: { ...typeRoles.displayHeading, color: colors.text },
  body: { ...typeRoles.textParagraph, color: colors.text },
});
