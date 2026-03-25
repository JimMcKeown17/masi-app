import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text, Searchbar, Portal, Dialog, Button, RadioButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useChildren } from '../../context/ChildrenContext';
import { LETTER_SETS } from '../../constants/egraConstants';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage } from '../../utils/storage';

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AssessmentChildSelectScreen({ navigation }) {
  const { children } = useChildren();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChild, setSelectedChild] = useState(null);
  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const [assessmentMap, setAssessmentMap] = useState({});

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const assessments = await storage.getAssessments();
        const map = {};
        for (const a of assessments) {
          const existing = map[a.child_id];
          if (!existing || a.date_assessed > existing.date_assessed ||
              (a.date_assessed === existing.date_assessed && a.created_at > existing.created_at)) {
            map[a.child_id] = {
              date_assessed: a.date_assessed,
              accuracy: a.accuracy,
              attemptCount: assessments.filter(x => x.child_id === a.child_id).length,
            };
          }
        }
        setAssessmentMap(map);
      })();
    }, [])
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

  const handleChildPress = (child) => {
    setSelectedChild(child);
    setLanguageDialogVisible(true);
  };

  const handleLanguageConfirm = () => {
    setLanguageDialogVisible(false);
    const letterSet = LETTER_SETS[selectedLanguage];
    navigation.navigate('LetterAssessment', {
      child: selectedChild,
      letterSet,
      attemptNumber: (assessmentMap[selectedChild.id]?.attemptCount || 0) + 1,
    });
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
