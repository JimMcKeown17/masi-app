// src/components/home/WeekStrip.js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

const dayLabel = ({ day, count, isToday, isFuture }) => {
  const name = FULL_DAY[day] || day;
  if (isFuture) return `${name}, upcoming`;
  const sessions = `${count} ${count === 1 ? 'session' : 'sessions'}`;
  return isToday ? `${name}, today, ${sessions}` : `${name}, ${sessions}`;
};

export default function WeekStrip({ days }) {
  return (
    <View accessibilityLabel="This week" style={styles.row}>
      {days.map((d) => {
        const done = !d.isToday && !d.isFuture && d.count > 0;
        return (
          <View key={d.day} accessible accessibilityLabel={dayLabel(d)} style={styles.column}>
            <Text style={[styles.dayLabel, d.isToday ? styles.dayLabelToday : null]}>{d.day.toUpperCase()}</Text>
            <View style={[styles.tile, done ? styles.tileDone : null, d.isToday ? styles.tileToday : null]}>
              <Text
                maxFontSizeMultiplier={1.2}
                style={[styles.count, done ? styles.countDone : null, d.isToday ? styles.countToday : null]}
              >
                {d.isFuture ? '–' : String(d.count)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  dayLabel: { ...typeRoles.textLabel, color: colors.textSecondary },
  dayLabelToday: { color: colors.red600 },
  tile: { alignSelf: 'stretch', minHeight: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileDone: { backgroundColor: colors.successBg },
  tileToday: {
    backgroundColor: colors.red600,
    shadowColor: colors.red600, shadowOpacity: 0.26, shadowRadius: 7, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  count: { ...typeRoles.displayM, lineHeight: 24, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  countDone: { color: colors.successText },
  countToday: { color: colors.onDark },
});
