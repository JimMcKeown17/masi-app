import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../constants/colors';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import BlendTile from './BlendTile';

export default function BlendPoolSheet({ visible, onDismiss, title, pool, selected, onToggle, error }) {
  const items = [...pool].sort((a, b) => Number(selected.includes(b.text)) - Number(selected.includes(a.text)));
  return <BottomSheet visible={visible} title={title} onDismiss={onDismiss} dismissLabel="Close"
    keyboardAvoiding={false} footer={<BrandButton label="Done" onPress={onDismiss} />}>
    {error ? <InlineNote>{error}</InlineNote> : null}
    <View testID="blend-pool" style={styles.tiles}>
      {items.map(item => <BlendTile key={item.text} text={item.text} display={item.display}
        tone={selected.includes(item.text) ? 'selected' : 'rest'} onPress={() => onToggle(item.text)} />)}
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.md },
});
