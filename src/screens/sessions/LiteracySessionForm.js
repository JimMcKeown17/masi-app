import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Menu,
  Portal,
  Dialog,
  RadioButton,
  Divider,
  IconButton,
  Snackbar,
} from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage } from '../../utils/storage';
import { LETTER_ORDER, READING_LEVELS } from '../../constants/literacyConstants';
import LetterGrid from '../../components/session/LetterGrid';
import ChildSelector from '../../components/children/ChildSelector';
import LetterTrackerBottomSheet from '../../components/session/LetterTrackerBottomSheet';
import { normalizeLanguageKey } from '../../utils/letterMastery';
import { useClasses } from '../../context/ClassesContext';
import { v4 as uuidv4 } from 'uuid';

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

// ---------------------------------------------------------------------------
// InlineCalendar — renders month grid, disables future dates
// ---------------------------------------------------------------------------
function InlineCalendar({ selectedDate, onSelectDate }) {
  const today = new Date();
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

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------
export default function LiteracySessionForm({ navigation }) {
  const { user } = useAuth();
  const { refreshSyncStatus } = useOffline();
  const { classes } = useClasses();

  const [sessionDate, setSessionDate] = useState(new Date());
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
  const [validationErrors, setValidationErrors] = useState({});
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Derive the group ids that were implicitly used (not tracked in this simple flow,
  // so we leave group_ids as an empty array — future enhancement).
  const selectedChildIds = useMemo(() => selectedChildren.map((c) => c.id), [selectedChildren]);

  const handleChildrenChange = (newSelection) => {
    setSelectedChildren(newSelection);
    if (newSelection.length > 0) {
      setValidationErrors((prev) => { const { children, ...rest } = prev; return rest; });
    }
  };

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
    const errors = {};
    if (selectedChildren.length === 0) errors.children = 'Select at least one child';
    if (selectedLetters.length === 0) errors.letters = 'Select at least one letter';
    if (!sessionReadingLevel) errors.readingLevel = 'Select a reading level';
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    setSubmitting(true);

    try {
      // 1. Save session record
      const session = {
        id: uuidv4(),
        user_id: user.id,
        session_type: 'Literacy Coach',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await storage.saveSession(session);

      // 2. Save letter tracker changes (batch)
      const { LETTER_SETS } = require('../../constants/egraConstants');
      const letterSet = LETTER_SETS[trackerLanguageKey];
      const now = new Date().toISOString();

      for (const [childId, changes] of Object.entries(letterTrackerChanges)) {
        for (const [letter, value] of Object.entries(changes)) {
          if (value === true) {
            // Add new taught letter
            const record = {
              id: uuidv4(),
              user_id: user.id,
              child_id: childId,
              letter,
              source: 'taught',
              language: letterSet.language,
              synced: false,
              created_at: now,
              updated_at: now,
            };
            await storage.saveLetterMasteryRecord(record);
          } else if (value === false) {
            // Soft-delete: find the existing record and mark it
            const allMastery = await storage.getLetterMastery();
            const existing = allMastery.find(
              r => r.child_id === childId &&
                   r.letter === letter &&
                   r.language === letterSet.language &&
                   !r._deleted
            );
            if (existing) {
              await storage.updateLetterMasteryRecord(existing.id, {
                _deleted: true,
                synced: false,
                updated_at: now,
              });
            }
          }
        }
      }

      await refreshSyncStatus();
      navigation.goBack();
    } catch (error) {
      console.error('Error saving session:', error);
      showSnackbar('Failed to save session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* ── Session Date ── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Session Date</Text>
          <Menu
            visible={dateMenuVisible}
            onDismiss={() => setDateMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setDateMenuVisible(true)}
                icon="calendar"
                style={styles.dateButton}
              >
                {formatDateForDisplay(sessionDate)}
              </Button>
            }
          >
            <InlineCalendar
              selectedDate={sessionDate}
              onSelectDate={(date) => {
                setSessionDate(date);
                setDateMenuVisible(false);
              }}
            />
          </Menu>
        </Card.Content>
      </Card>

      {/* ── Select Children ── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Select Children</Text>
          <ChildSelector
            selectedChildren={selectedChildren}
            onSelectionChange={handleChildrenChange}
          />
          {validationErrors.children && (
            <Text variant="bodySmall" style={styles.errorText}>{validationErrors.children}</Text>
          )}
        </Card.Content>
      </Card>

      {/* ── Letters Focused On ── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Letters Focused On</Text>
          <Text variant="bodySmall" style={styles.helperText}>Tap letters to select</Text>
          <LetterGrid
            selectedLetters={selectedLetters}
            onToggleLetter={handleToggleLetter}
          />
          {validationErrors.letters && (
            <Text variant="bodySmall" style={styles.errorText}>{validationErrors.letters}</Text>
          )}
        </Card.Content>
      </Card>

      {/* ── Session Reading Level ── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Session Reading Level</Text>
          <Text variant="bodySmall" style={styles.helperText}>
            What level did you focus on today?
          </Text>
          <Button
            mode="outlined"
            onPress={() => setReadingLevelMenuVisible(true)}
            style={styles.dropdownButton}
          >
            {sessionReadingLevel || 'Select a level'}
          </Button>
          {validationErrors.readingLevel && (
            <Text variant="bodySmall" style={styles.errorText}>{validationErrors.readingLevel}</Text>
          )}
        </Card.Content>
      </Card>

      {/* ── Comments ── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Comments (Optional)</Text>
          <TextInput
            multiline
            numberOfLines={4}
            placeholder="Add session notes..."
            value={comments}
            onChangeText={setComments}
            mode="outlined"
            style={styles.commentsInput}
          />
        </Card.Content>
      </Card>

      {/* ── Per-Child Progress Updates ── */}
      {selectedChildren.length > 0 && (
        <>
          <View style={styles.sectionDivider}>
            <View style={styles.dividerLine} />
            <Text variant="labelMedium" style={styles.dividerLabel}>
              Update Child Progress (Optional)
            </Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Child Reading Levels ── */}
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
                    onPress={() => setOpenChildLevelMenu(child.id)}
                    style={styles.childLevelButton}
                  >
                    {childReadingLevels[child.id] || 'Not set'}
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>

          {/* ── Letter Tracker Updates ── */}
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
                      onPress={() => setTrackerBottomSheetChild(child)}
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

      {/* ── Submit ── */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={submitting}
        loading={submitting}
        style={styles.submitButton}
        contentStyle={styles.submitButtonContent}
      >
        Submit Session
      </Button>
      </ScrollView>

      {/* ── Letter Tracker Bottom Sheet ── */}
      <LetterTrackerBottomSheet
        visible={trackerBottomSheetChild !== null}
        onDismiss={() => setTrackerBottomSheetChild(null)}
        child={trackerBottomSheetChild}
        languageKey={trackerLanguageKey}
        pendingChanges={trackerBottomSheetChild ? (letterTrackerChanges[trackerBottomSheetChild.id] || {}) : {}}
        onChangesUpdate={(changes) => {
          if (trackerBottomSheetChild) {
            handleTrackerChangesUpdate(trackerBottomSheetChild.id, changes);
          }
        }}
      />

      {/* ── Session Reading Level Dialog ── */}
      <Portal>
        <Dialog visible={readingLevelMenuVisible} onDismiss={() => setReadingLevelMenuVisible(false)}>
          <Dialog.Title>Session Reading Level</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) => {
                setSessionReadingLevel(value);
                setReadingLevelMenuVisible(false);
                setValidationErrors((prev) => { const { readingLevel, ...rest } = prev; return rest; });
              }}
              value={sessionReadingLevel || ''}
            >
              {READING_LEVELS.map((level) => (
                <RadioButton.Item key={level} label={level} value={level} />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>
      </Portal>

      {/* ── Child Reading Level Dialog ── */}
      <Portal>
        <Dialog visible={openChildLevelMenu !== null} onDismiss={() => setOpenChildLevelMenu(null)}>
          <Dialog.Title>Reading Level</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) => handleSetChildReadingLevel(openChildLevelMenu, value)}
              value={openChildLevelMenu ? (childReadingLevels[openChildLevelMenu] || '') : ''}
            >
              {READING_LEVELS.map((level) => (
                <RadioButton.Item key={level} label={level} value={level} />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpenChildLevelMenu(null)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    color: colors.textSecondary,
    fontWeight: '600',
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
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dayTextFuture: {
    color: colors.disabled,
  },
});
