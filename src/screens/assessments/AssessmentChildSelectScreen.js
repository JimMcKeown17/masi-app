import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { v4 as uuid } from 'uuid';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, SectionList, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAssessableChildren } from '../../hooks/useAssessableChildren';
import SectionHeader from '../../components/common/SectionHeader';
import InlineLoading from '../../components/common/InlineLoading';
import { batteryFor, CURRENT_ITEM_SETS } from '../../assessment-questions';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

import SearchField from '../../components/common/SearchField';
import { fontFamilies, typeRoles } from '../../constants/typography';
import { languageCodeForHomeLanguage, LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import BottomSheet from '../../components/common/BottomSheet';
import BrandButton from '../../components/common/BrandButton';
import StatusBadge from '../../components/common/StatusBadge';
import { formatRunStart, runCode } from '../../utils/batteryRun';
import InlineNote from '../../components/common/InlineNote';
import Avatar from '../../components/common/Avatar';
import ListRow from '../../components/common/ListRow';
import SelectSheet from '../../components/common/SelectSheet';
import { toLocalDateString } from '../../utils/localDate';

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Membership rows can carry a language code or its display name.
function classLanguage(child) {
  const value = child.home_language?.trim();
  return value ? languageCodeForHomeLanguage(value) ?? value.toLowerCase() : null;
}

function gradeLabel(grade) {
  if (grade == null || grade === '') return null;
  return grade === 'ECD' || String(grade).startsWith('Grade ') ? grade : `Grade ${grade}`;
}

export default function AssessmentChildSelectScreen({ navigation, route }) {
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.md);
  const { handle, repositories } = useSignedInEA();
  const { assessments: assessmentsRepository, batteryRuns } = repositories;

  const { user } = useAuth();
  const { testCode, batteryCode, batteryVersion } = route.params;
  const batteryMode = batteryCode != null && batteryVersion != null;
  const battery = batteryMode ? batteryFor(batteryCode, batteryVersion) : null;
  const itemSets = CURRENT_ITEM_SETS[testCode] ?? {};
  const languages = batteryMode ? battery?.languages ?? [] : Object.keys(itemSets);
  const languageOptions = languages.map(code => ({ key: code, label: LANGUAGE_LABELS[code] ?? code }));
  const { yourChildren, restOfClass, loading } = useAssessableChildren();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChild, setSelectedChild] = useState(null);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [pendingAbandonRunId, setPendingAbandonRunId] = useState(null);
  const [assessmentMap, setAssessmentMap] = useState({});
  const [unfinishedRuns, setUnfinishedRuns] = useState([]);
  const [lastRuns, setLastRuns] = useState({});
  const [unfinishedSelection, setUnfinishedSelection] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [runsLoading, setRunsLoading] = useState(batteryMode);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const launchingRef = useRef(false);
  const startPendingRef = useRef(false);
  const focusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      launchingRef.current = startPendingRef.current;
      if (batteryMode) {
        let active = true;
        focusedRef.current = true;
        setStarting(startPendingRef.current);
        setRunsLoading(true);
        setStartError(null);
        setLastRuns({});
        batteryRuns.getUnfinishedRunsForUser(user.id)
          .then(runs => {
            if (active && handle.isCurrent()) {
              setUnfinishedRuns(runs);
              setRunsLoading(false);
            }
          }).catch(() => {
            if (active && handle.isCurrent()) setStartError("Couldn't load unfinished assessments. Try again.");
          });
        batteryRuns.getRunsForUser(user.id)
          .then(history => {
            if (active && handle.isCurrent()) {
              const latest = {};
              for (const run of history) {
                if (run.status !== 'completed' || run.battery_code !== batteryCode
                  || run.battery_version !== batteryVersion) continue;
                if (!latest[run.child_id] || run.started_at > latest[run.child_id]) latest[run.child_id] = run.started_at;
              }
              setLastRuns(latest);
            }
          }).catch(() => {
            if (active && handle.isCurrent()) console.warn("Couldn't load last battery runs.");
          });
        return () => {
          active = false;
          focusedRef.current = false;
          setLanguagePickerVisible(false);
          setUnfinishedSelection(previous => previous ? { ...previous, visible: false } : previous);
        };
      }
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
    }, [assessmentsRepository, testCode, user.id, batteryMode, batteryRuns, handle, batteryCode, batteryVersion, retryCount])
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

  const startBatteryRun = async (child, language, abandonRunId) => {
    if (launchingRef.current || !child || !battery || !handle.isCurrent() || !focusedRef.current || loading || runsLoading) return;
    if (!language || (!battery.fixedLanguage && !battery.languages.includes(language))) return;
    launchingRef.current = true;
    startPendingRef.current = true;
    setStartError(null);
    setStarting(true);
    try {
      const run = await batteryRuns.startRun({ id: uuid(), userId: user.id, childId: child.id,
        classId: child.class_id, batteryCode, batteryVersion, language,
        ...(abandonRunId ? { abandonRunId } : {}) });
      if (handle.isCurrent() && focusedRef.current) navigation.replace('BatteryOverview', { runId: run.id });
    } catch (error) {
      if (!handle.isCurrent() || !focusedRef.current) return;
      if (error.code === 'UNFINISHED_RUN_EXISTS') {
        try {
          const runs = await batteryRuns.getUnfinishedRunsForUser(user.id);
          if (!handle.isCurrent() || !focusedRef.current) return;
          const unfinished = runs.find(run => run.id === error.runId);
          if (unfinished) {
            setUnfinishedRuns(runs);
            setUnfinishedSelection({ child, run: unfinished, visible: true });
            launchingRef.current = false;
            return;
          }
        } catch {
          if (!handle.isCurrent() || !focusedRef.current) return;
        }
      }
      setStartError("Couldn't start this assessment. Try again.");
      launchingRef.current = false;
    } finally {
      startPendingRef.current = false;
      if (handle.isCurrent() && focusedRef.current) setStarting(false);
    }
  };

  const chooseBatteryLanguage = (child, abandonRunId = null) => {
    if (launchingRef.current || !battery || loading || runsLoading) return;
    const language = battery.fixedLanguage ?? classLanguage(child);
    if (language) {
      if (battery.fixedLanguage || battery.languages.includes(language)) startBatteryRun(child, language, abandonRunId);
      return;
    }
    if (selectedChild?.id !== child.id) setSelectedLanguage(null);
    setPendingAbandonRunId(abandonRunId);
    setSelectedChild(child);
    setLanguagePickerVisible(true);
  };

  const resumeRun = () => {
    if (launchingRef.current || !unfinishedSelection?.visible || !handle.isCurrent() || loading || runsLoading) return;
    launchingRef.current = true;
    navigation.replace('BatteryOverview', { runId: unfinishedSelection.run.id });
  };

  const abandonAndStart = () => {
    if (!unfinishedSelection?.visible) return;
    const { child, run } = unfinishedSelection;
    chooseBatteryLanguage(child, run.id);
    if (!classLanguage(child) && !battery.fixedLanguage) {
      setUnfinishedSelection(previous => ({ ...previous, visible: false }));
    }
  };

  const dismissUnfinished = () => {
    if (!launchingRef.current) {
      setUnfinishedSelection(previous => previous ? { ...previous, visible: false } : previous);
    }
  };

  const handleChildPress = (child) => {
    if (batteryMode) {
      if (launchingRef.current || !battery || loading || runsLoading) return;
      const unfinished = unfinishedRuns.find(run => run.child_id === child.id);
      if (unfinished) {
        setUnfinishedSelection({ child, run: unfinished, visible: true });
        return;
      }
      chooseBatteryLanguage(child);
      return;
    }
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
    if (batteryMode) {
      if (!battery?.languages.includes(languageCode) || !selectedChild) return;
      setSelectedLanguage(languageCode);
      startBatteryRun(selectedChild, languageCode, pendingAbandonRunId);
      return;
    }
    if (!itemSets[languageCode]) return;
    setSelectedLanguage(languageCode);
    navigateToAssessment(selectedChild, languageCode);
  };

  const renderChild = ({ item }) => {
    if (batteryMode) {
      const language = classLanguage(item);
      const unfinished = unfinishedRuns.find(run => run.child_id === item.id);
      const unavailable = !battery?.fixedLanguage && language && !battery?.languages.includes(language);
      const lastRun = lastRuns[item.id];
      const lastRunDate = lastRun && new Date(`${toLocalDateString(lastRun)}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      });
      return <ListRow title={`${item.first_name} ${item.last_name}`}
        subtitle={[gradeLabel(item.grade), language ? LANGUAGE_LABELS[language] ?? item.home_language : 'class language not set',
          lastRunDate ? `last assessed ${lastRunDate}` : null].filter(Boolean).join(' · ')}
        titleStyle={unavailable ? styles.unavailableName : undefined}
        note={unavailable ? `Not available in ${LANGUAGE_LABELS[language] ?? item.home_language} yet` : undefined}
        noteStyle={styles.unavailable}
        lead={<Avatar muted={Boolean(unavailable)} label={`${item.first_name?.[0] ?? ''}${item.last_name?.[0] ?? ''}`.toUpperCase()} />}
        trailing={!unavailable && unfinished && battery
            ? <StatusBadge tone="warning" label={`Unfinished ${unfinished.question_count}/${battery.questions.length}`} />
            : undefined}
        disabled={!battery || Boolean(unavailable) || loading || runsLoading}
        accessibilityLabel={`Select ${item.first_name} ${item.last_name} for assessment`}
        onPress={() => handleChildPress(item)} />;
    }
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
      {battery && <Text style={styles.batterySubtitle}>
        {battery.title} · in the child's class language
      </Text>}
      <View style={styles.searchbar}>
      <SearchField
        placeholder="Search children..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      </View>

      {batteryMode && startError && !unfinishedSelection?.visible && <View style={styles.errorNote}>
        <InlineNote>{startError}</InlineNote>
        {runsLoading && <BrandButton label="Retry" variant="tertiary" onPress={() => setRetryCount(value => value + 1)} />}
      </View>}
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

      <BottomSheet visible={Boolean(unfinishedSelection?.visible)}
        title={`${unfinishedSelection?.child.first_name} has an unfinished assessment`}
        subtitle={unfinishedSelection ? `Started ${formatRunStart(unfinishedSelection.run.started_at, new Date())} · ${unfinishedSelection.run.question_count} of ${battery.questions.length} Questions done · code ${runCode(unfinishedSelection.run.id)}` : undefined}
        onDismiss={dismissUnfinished} dismissLabel="Dismiss unfinished assessment">
        <View style={styles.sheetActions}>
          {startError && <InlineNote>{startError}</InlineNote>}
          <BrandButton label="Resume" onPress={resumeRun} disabled={starting || loading || runsLoading} />
          <InlineNote tone="warning">{`Starting new closes the old assessment as abandoned. ${unfinishedSelection?.run.question_count
            ? `Its ${unfinishedSelection.run.question_count} saved ${unfinishedSelection.run.question_count === 1 ? 'Question stays' : 'Questions stay'} in ${unfinishedSelection.child.first_name}'s history.`
            : 'Nothing was saved in it yet.'}`}</InlineNote>
          <BrandButton label="Abandon it and start new" variant="warning" onPress={abandonAndStart} loading={starting} disabled={loading || runsLoading} />
          <BrandButton label="Cancel" variant="tertiary" tone="ink" onPress={dismissUnfinished} disabled={starting} />
        </View>
      </BottomSheet>

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
  errorNote: { marginHorizontal: spacing.md, gap: spacing.sm },
  sheetActions: { gap: spacing.md },
  unavailable: { ...typeRoles.textNote, color: colors.warningText },
  unavailableName: { color: colors.disabled },
  batterySubtitle: { ...typeRoles.textParagraph, color: colors.textSecondary, margin: spacing.md, marginBottom: 0 },
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
