import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import ListRow from '../common/ListRow';
import InlineNote from '../common/InlineNote';
import { spacing } from '../../constants/colors';
import { isStaleActorError } from '../../session/staleActor';

const groupKey = group => group.id;
export default function PutInGroupSheet({ visible, onDismiss, childId, groups, addChildToGroup, makeGroup, handle }) {
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const writing = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    if (visible) setError(null);
    return () => { generation.current += 1; };
  }, [visible, childId]);
  const choose = async groupId => {
    if (writing.current) return;
    const token = generation.current;
    writing.current = true;
    setBusyId(groupId ?? 'new');
    setError(null);
    try {
      const result = groupId ? await addChildToGroup(childId, groupId) : await makeGroup([childId]);
      if (!handle.isCurrent() || generation.current !== token) return;
      if (result.success) onDismiss();
      else setError(result.error?.message ?? String(result.error));
    } catch (caught) {
      if (!isStaleActorError(caught) && handle.isCurrent() && generation.current === token) setError(caught.message);
    } finally { writing.current = false; setBusyId(null); }
  };
  return <BottomSheet visible={visible} onDismiss={onDismiss} title="Put in a group" dismissLabel="Close"
    scrollable={false} keyboardAvoiding={false} bodyContentStyle={styles.body}>
    {error ? <View style={styles.note}><InlineNote>{error}</InlineNote></View> : null}
    <FlatList style={styles.list} data={groups} keyExtractor={groupKey} extraData={busyId}
      renderItem={({ item }) => <ListRow title={item.name} onPress={() => choose(item.id)}
        disabled={busyId !== null} busy={busyId === item.id} showDivider />}
      ListFooterComponent={<ListRow title="New group" onPress={() => choose(null)}
        disabled={busyId !== null} busy={busyId === 'new'} />} />
  </BottomSheet>;
}
const styles = StyleSheet.create({
  note: { marginBottom: spacing.md },
  body: { flexShrink: 1, minHeight: 0 },
  list: { flexShrink: 1 },
});
