import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Menu,
  Divider,
  IconButton,
} from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage } from '../../utils/storage';
import { LETTER_ORDER, READING_LEVELS } from '../../constants/literacyConstants';
import LetterGrid from '../../components/session/LetterGrid';
import ChildSelector from '../../components/children/ChildSelector';
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

  const [sessionDate, setSessionDate] = useState(new Date());
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [selectedLetters, setSelectedLetters] = useState([]);
  const [sessionReadingLevel, setSessionReadingLevel] = useState(null);
  const [readingLevelMenuVisible, setReadingLevelMenuVisible] = useState(false);
  const [childReadingLevels, setChildReadingLevels] = useState({});
  // Track which child's reading-level menu is open (by child id or null)
  const [openChildLevelMenu, setOpenChildLevelMenu] = useState(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Derive the group ids that were implicitly used (not tracked in this simple flow,
  // so we leave group_ids as an empty array — future enhancement).
  const selectedChildIds = useMemo(() => selectedChildren.map((c) => c.id), [selectedChildren]);

  const handleToggleLetter = (letter) => {
    setSelectedLetters((prev) =>
      prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter]
    );
  };

  const handleSetChildReadingLevel = (childId, level) => {
    setChildReadingLevels((prev) => ({ ...prev, [childId]: level }));
    setOpenChildLevelMenu(null);
  };

  const isFormValid =
    selectedChildren.length > 0 &&
    selectedLetters.length > 0 &&
    sessionReadingLevel !== null;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSubmitting(true);

    try {
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
      await refreshSyncStatus();

      Alert.alert('Session Saved', 'Your session has been recorded and will sync automatically.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error saving session:', error);
      Alert.alert('Error', 'Failed to save session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
            onSelectionChange={setSelectedChildren}
          />
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
        </Card.Content>
      </Card>

      {/* ── Session Reading Level ── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Session Reading Level</Text>
          <Text variant="bodySmall" style={styles.helperText}>
            What level did you focus on today?
          </Text>
          <Menu
            visible={readingLevelMenuVisible}
            onDismiss={() => setReadingLevelMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setReadingLevelMenuVisible(true)}
                style={styles.dropdownButton}
              >
                {sessionReadingLevel || 'Select a level'}
              </Button>
            }
          >
            {READING_LEVELS.map((level) => (
              <Menu.Item
                key={level}
                title={level}
                onPress={() => {
                  setSessionReadingLevel(level);
                  setReadingLevelMenuVisible(false);
                }}
              />
            ))}
          </Menu>
        </Card.Content>
      </Card>

      {/* ── Child Reading Levels ── */}
      {selectedChildren.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionLabel}>Child Reading Levels (Optional)</Text>
            <Text variant="bodySmall" style={styles.helperText}>
              Record each child's current level
            </Text>
            {selectedChildren.map((child) => (
              <View key={child.id} style={styles.childLevelRow}>
                <Text variant="bodyMedium" style={styles.childLevelName}>
                  {child.first_name} {child.last_name}
                </Text>
                <Menu
                  visible={openChildLevelMenu === child.id}
                  onDismiss={() => setOpenChildLevelMenu(null)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setOpenChildLevelMenu(child.id)}
                      style={styles.childLevelButton}
                    >
                      {childReadingLevels[child.id] || 'Not set'}
                    </Button>
                  }
                >
                  {READING_LEVELS.map((level) => (
                    <Menu.Item
                      key={level}
                      title={level}
                      onPress={() => handleSetChildReadingLevel(child.id, level)}
                    />
                  ))}
                </Menu>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

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

      {/* ── Submit ── */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={!isFormValid || submitting}
        loading={submitting}
        style={styles.submitButton}
        contentStyle={styles.submitButtonContent}
      >
        Submit Session
      </Button>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
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
