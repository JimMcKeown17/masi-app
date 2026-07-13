import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text, Searchbar, Portal, Dialog, Button, RadioButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { LETTER_SETS, WORD_SETS } from '../../constants/egraConstants';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import { resolveAssessmentRoute } from '../../utils/assessmentRouting';
import { buildAssessmentMap } from '../../utils/assessmentHistoryMap';

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AssessmentChildSelectScreen({ navigation, route }) {
  const { user } = useAuth();
  const assessmentType = route.params?.assessmentType || 'letter_egra';
  const isWordAssessment = assessmentType === 'word_egra';
  const itemSets = isWordAssessment ? WORD_SETS : LETTER_SETS;
  const { children } = useChildren();
  const { classes } = useClasses();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChild, setSelectedChild] = useState(null);
  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [assessmentMap, setAssessmentMap] = useState({});
  const launchingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const allAssessments = await assessmentsRepository.getAssessments({ userId: user.id });
        setAssessmentMap(buildAssessmentMap(allAssessments, assessmentType));
      })();
    }, [assessmentType, user.id])
  );

  const sortedChildren = [...children].sort((a, b) => {
    const aInfo = assessmentMap[a.id];
    const bInfo = assessmentMap[b.id];
    if (!aInfo && !bInfo) return a.first_name.localeCompare(b.first_name);
    if (!aInfo) return -1;
    if (!bInfo) return 1;
    if (aInfo.date_assessed !== bInfo.date_assessed) {
      return aInfo.date_assessed < bInfo.date_assessed ? -1 : 1;
    }
    return a.first_name.localeCompare(b.first_name);
  });

  const filteredChildren = sortedChildren.filter((child) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${child.first_name} ${child.last_name}`.toLowerCase();
    return fullName.includes(query);
  });

  const navigateToAssessment = async (child, letterSet) => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    try {
      const { screenName, captureMode } = await resolveAssessmentRoute();
      navigation.navigate(screenName, {
        child,
        letterSet,
        attemptNumber: (assessmentMap[child.id]?.attemptCount || 0) + 1,
        assessmentType,
        captureMode,
      });
    } finally {
      launchingRef.current = false;
    }
  };

  const handleChildPress = (child) => {
    // Auto-detect language from the child's class
    if (child.class_id) {
      const childClass = classes.find((c) => c.id === child.class_id);
      if (childClass?.home_language) {
        const key = childClass.home_language.toLowerCase();
        if (itemSets[key]) {
          navigateToAssessment(child, itemSets[key]);
          return;
        }
      }
    }
    // Fallback: show language picker dialog
    setSelectedChild(child);
    setLanguageDialogVisible(true);
  };

  const handleLanguageConfirm = () => {
    setLanguageDialogVisible(false);
    navigateToAssessment(selectedChild, itemSets[selectedLanguage]);
  };

  const renderChild = ({ item }) => {
    const info = assessmentMap[item.id];
    const accuracyColor = info
      ? info.accuracy >= 75 ? colors.success : info.accuracy >= 50 ? colors.primary : colors.error
      : null;

    return (
      <Pressable
        onPress={() => handleChildPress(item)}
        style={({ pressed }) => [styles.childRow, pressed && styles.childRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.first_name} ${item.last_name} for assessment`}
      >
        <Text variant="bodyLarge" style={styles.childName}>
          {item.first_name} {item.last_name}
        </Text>
        {info && (
          <Text variant="bodySmall" style={styles.subtitle}>
            Last assessed: {formatShortDate(info.date_assessed)} ·{' '}
            <Text style={{ color: accuracyColor, fontWeight: '700' }}>{info.accuracy}%</Text>
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search children..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
        {...NO_TEXT_SUGGESTIONS}
      />

      <FlatList
        data={filteredChildren}
        keyExtractor={(item) => item.id}
        renderItem={renderChild}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {searchQuery ? 'No children match your search.' : 'No children found. Add children first.'}
            </Text>
          </View>
        }
      />

      <Portal>
        <Dialog visible={languageDialogVisible} onDismiss={() => setLanguageDialogVisible(false)}>
          <Dialog.Title>Select Language</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={setSelectedLanguage} value={selectedLanguage}>
              <RadioButton.Item label="English" value="english" />
              <RadioButton.Item label="isiXhosa" value="isixhosa" />
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLanguageDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleLanguageConfirm}>Start</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchbar: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  childRow: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
    ...shadows.card,
  },
  childRowPressed: {
    opacity: 0.7,
  },
  childName: {
    color: colors.text,
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
