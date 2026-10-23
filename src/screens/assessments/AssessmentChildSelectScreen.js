import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, SectionList, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAssessableChildren } from '../../hooks/useAssessableChildren';
import SectionHeader from '../../components/common/SectionHeader';
import InlineLoading from '../../components/common/InlineLoading';
import { CURRENT_ITEM_SETS } from '../../assessment-questions';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

import SearchField from '../../components/common/SearchField';
import { fontFamilies } from '../../constants/typography';
import { languageCodeForHomeLanguage, LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import SelectSheet from '../../components/common/SelectSheet';

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AssessmentChildSelectScreen({ navigation, route }) {
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.md);
  const { repositories } = useSignedInEA();
  const { assessments: assessmentsRepository } = repositories;

  const { user } = useAuth();
  const { testCode } = route.params;
  const itemSets = CURRENT_ITEM_SETS[testCode] ?? {};
  const languageOptions = Object.keys(itemSets).map(code => ({ key: code, label: LANGUAGE_LABELS[code] }));
  const { yourChildren, restOfClass, loading } = useAssessableChildren();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChild, setSelectedChild] = useState(null);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [assessmentMap, setAssessmentMap] = useState({});
  const launchingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      launchingRef.current = false;
      (async () => {
        const results = await assessmentsRepository.getQuestionResults({ userId: user.id, questionCodes: [testCode] });
        const latestByChild = {};
        for (const result of results) {
          const previous = latestByChild[result.child_id];
          if (!previous || result.assessment_date > previous.assessment_date
            || (result.assessment_date === previous.assessment_date && result.created_at > previous.created_at)) {
            latestByChild[result.child_id] = result;
          }
        }
        setAssessmentMap(latestByChild);
      })();
    }, [assessmentsRepository, testCode, user.id])
  );

  const compareChildren = (a, b) => {
    const aInfo = assessmentMap[a.id];
    const bInfo = assessmentMap[b.id];
    if (!aInfo && !bInfo) return a.first_name.localeCompare(b.first_name);
    if (!aInfo) return -1;
    if (!bInfo) return 1;
    if (aInfo.assessment_date !== bInfo.assessment_date) {
      return aInfo.assessment_date < bInfo.assessment_date ? -1 : 1;
    }
    return a.first_name.localeCompare(b.first_name);
  };

  const matchesSearch = (child) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${child.first_name} ${child.last_name}`.toLowerCase();
    return fullName.includes(query);
  };
  const sections = [
    { title: 'Your children', data: [...yourChildren].sort(compareChildren).filter(matchesSearch) },
    { title: 'Rest of the class', data: [...restOfClass].sort(compareChildren).filter(matchesSearch) },
  ].filter(section => section.data.length > 0);

  const navigateToAssessment = (child, languageCode) => {
    if (launchingRef.current || !child || !itemSets[languageCode]) return;
    launchingRef.current = true;
    navigation.navigate('StandaloneTest', { testCode, child, languageCode });
  };

  const handleChildPress = (child) => {
    if (launchingRef.current) return;
    const languageCode = languageCodeForHomeLanguage(child.home_language);
    if (languageCode !== null && itemSets[languageCode]) {
      navigateToAssessment(child, languageCode);
      return;
    }
    if (selectedChild?.id !== child.id) setSelectedLanguage(null);
    setSelectedChild(child);
    setLanguagePickerVisible(true);
  };

  const handleLanguageConfirm = (languageCode) => {
    if (!itemSets[languageCode]) return;
    setSelectedLanguage(languageCode);
    navigateToAssessment(selectedChild, languageCode);
  };

  const renderChild = ({ item }) => {
    const info = assessmentMap[item.id];
    const accuracy = info?.derived?.percent;
    const accuracyColor = accuracy >= 75 ? colors.success : accuracy >= 50 ? colors.primary : colors.error;

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
            Last assessed: {formatShortDate(info.assessment_date)}
            {accuracy != null && <Text style={{ color: accuracyColor, fontFamily: fontFamilies.textBold }}> · {accuracy}%</Text>}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchbar}>
      <SearchField
        placeholder="Search children..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      </View>

      <SectionList onScroll={onScroll} scrollEventThrottle={16}
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        keyExtractor={(item) => item.id}
        renderItem={renderChild}
        contentContainerStyle={[styles.listContent, { paddingBottom }]}
        ListEmptyComponent={loading ? <InlineLoading label="Loading children…" /> : (
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {searchQuery ? 'No children match your search.' : 'No children found. Add children first.'}
            </Text>
          </View>
        )}
      />

      <SelectSheet
        key={selectedChild?.id}
        visible={languagePickerVisible}
        onDismiss={() => setLanguagePickerVisible(false)}
        title="Select language"
        dismissLabel="Dismiss assessment language picker"
        options={languageOptions}
        selectedKey={selectedLanguage}
        onSelect={handleLanguageConfirm}
        confirmLabel="Start"
        cancelLabel="Cancel"
      />
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
