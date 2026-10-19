import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { fontFamilies, typeRoles } from '../../constants/typography';
import { dateKeyFromParts, formatSessionDate, MONTH_NAMES, parseDateKey, WEEKDAY_SHORT } from '../../utils/sessionDateFormat';
import IconCircleButton from './IconCircleButton';

export default function MonthCalendar({ selectedKey, todayKey, onSelect }) {
  const [{ year, monthIndex }, setViewMonth] = useState(() => parseDateKey(selectedKey));
  const today = parseDateKey(todayKey);
  // Calendar arithmetic is UTC-only: device-local midnight must never shift a key.
  const first = new Date(0);
  first.setUTCFullYear(year, monthIndex, 1);
  const last = new Date(first);
  last.setUTCMonth(monthIndex + 1, 0);
  const firstWeekday = first.getUTCDay();
  const dayCount = last.getUTCDate();
  const canGoNext = year < today.year || (year === today.year && monthIndex < today.monthIndex);
  const changeMonth = (delta) => {
    const date = new Date(first);
    date.setUTCMonth(monthIndex + delta);
    setViewMonth({ year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() });
  };
  const weekCount = Math.ceil((firstWeekday + dayCount) / 7);

  return <View>
    <View style={styles.monthRow}>
      <IconCircleButton icon="chevron-back" accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} />
      <Text accessibilityRole="header" style={styles.monthTitle}>{MONTH_NAMES[monthIndex]} {year}</Text>
      <IconCircleButton icon="chevron-forward" accessibilityLabel="Next month" disabled={!canGoNext} onPress={() => changeMonth(1)} />
    </View>
    <View style={styles.weekdays}>
      {WEEKDAY_SHORT.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
    </View>
    <View style={styles.weeks}>
      {Array.from({ length: weekCount }, (_, week) => <View key={week} testID={`calendar-week-${week}`} style={styles.week}>
        {Array.from({ length: 7 }, (_, column) => {
          const day = week * 7 + column - firstWeekday + 1;
          if (day < 1 || day > dayCount) return <View key={column} style={styles.cell} />;
          const key = dateKeyFromParts(year, monthIndex, day);
          const selected = key === selectedKey;
          const future = key > todayKey;
          const isToday = key === todayKey;
          return <View key={column} style={styles.cell}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={`${formatSessionDate(key, 'calendarLabel')}${future ? ', unavailable' : ''}`}
              accessibilityState={{ selected, disabled: future }} disabled={future}
              onPress={() => onSelect(key)}
              style={[styles.day, selected && styles.selected, isToday && !selected && styles.today]}>
              <Text maxFontSizeMultiplier={1.2} style={[styles.dayText,
                (selected || isToday) && styles.emphasizedText,
                selected && styles.selectedText, future && styles.futureText]}>{day}</Text>
            </Pressable>
          </View>;
        })}
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthTitle: { ...typeRoles.displayHeading, color: colors.text, flex: 1, textAlign: 'center' },
  weekdays: { flexDirection: 'row', marginBottom: 8 },
  weekday: { ...typeRoles.textLabel, color: colors.textSecondary, flex: 1, textAlign: 'center' },
  weeks: { gap: 4 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.text },
  today: { borderWidth: 1.5, borderColor: colors.text },
  dayText: { ...typeRoles.textDay, color: colors.text },
  emphasizedText: { fontFamily: fontFamilies.textHeavy },
  selectedText: { color: colors.onDark },
  futureText: { color: colors.disabled, fontFamily: fontFamilies.textMedium },
});
