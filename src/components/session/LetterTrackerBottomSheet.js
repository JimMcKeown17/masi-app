import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { letterStateColors } from '../../constants/letterStateColors';
import { PEDAGOGICAL_ORDERS } from '../../utils/assessmentRegistry';
import { loadMasteryState, countMastered } from '../../utils/masteryState';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import LetterToggleGrid from '../sessions/LetterToggleGrid';
import { fontFamilies, typeRoles } from '../../constants/typography';


/**
 * Bottom sheet for updating a child's letter tracker from the session form.
 *
 * Props:
 *   visible         - boolean
 *   onDismiss       - () => void
 *   child           - child object { id, first_name, last_name }
 *   languageCode    - 'en', 'xh', 'af', 'zu' or null
 *   pendingChanges  - { [letter]: { mastered: boolean, languageCode: string, madeAt: string } } changes made this session
 *   onChangesUpdate - (changes: { [letter]: { mastered: boolean, languageCode: string, madeAt: string } }) => void
 */
export default function LetterTrackerBottomSheet({
  visible,
  onDismiss,
  child,
  userId,
  languageCode,
  pendingChanges,
  onChangesUpdate,
}) {
  const { repositories } = useSignedInEA();

  const [assessmentMastered, setAssessmentMastered] = useState(new Set());
  const [existingTaught, setExistingTaught] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageCode];

  useEffect(() => {
    if (!visible || !child) return;

    (async () => {
      setLoading(true);
      try {
        const { assessmentMastered: masteredSet, taughtRecords } = await loadMasteryState({ repositories,
          userId,
          childId: child.id,
          languageCode,
        });
        setAssessmentMastered(masteredSet);
        setExistingTaught(new Set(taughtRecords.map(r => r.letter)));
      } catch (error) {
        console.error('Error loading tracker data for bottom sheet:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, child?.id, languageCode, userId]);

  const getCellState = (letter) => {
    if (assessmentMastered.has(letter)) return 'assessment';

    // Check pending changes first (overrides existing state)
    if (pendingChanges[letter]?.mastered === true) return 'taught';
    if (pendingChanges[letter]?.mastered === false) return 'default';

    // Fall back to existing stored state
    if (existingTaught.has(letter)) return 'taught';
    return 'default';
  };

  const handleCellTap = (letter) => {
    // Assessment-mastered cells are locked
    if (assessmentMastered.has(letter)) return;

    const currentState = getCellState(letter);
    const newChanges = { ...pendingChanges };

    if (currentState === 'taught') {
      // Toggle OFF
      if (existingTaught.has(letter)) {
        // Was already taught before this session — mark for removal
        newChanges[letter] = {
          mastered: false,
          languageCode,
          madeAt: new Date().toISOString(),
        };
      } else {
        // Was added during this session — just remove the pending add
        delete newChanges[letter];
      }
    } else {
      // Toggle ON
      if (existingTaught.has(letter)) {
        // Was taught before, then un-taught in this session — cancel the removal
        delete newChanges[letter];
      } else {
        // Brand new — mark for addition
        newChanges[letter] = {
          mastered: true,
          languageCode,
          madeAt: new Date().toISOString(),
        };
      }
    }

    onChangesUpdate(newChanges);
  };

  const childName = child ? `${child.first_name} ${child.last_name}` : '';

  // Count total mastered for display
  const masteredCount = pedagogicalOrder
    ? countMastered({ assessmentMastered, taughtLetters: existingTaught, pendingChanges, pedagogicalOrder })
    : 0;

  const tileFor = (letter) => {
    const state = getCellState(letter);
    if (state === 'assessment') return {
      tone: 'locked', disabled: true,
      accessibilityLabel: `${letter}, mastered from assessment, locked`, accessibilityState: { disabled: true },
    };
    const added = pendingChanges[letter]?.mastered === true;
    const taught = state === 'taught';
    return {
      tone: added ? 'taughtNew' : taught ? 'taught' : 'rest',
      accessibilityLabel: `${letter}, ${added ? 'taught, added this session' : taught ? 'taught by coach' : 'not mastered'}`,
      accessibilityState: { selected: taught },
    };
  };

  const legend = loading || !pedagogicalOrder ? null : (
    <View style={styles.legend}>
      {[
        ['Taught', 'taught'], ['New this session', 'taught'],
        ['Not yet', 'default'], ['Assessment (locked)', 'assessment'],
      ].map(([label, state]) => {
        const palette = letterStateColors[state];
        return <View key={label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            {label === 'New this session' ? <View style={styles.legendDot} /> : null}
          </View>
          <Text style={styles.legendLabel}>{label}</Text>
        </View>;
      })}
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Letter tracker"
      subtitle={pedagogicalOrder ? <>{childName} · <Text style={styles.subtitleStrong}>{masteredCount}/26</Text> letters</> : childName}
      dismissLabel="Dismiss letter tracker"
      headerExtras={legend}
      footer={<BrandButton variant="primary" size="lg" label="Done" onPress={onDismiss} />}
      scrollable={false}
      keyboardAvoiding={false}
    >
      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      ) : !pedagogicalOrder ? (
        <Text style={styles.missingSetText}>No letter set for this class language.</Text>
      ) : (
        <LetterToggleGrid letters={pedagogicalOrder} tileFor={tileFor} onPressLetter={handleCellTap} />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  missingSetText: { ...typeRoles.textBody, color: colors.textSecondary, paddingVertical: spacing.md },
  loadingArea: { padding: spacing.xl, alignItems: 'center' },
  subtitleStrong: { fontFamily: fontFamilies.textHeavy, color: colors.text },
  // BottomSheet already gives its subtitle 16dp below; the board asks for 14.
  legend: { marginTop: -2, flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 16 },
  legendItem: { flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onDark },
  legendLabel: { ...typeRoles.textCaption, color: colors.textSecondary, flexShrink: 1 },
});
