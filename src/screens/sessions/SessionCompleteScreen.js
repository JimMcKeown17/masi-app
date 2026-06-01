import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getSessionsTodayGoal } from '../../services/sessionsTodayGoal';
import SessionsTodayRing from '../../components/sessions/SessionsTodayRing';
import { colors, spacing } from '../../constants/colors';

/**
 * Shown after an EA submits a session. A calm, single-action "done" moment that
 * confirms the work was captured and reflects the EA's updated daily progress,
 * reusing the same getSessionsTodayGoal source as the Sessions Today ring so the
 * two never disagree.
 */
export default function SessionCompleteScreen({ navigation, route }) {
  const { user } = useAuth();
  const [goal, setGoal] = useState(null);
  const childCount = route?.params?.childCount;
  const confirmation = childCount
    ? `Saved for ${childCount} ${childCount === 1 ? 'child' : 'children'}.`
    : "Nice work — it's saved.";

  useEffect(() => {
    let active = true;
    // Resolved fresh after the save, so the count already includes this session.
    getSessionsTodayGoal({ userId: user.id }).then((resolved) => {
      if (active) setGoal(resolved);
    });
    return () => { active = false; };
  }, [user.id]);

  return (
    <View style={styles.container}>
      <Ionicons name="checkmark-circle" size={72} color={colors.success} style={styles.icon} />
      <Text variant="titleLarge" style={styles.title}>Session captured</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>{confirmation}</Text>

      {goal && (
        <View style={styles.ringSection}>
          <SessionsTodayRing goal={goal} />
          <Text style={styles.ringCaption}>Sessions today</Text>
        </View>
      )}

      <Button mode="contained" onPress={() => navigation.goBack()} style={styles.doneButton}>
        Done
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  icon: {
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneButton: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  ringSection: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  ringCaption: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
