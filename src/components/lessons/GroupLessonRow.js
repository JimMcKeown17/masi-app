import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import ListRow from '../common/ListRow';
import { listGroupItemFrame } from '../common/ListGroup';
import { lastSeenLabel, lessonRowDetail } from '../../utils/lessonDates';

export default React.memo(function GroupLessonRow({ row, today, onStart, showDivider, index, count }) {
  const start = useCallback(() => onStart(row.groupId), [onStart, row.groupId]);
  return <ListRow title={row.members.map(child => child.firstName).join(' & ')}
    subtitle={lessonRowDetail(lastSeenLabel(row.lastSeenOn, today), row.nextLetters ?? [])}
    lead={<View accessible={false} style={[styles.dot, { backgroundColor: row.dotColor }]} />}
    trailing="chevron" onPress={start} showDivider={showDivider} style={listGroupItemFrame(index, count)} />;
});
const styles = StyleSheet.create({ dot: { width: 12, height: 12, borderRadius: 6, alignSelf: 'center' } });
