import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import SelectableRow from '../forms/SelectableRow';
import { spacing } from '../../constants/colors';
import { isStaleActorError } from '../../session/staleActor';
import { compareChildNames, formatChildName } from '../../utils/childNames';

const childKey = child => child.id;
export default function MakeGroupSheet({ visible, onDismiss, ungrouped, classes = [], makeGroup, handle }) {
  const sorted = useMemo(() => [...ungrouped].sort(compareChildNames), [ungrouped]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    if (visible) { setSelected([]); setError(null); }
    return () => { generation.current += 1; };
  }, [visible]);
  const done = async () => {
    if (writing.current || selected.length === 0) return;
    const token = generation.current;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await makeGroup(selected);
      if (!handle.isCurrent() || generation.current !== token) return;
      if (result.success) onDismiss();
      else setError(result.error?.message ?? String(result.error));
    } catch (caught) {
      if (!isStaleActorError(caught) && handle.isCurrent() && generation.current === token) setError(caught.message);
    } finally { writing.current = false; setBusy(false); }
  };
  return <BottomSheet visible={visible} onDismiss={onDismiss} title="Make a group" dismissLabel="Close"
    scrollable={false} keyboardAvoiding={false} bodyContentStyle={styles.body}
    footer={<BrandButton label="Done" onPress={done} disabled={selected.length === 0} loading={busy} />}>
    {error ? <View style={styles.note}><InlineNote>{error}</InlineNote></View> : null}
    <FlatList style={styles.list} data={sorted} keyExtractor={childKey} extraData={selected}
      renderItem={({ item, index }) => <SelectableRow variant="checkbox" title={formatChildName(item)}
        subtitle={classes.find(row => row.id === item.class_id)?.name} selected={selected.includes(item.id)}
        position={ungrouped.length === 1 ? 'only' : index === 0 ? 'first' : index === ungrouped.length - 1 ? 'last' : undefined}
        onPress={() => {
          if (!writing.current) setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]);
        }} />} />
  </BottomSheet>;
}
const styles = StyleSheet.create({
  note: { marginBottom: spacing.md },
  body: { flexShrink: 1, minHeight: 0 },
  list: { flexShrink: 1 },
});
