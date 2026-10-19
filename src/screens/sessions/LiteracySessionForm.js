import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { typeRoles } from '../../constants/typography';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing } from '../../constants/colors';
import { LETTER_ORDER, READING_LEVELS } from '../../constants/literacyConstants';
import LetterToggleGrid from '../../components/sessions/LetterToggleGrid';
import StepHeader from '../../components/forms/StepHeader';
import InlineNote from '../../components/common/InlineNote';
import ChildSelector from '../../components/children/ChildSelector';
import LetterTrackerBottomSheet from '../../components/session/LetterTrackerBottomSheet';
import { normalizeLanguageKey } from '../../utils/letterMastery';
import { useClasses } from '../../context/ClassesContext';
import { useLookupsContext } from '../../context/LookupsContext';
import { buildSessionTypeFields } from '../../utils/sessionTypeResolver';
import { persistLiteracySession } from '../../services/literacySessionPersistence';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import { toLocalDateString } from '../../utils/localDate';
import { validateLiteracySession } from '../../utils/literacySessionValidation';
import { v4 as uuidv4 } from 'uuid';
import { formatSessionDate } from '../../utils/sessionDateFormat';
import MonthCalendar from '../../components/common/MonthCalendar';
import ChildProgressBlock from '../../components/sessions/ChildProgressBlock';
import TextField from '../../components/common/TextField';
import SelectField from '../../components/common/SelectField';
import BottomSheet from '../../components/common/BottomSheet';
import BrandButton from '../../components/common/BrandButton';
import SelectSheet from '../../components/common/SelectSheet';
import ConfirmSheet from '../../components/common/ConfirmSheet';
import { useHeaderHairline } from '../../components/common/ScreenHeader';

const READING_LEVEL_OPTIONS = READING_LEVELS.map(level => ({ key: level, label: level }));

function FormHeader({ sessionDateKey, todayKey, dateMenuVisible, onDismissDateMenu, onOpenDateMenu, onSelectDate }) {
  const label = formatSessionDate(sessionDateKey, sessionDateKey === todayKey ? 'fieldToday' : 'field');
  return <View style={styles.dateSection}>
    <View style={styles.stepHeading}><StepHeader step={1} label="Session date" status="done" /></View>
    <SelectField label="Day" icon="calendar-outline" value={label}
      accessibilityLabel={`Session date, ${label}. Change date`} onPress={onOpenDateMenu} />
    <BottomSheet visible={dateMenuVisible} onDismiss={onDismissDateMenu} title="Session date"
      dismissLabel="Dismiss session date picker" keyboardAvoiding={false}
      footer={<BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={onDismissDateMenu} />}>
      {dateMenuVisible ? <MonthCalendar selectedKey={sessionDateKey} todayKey={todayKey} onSelect={onSelectDate} /> : null}
    </BottomSheet>
  </View>;
}

function FormFooter({
  selectedLetters,
  onToggleLetter,
  validationErrors,
  sessionReadingLevel,
  onOpenReadingLevelMenu,
  comments,
  onCommentsChange,
  selectedChildren,
  childReadingLevels,
  classes,
  onOpenChildLevelMenu,
  getTrackerChangeCount,
  onOpenLetterTracker,
  onSubmit,
  submitting,
}) {
  return (
    <>
      <View testID="letters-section" style={styles.lettersSection}>
        <View style={styles.stepHeading}>
          <StepHeader step={3} label="Letters focused on" right="Tap to select"
            status={validationErrors.letters ? 'error' : selectedLetters.length > 0 ? 'done' : 'todo'} />
        </View>
        {validationErrors.letters ? <View style={styles.stepError}>
          <InlineNote tone="error">{validationErrors.letters}</InlineNote>
        </View> : null}
        <LetterToggleGrid letters={LETTER_ORDER} onPressLetter={onToggleLetter} tileFor={(letter) => {
          const selected = selectedLetters.includes(letter);
          return { tone: selected ? 'selected' : 'rest', accessibilityLabel: `${letter.toUpperCase()}, ${selected ? 'selected' : 'not selected'}`, accessibilityState: { selected } };
        }} />
      </View>

      <View testID="reading-level-section" style={styles.section}>
        <View style={styles.stepHeading}>
          <StepHeader step={4} label="Session reading level"
            status={validationErrors.readingLevel ? 'error' : sessionReadingLevel ? 'done' : 'todo'} />
        </View>
        {validationErrors.readingLevel ? <View style={styles.stepError}>
          <InlineNote tone="error">{validationErrors.readingLevel}</InlineNote>
        </View> : null}
        <SelectField label="Focused on today" value={sessionReadingLevel} placeholder="Select a level"
          error={Boolean(validationErrors.readingLevel)} onPress={onOpenReadingLevelMenu} />
      </View>

      <View style={styles.section}>
        <View style={styles.stepHeading}><StepHeader step={5} label="Comments" right="Optional" /></View>
        <TextField multiline label="Session notes" placeholder="Add session notes…"
          accessibilityLabel="Comments, optional" value={comments} onChangeText={onCommentsChange}
          {...NO_TEXT_SUGGESTIONS} />
      </View>

      {selectedChildren.length > 0 ? <View testID="child-progress-section" style={styles.section}>
        <StepHeader step={6} label="Update child progress" right="Optional" />
        <Text style={styles.progressDescription}>Record each child’s current level and update the letters they have mastered.</Text>
        <View style={styles.progressBlocks}>
          {selectedChildren.map(child => <ChildProgressBlock key={child.id} child={child}
            className={classes.find(item => item.id === child.class_id)?.name}
            readingLevel={childReadingLevels[child.id]} trackerChangeCount={getTrackerChangeCount(child.id)}
            onOpenLevel={onOpenChildLevelMenu} onOpenTracker={onOpenLetterTracker} />)}
        </View>
      </View> : null}

      <Button
        mode="contained"
        onPress={onSubmit}
        disabled={submitting}
        loading={submitting}
        style={styles.submitButton}
        contentStyle={styles.submitButtonContent}
      >
        Submit Session
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------
export default function LiteracySessionForm({ navigation }) {
  const { handle } = useSignedInEA();
  const toast = useToast();
  const onScroll = useHeaderHairline();

  const { user, profile } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();
  const { classes } = useClasses();
  const { jobTitles } = useLookupsContext();

  const [sessionId] = useState(() => uuidv4());
  const [sessionDateKey, setSessionDateKey] = useState(() => toLocalDateString(new Date()));
  const todayKey = toLocalDateString(new Date());
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [selectedLetters, setSelectedLetters] = useState([]);
  const [sessionReadingLevel, setSessionReadingLevel] = useState(null);
  const [readingLevelMenuVisible, setReadingLevelMenuVisible] = useState(false);
  const [childReadingLevels, setChildReadingLevels] = useState({});
  // Track which child's reading-level menu is open (by child id or null)
  const [openChildLevelMenu, setOpenChildLevelMenu] = useState(null);
  // Letter tracker: { [childId]: { [letter]: true/false } } — pending changes per child
  const [letterTrackerChanges, setLetterTrackerChanges] = useState({});
  const [trackerBottomSheetChild, setTrackerBottomSheetChild] = useState(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Dirty = any save-bearing field differs from its initial value (all of these reach
  // the persisted session payload in handleSubmit).
  const [initialSessionDateKey] = useState(sessionDateKey);
  const isDirty =
    selectedChildren.length > 0 ||
    selectedLetters.length > 0 ||
    sessionReadingLevel !== null ||
    Object.keys(childReadingLevels).length > 0 ||
    Object.values(letterTrackerChanges).some((changes) => Object.keys(changes || {}).length > 0) ||
    comments.trim().length > 0 ||
    sessionDateKey !== initialSessionDateKey;

  const [allowLeave, setAllowLeave] = useState(false);
  const preventLeave = isDirty && !allowLeave;
  const storedActionRef = useRef(null);
  const [discardVisible, setDiscardVisible] = useState(false);
  const pendingCompletionRef = useRef(null);
  usePreventRemove(preventLeave, ({ data }) => {
    storedActionRef.current = data.action;
    setDiscardVisible(true);
  });

  // This effect must follow usePreventRemove: its guard releases on the committed
  // allowLeave render before we replace the form. A failed save never releases it.
  useEffect(() => {
    if (!allowLeave || !pendingCompletionRef.current) return;
    const params = pendingCompletionRef.current;
    pendingCompletionRef.current = null;
    navigation.replace('SessionComplete', params);
    triggerBackgroundSync?.();
    Promise.resolve()
      .then(() => refreshSyncStatus())
      .catch((error) => {
        console.error('Error refreshing sync status after session save:', error);
      });
  }, [allowLeave, navigation, triggerBackgroundSync, refreshSyncStatus]);

  const cancelDiscard = () => {
    setDiscardVisible(false);
    storedActionRef.current = null;
  };
  const confirmDiscard = () => {
    const action = storedActionRef.current;
    storedActionRef.current = null;
    setDiscardVisible(false);
    if (action) navigation.dispatch(action);
  };

  // Derive the group ids that were implicitly used (not tracked in this simple flow,
  // so we leave group_ids as an empty array — future enhancement).
  const selectedChildIds = useMemo(() => selectedChildren.map((c) => c.id), [selectedChildren]);

  const handleChildrenChange = useCallback((newSelection) => {
    setSelectedChildren(newSelection);
    setChildReadingLevels((previousLevels) => {
      const nextLevels = {};
      for (const child of newSelection) {
        const readingLevel = previousLevels[child.id] || child.reading_level;
        if (readingLevel) nextLevels[child.id] = readingLevel;
      }
      return nextLevels;
    });
    if (newSelection.length > 0) {
      setValidationErrors((prev) => { const { children, ...rest } = prev; return rest; });
    }
  }, []);

  const handleToggleLetter = (letter) => {
    setSelectedLetters((prev) => {
      const next = prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter];
      if (next.length > 0) {
        setValidationErrors((e) => { const { letters, ...rest } = e; return rest; });
      }
      return next;
    });
  };

  const handleSetChildReadingLevel = (childId, level) => {
    setChildReadingLevels((prev) => ({ ...prev, [childId]: level }));
    setOpenChildLevelMenu(null);
  };

  const handleTrackerChangesUpdate = (childId, changes) => {
    setLetterTrackerChanges((prev) => ({ ...prev, [childId]: changes }));
  };

  // Determine language key for letter tracker from the first selected child's class
  const trackerLanguageKey = useMemo(() => {
    if (selectedChildren.length === 0) return 'english';
    const firstChild = selectedChildren[0];
    const childClass = classes.find(c => c.id === firstChild.class_id);
    return normalizeLanguageKey(childClass?.home_language);
  }, [selectedChildren, classes]);

  // Count pending tracker changes for a child (for button label)
  const getTrackerChangeCount = (childId) => {
    const changes = letterTrackerChanges[childId] || {};
    return Object.values(changes).filter(v => v === true).length;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const errors = validateLiteracySession({ selectedChildren, selectedLetters, sessionReadingLevel });
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    submittingRef.current = true;
    setValidationErrors({});
    setSubmitting(true);

    try {
      const now = new Date().toISOString();
      const session = {
        id: sessionId,
        user_id: user.id,
        ...buildSessionTypeFields({ profile, jobTitlesCache: jobTitles }),
        session_date: sessionDateKey,
        children_ids: selectedChildIds,
        group_ids: [],
        activities: {
          letters_focused: selectedLetters,
          session_reading_level: sessionReadingLevel,
          child_reading_levels: childReadingLevels,
          comments: comments.trim() || null,
        },
        notes: comments.trim() || null,
        synced: false,
        created_at: now,
        updated_at: now,
      };

      await persistLiteracySession({ handle,
        session,
        trackerLanguageKey,
        letterTrackerChanges,
        nowIso: now,
        idFactory: uuidv4,
      });

      // Replace (not push) so Back can't return to the just-submitted form; the
      // completion screen confirms capture and shows updated daily progress.
      pendingCompletionRef.current = { childCount: selectedChildIds.length };
      setAllowLeave(true);
    } catch (error) {
      submittingRef.current = false;
      console.error('Error saving session:', error);
      toast.show({ message: 'Failed to save session. Please try again.', tone: 'error', duration: 3000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View testID="literacy-session-form" style={styles.outerContainer}>
      <ConfirmSheet
        visible={discardVisible}
        title="Discard this session?"
        body="Your session details have not been saved. Leaving now will discard them."
        confirmLabel="Discard"
        confirmVariant="destructiveQuiet"
        cancelLabel="Keep editing"
        dismissLabel="Dismiss discard confirmation"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
      <ChildSelector
        selectedChildren={selectedChildren}
        onSelectionChange={handleChildrenChange}
        selectionError={validationErrors.children}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        onScroll={onScroll}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        ListHeaderComponent={
          <FormHeader
            sessionDateKey={sessionDateKey}
            todayKey={todayKey}
            dateMenuVisible={dateMenuVisible}
            onDismissDateMenu={() => setDateMenuVisible(false)}
            onOpenDateMenu={() => setDateMenuVisible(true)}
            onSelectDate={(date) => {
              setSessionDateKey(date);
              setDateMenuVisible(false);
            }}
          />
        }
        ListFooterComponent={
          <FormFooter
            selectedLetters={selectedLetters}
            onToggleLetter={handleToggleLetter}
            validationErrors={validationErrors}
            sessionReadingLevel={sessionReadingLevel}
            onOpenReadingLevelMenu={() => setReadingLevelMenuVisible(true)}
            comments={comments}
            onCommentsChange={setComments}
            selectedChildren={selectedChildren}
            childReadingLevels={childReadingLevels}
            classes={classes}
            onOpenChildLevelMenu={setOpenChildLevelMenu}
            getTrackerChangeCount={getTrackerChangeCount}
            onOpenLetterTracker={setTrackerBottomSheetChild}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        }
      />

      {/* ── Letter Tracker Bottom Sheet ── */}
      <LetterTrackerBottomSheet
        visible={trackerBottomSheetChild !== null}
        onDismiss={() => setTrackerBottomSheetChild(null)}
        child={trackerBottomSheetChild}
        userId={user.id}
        languageKey={trackerLanguageKey}
        pendingChanges={trackerBottomSheetChild ? (letterTrackerChanges[trackerBottomSheetChild.id] || {}) : {}}
        onChangesUpdate={(changes) => {
          if (trackerBottomSheetChild) {
            handleTrackerChangesUpdate(trackerBottomSheetChild.id, changes);
          }
        }}
      />

      <SelectSheet
        visible={readingLevelMenuVisible}
        onDismiss={() => setReadingLevelMenuVisible(false)}
        title="Session reading level"
        subtitle="What level did you focus on today?"
        cancelLabel="Cancel"
        dismissLabel="Dismiss session reading level picker"
        options={READING_LEVEL_OPTIONS}
        selectedKey={sessionReadingLevel}
        onSelect={(value) => {
          setSessionReadingLevel(value);
          setValidationErrors((prev) => { const { readingLevel, ...rest } = prev; return rest; });
        }}
      />

      <SelectSheet
        visible={openChildLevelMenu !== null}
        onDismiss={() => setOpenChildLevelMenu(null)}
        title="Reading level"
        subtitle={selectedChildren.filter(child => child.id === openChildLevelMenu).map(child => `${child.first_name} ${child.last_name}`).join('')}
        dismissLabel="Dismiss child reading level picker"
        options={READING_LEVEL_OPTIONS}
        selectedKey={openChildLevelMenu ? (childReadingLevels[openChildLevelMenu] || null) : null}
        onSelect={(value) => handleSetChildReadingLevel(openChildLevelMenu, value)}
        cancelLabel="Cancel"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  dateSection: { marginBottom: 24 },
  lettersSection: { marginTop: 24, marginBottom: 24 },
  stepHeading: { marginBottom: 12 },
  stepError: { marginBottom: 24 },
  outerContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 34,
  },
  section: { marginBottom: 24 },
  progressDescription: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
  progressBlocks: { marginTop: 12, gap: 12 },
  submitButton: {
    marginBottom: spacing.lg,
  },
  submitButtonContent: {
    paddingVertical: spacing.sm,
  },
});
