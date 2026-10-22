import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import BrandButton from '../common/BrandButton';
import BlendTile from './BlendTile';
import BlendPoolSheet from './BlendPoolSheet';

const tierLabels = { '2 Letter Blends': '2-letter', '3 Letter Blends': '3-letter',
  '4 Letter Blends': '4-letter', 'Word Reading': 'words' };

export default React.memo(function LessonBlendSection({ draft, plan, choices, participants, onToggle, onTier, error }) {
  const [poolVisible, setPoolVisible] = useState(false);
  const tiers = choices.tiers;
  const tier = tiers.find(item => item.tier === draft.ticks.blendTierShown) ?? tiers[0];
  const label = tierLabels[tier?.tier ?? plan.blend_tier] ?? '2-letter';
  const selected = draft.ticks.blends ?? [];
  const suggested = tier?.suggested ?? [];
  // Every ticked blend stays on screen, whatever tier is showing, so nothing recorded is hidden
  // and every tick can be undone (an attendance change can remove the tier it came from).
  const catalogue = new Map(tiers.flatMap(item => item.pool).map(item => [item.text, item]));
  const items = [...suggested, ...selected.filter(text => !suggested.some(suggestion => suggestion.text === text))
    .map(text => catalogue.get(text) ?? { text, display: text })];
  return <View testID="lesson-blends" style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{`2 · Blending · 15 min · ${label}`}</Text>
    {!choices.contentAvailable.blends ? <Text style={styles.body}>{`No blends for ${LANGUAGE_LABELS[draft.language_code]} yet.`}</Text> : <>
      <View style={styles.tiles}>
        {items.map(item => <BlendTile key={item.text} text={item.text} display={item.display}
          tone={selected.includes(item.text) ? 'selected' : 'rest'} onPress={() => onToggle(item.text)} />)}
      </View>
      {tier?.pool.length ? <BrandButton label="+ more" variant="tertiary" onPress={() => setPoolVisible(true)} /> : null}
      {tiers.filter(item => item !== tier).map(item => {
        const names = item.childIds.map(id => participants.find(child => child.id === id)?.first_name).filter(Boolean);
        const ahead = item !== tiers[0] && names.length ? ` (${names.join(' & ')} ${names.length === 1 ? 'is' : 'are'} ahead)` : '';
        return <BrandButton key={item.tier} label={`Show ${tierLabels[item.tier]}${ahead}`} variant="tertiary"
          onPress={() => onTier(item.tier)} />;
      })}
    </>}
    <BlendPoolSheet visible={poolVisible} onDismiss={() => setPoolVisible(false)} title="Blending"
      pool={tier?.pool ?? []} selected={selected} onToggle={onToggle} error={error} />
  </View>;
});
const styles = StyleSheet.create({
  section: { gap: spacing.ms },
  heading: { ...typeRoles.displayHeading, color: colors.text },
  body: { ...typeRoles.textBody, color: colors.textSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
