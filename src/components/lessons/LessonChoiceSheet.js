import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import InlineNote from '../common/InlineNote';
import SelectableRow from '../forms/SelectableRow';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';

const keyFor = option => option.key;
export default function LessonChoiceSheet({ needs, classes, onChooseClass, onChooseLanguage, onDismiss, error }) {
  const options = needs === 'class' ? classes.map(row => ({ key: row.id, title: row.name }))
    : ['en', 'xh', 'af'].map(key => ({ key, title: LANGUAGE_LABELS[key] }));
  return <BottomSheet visible={needs !== null} onDismiss={onDismiss} dismissLabel="Close"
    title={needs === 'class' ? 'Which class is this lesson for?' : 'Which language is this lesson in?'}
    keyboardAvoiding={false} scrollable={false} bodyContentStyle={styles.body}>
    {error ? <InlineNote>{error}</InlineNote> : null}
    <FlatList style={styles.list} data={options} keyExtractor={keyFor} renderItem={({ item, index }) => (
      <SelectableRow variant="radio" title={item.title} accessibilityLabel={item.title} selected={false}
        onPress={() => needs === 'class' ? onChooseClass(item.key) : onChooseLanguage(item.key)}
        position={options.length === 1 ? 'only' : index === 0 ? 'first' : index === options.length - 1 ? 'last' : undefined} />
    )} />
  </BottomSheet>;
}
const styles = StyleSheet.create({ body: { flexShrink: 1, minHeight: 0 }, list: { flexShrink: 1 } });
