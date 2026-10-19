import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Menu,
  IconButton,
} from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fontFamilies } from '../../constants/typography';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { LETTER_ORDER, READING_LEVELS } from '../../constants/literacyConstants';
import LetterGrid from '../../components/session/LetterGrid';
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
import SelectSheet from '../../components/common/SelectSheet';
import ConfirmSheet from '../../components/common/ConfirmSheet';

const READING_LEVEL_OPTIONS = READING_LEVELS.map(level => ({ key: level, label: level }));

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function formatDateForDisplay(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateForStorage(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getProgrammeCalendarDate(value = new Date()) {
  const [year, month, day] = toLocalDateString(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

// ---------------------------------------------------------------------------
// InlineCalendar — renders month grid, disables future dates
// ---------------------------------------------------------------------------
function InlineCalendar({ selectedDate, onSelectDate }) {
  const today = getProgrammeCalendarDate();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    // Don't allow navigating past current month
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    if (nextYear > today.getFullYear() || (nextYear === today.getFullYear() && nextMonth > today.getMonth())) {
      return;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const canGoNext =
    viewYear < today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth < today.getMonth());

  const isSelectedDay = (day) =>
    day === selectedDate.getDate() &&
    viewMonth === selectedDate.getMonth() &&
    viewYear === selectedDate.getFullYear();

  const isFutureDay = (day) => {
    const candidate = new Date(viewYear, viewMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return candidate > todayMidnight;
  };

  const handleDayPress = (day) => {
    if (isFutureDay(day)) return;
    onSelectDate(new Date(viewYear, viewMonth, day));
  };

  // Build grid rows
  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(null); // empty leading cells
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View style={calStyles.calendar}>
      {/* Month / Year header with arrows */}
      <View style={calStyles.monthHeader}>
        <IconButton icon="chevron-left" onPress={goToPrevMonth} size={20} />
        <Text variant="titleSmall" style={calStyles.monthTitle}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <IconButton icon="chevron-right" onPress={goToNextMonth} size={20} disabled={!canGoNext} />
      </View>

      {/* Day-of-week headers */}
      <View style={calStyles.dayHeaderRow}>
        {DAY_HEADERS.map((h) => (
          <Text key={h} variant="bodySmall" style={calStyles.dayHeader}>{h}</Text>
        ))}
      </View>

      {/* Day grid */}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={calStyles.dayRow}>
          {row.map((day, colIndex) => {
            if (day === null) {
              return <View key={`empty-${colIndex}`} style={calStyles.dayCell} />;
            }
            const future = isFutureDay(day);
            const selected = isSelectedDay(day);
            return (
              <Pressable
                key={day}
                onPress={() => handleDayPress(day)}
                disabled={future}
                accessibilityRole="button"
                accessibilityLabel={`Select ${formatDateForDisplay(new Date(viewYear, viewMonth, day))}`}
                accessibilityState={{ disabled: future, selected }}
                style={[
                  calStyles.dayCell,
                  selected && calStyles.dayCellSelected,
                  future && calStyles.dayCellFuture,
                ]}
              >
                <Text
                  variant="bodySmall"
                  style={[
                    calStyles.dayText,
                    selected && calStyles.dayTextSelected,
                    future && calStyles.dayTextFuture,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FormHeader({
  sessionDate,
  dateMenuVisible,
  onDismissDateMenu,
  onOpenDateMenu,
  onSelectDate,
}) {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleSmall" style={styles.sectionLabel}>Session Date</Text>
        <Menu
          visible={dateMenuVisible}
          onDismiss={onDismissDateMenu}
          anchor={
            <Button
              mode="outlined"
              onPress={onOpenDateMenu}
              icon="calendar"
              style={styles.dateButton}
            >
              {formatDateForDisplay(sessionDate)}
            </Button>
          }
        >
          <InlineCalendar selectedDate={sessionDate} onSelectDate={onSelectDate} />
        </Menu>
      </Card.Content>
    </Card>
  );
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
  onOpenChildLevelMenu,
  getTrackerChangeCount,
  onOpenLetterTracker,
  onSubmit,
  submitting,
}) {
  return (
    <>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Letters Focused On</Text>
          <Text variant="bodySmall" style={styles.helperText}>Tap letters to select</Text>
          <LetterGrid
            selectedLetters={selectedLetters}
            onToggleLetter={onToggleLetter}
          />
          {validationErrors.letters && (
            <Text variant="bodySmall" style={styles.errorText}>{validationErrors.letters}</Text>
          )}
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Session Reading Level</Text>
          <Text variant="bodySmall" style={styles.helperText}>
            What level did you focus on today?
          </Text>
          <Button
            mode="outlined"
            onPress={onOpenReadingLevelMenu}
            style={styles.dropdownButton}
          >
            {sessionReadingLevel || 'Select a level'}
          </Button>
          {validationErrors.readingLevel && (
            <Text variant="bodySmall" style={styles.errorText}>{validationErrors.readingLevel}</Text>
          )}
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Comments (Optional)</Text>
          <TextInput
            multiline
            numberOfLines={4}
            placeholder="Add session notes..."
            value={comments}
            onChangeText={onCommentsChange}
            {...NO_TEXT_SUGGESTIONS}
            mode="outlined"
            style={styles.commentsInput}
          />
        </Card.Content>
      </Card>

      {selectedChildren.length > 0 && (
        <>
          <View style={styles.sectionDivider}>
            <View style={styles.dividerLine} />
            <Text variant="labelMedium" style={styles.dividerLabel}>
              Update Child Progress (Optional)
            </Text>
            <View style={styles.dividerLine} />
          </View>

          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionLabel}>Reading Levels</Text>
              <Text variant="bodySmall" style={styles.helperText}>
                Record each child's current level
              </Text>
              {selectedChildren.map((child) => (
                <View key={child.id} style={styles.childLevelRow}>
                  <Text variant="bodyMedium" style={styles.childLevelName}>
                    {child.first_name} {child.last_name}
                  </Text>
                  <Button
                    mode="outlined"
                    onPress={() => onOpenChildLevelMenu(child.id)}
                    style={styles.childLevelButton}
                  >
                    {childReadingLevels[child.id] || 'Not set'}
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionLabel}>Letter Tracker</Text>
              <Text variant="bodySmall" style={styles.helperText}>
                Update letters each child has mastered
              </Text>
              {selectedChildren.map((child) => {
                const changeCount = getTrackerChangeCount(child.id);
                return (
                  <View key={child.id} style={styles.childLevelRow}>
                    <Text variant="bodyMedium" style={styles.childLevelName}>
                      {child.first_name} {child.last_name}
                    </Text>
                    <Button
                      mode="outlined"
                      onPress={() => onOpenLetterTracker(child)}
                      style={styles.childLevelButton}
                      icon="alpha-a-box-outline"
                    >
                      {changeCount > 0 ? `+${changeCount} new` : 'Update'}
                    </Button>
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        </>
      )}

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

  const { user, profile } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();
  const { classes } = useClasses();
  const { jobTitles } = useLookupsContext();

  const [sessionId] = useState(() => uuidv4());
  const [sessionDate, setSessionDate] = useState(() => getProgrammeCalendarDate());
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
  const [initialSessionDate] = useState(sessionDate);
  const isDirty =
    selectedChildren.length > 0 ||
    selectedLetters.length > 0 ||
    sessionReadingLevel !== null ||
    Object.keys(childReadingLevels).length > 0 ||
    Object.values(letterTrackerChanges).some((changes) => Object.keys(changes || {}).length > 0) ||
    comments.trim().length > 0 ||
    sessionDate.getTime() !== initialSessionDate.getTime();

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
        session_date: formatDateForStorage(sessionDate),
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
    <View style={styles.outerContainer}>
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
        ListHeaderComponent={
          <FormHeader
            sessionDate={sessionDate}
            dateMenuVisible={dateMenuVisible}
            onDismissDateMenu={() => setDateMenuVisible(false)}
            onOpenDateMenu={() => setDateMenuVisible(true)}
            onSelectDate={(date) => {
              setSessionDate(date);
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
        title="Session Reading Level"
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
        title="Reading Level"
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
  outerContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  sectionLabel: {
    color: colors.primary,
    marginBottom: spacing.sm,
    fontFamily: fontFamilies.textSemi,
  },
  helperText: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.error,
    marginTop: spacing.sm,
  },
  dateButton: {
    alignSelf: 'flex-start',
  },
  dropdownButton: {
    alignSelf: 'flex-start',
  },
  childLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  childLevelName: {
    flex: 1,
    color: colors.text,
  },
  childLevelButton: {
    minWidth: 140,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.textSemi,
  },
  commentsInput: {
    backgroundColor: colors.surface,
  },
  submitButton: {
    marginBottom: spacing.lg,
  },
  submitButtonContent: {
    paddingVertical: spacing.sm,
  },
});

const calStyles = StyleSheet.create({
  calendar: {
    padding: spacing.sm,
    width: 280,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthTitle: {
    color: colors.text,
    fontFamily: fontFamilies.textSemi,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fontFamilies.textSemi,
  },
  dayRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayCellFuture: {
    opacity: 0.3,
  },
  dayText: {
    color: colors.text,
  },
  dayTextSelected: {
    color: colors.onDark,
    fontFamily: fontFamilies.textSemi,
  },
  dayTextFuture: {
    color: colors.disabled,
  },
});
