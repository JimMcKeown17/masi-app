import React from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import { spacing } from '../../constants/colors';

export default function InProgressSheet({ visible, onResume, onDiscard, onDismiss, error }) {
  return <BottomSheet visible={visible} title="You have a lesson in progress" dismissLabel="Close"
    onDismiss={onDismiss} keyboardAvoiding={false}>
    <View style={styles.actions}>
      {error ? <InlineNote>{error}</InlineNote> : null}
      <BrandButton label="Go to that lesson" onPress={onResume} />
      <BrandButton label="Discard it and start this one" variant="destructiveQuiet" onPress={onDiscard} />
    </View>
  </BottomSheet>;
}
const styles = StyleSheet.create({ actions: { gap: spacing.ms, paddingBottom: spacing.md } });
