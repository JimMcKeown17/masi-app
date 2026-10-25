import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { UiText } from './Text';

const styles = StyleSheet.create({
  content: { gap: tokens.space.lg, paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.lg },
  group: { gap: tokens.space.sm },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
});

/** Shared group chrome for both scrolling capture bodies and existing callers. */
export function TileGroup({ card = false, heading, testID, children }: {
  card?: boolean;
  heading?: string;
  testID?: string;
  children: React.ReactNode;
}) {
  if (!card && heading === undefined) {
    return <View testID={testID} style={styles.row}>{children}</View>;
  }
  return <View testID={testID} style={[styles.group, card && styles.card]}>
    {heading !== undefined && <UiText variant="label" tone="muted">{heading}</UiText>}
    <View style={styles.row}>{children}</View>
  </View>;
}

export function TileGroups<T>({ groups, card = false, renderTile, testID, header }: {
  groups: ReadonlyArray<{ key: string; testID?: string; heading?: string; items: ReadonlyArray<T> }>;
  card?: boolean;
  renderTile: (item: T) => React.ReactNode;
  testID?: string;
  header?: React.ReactNode;
}): React.JSX.Element {
  return (
    <ScrollView testID={testID} contentContainerStyle={styles.content}>
      {header}
      {groups.map(group => <TileGroup key={group.key} testID={group.testID} heading={group.heading} card={card}>
        {group.items.map((item, position) => <React.Fragment key={position}>{renderTile(item)}</React.Fragment>)}
      </TileGroup>)}
    </ScrollView>
  );
}
