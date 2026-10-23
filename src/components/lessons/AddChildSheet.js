import React, { useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import InlineNote from '../common/InlineNote';
import SelectableRow from '../forms/SelectableRow';
import { compareChildNames, formatChildName } from '../../utils/childNames';

const keyFor = child => child.id;
export default function AddChildSheet({ visible, onDismiss, children, classes = [], onAdd, error }) {
  const sorted = useMemo(() => [...children].sort(compareChildNames), [children]);
  const writing = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    return () => { generation.current += 1; };
  }, [visible]);
  const choose = async id => {
    if (writing.current) return;
    const token = generation.current;
    writing.current = true;
    try { await onAdd(id); if (generation.current === token) onDismiss(); } catch (_) { /* The draft error is shown inline. */ }
    finally { writing.current = false; }
  };
  return <BottomSheet visible={visible} title="+ Add a child" dismissLabel="Close" onDismiss={onDismiss}
    keyboardAvoiding={false} scrollable={false} bodyContentStyle={styles.body}>
    {error ? <InlineNote>{error}</InlineNote> : null}
    <FlatList style={styles.list} data={sorted} keyExtractor={keyFor} renderItem={({ item, index }) => (
      <SelectableRow variant="radio" title={formatChildName(item)} subtitle={classes.find(row => row.id === item.class_id)?.name}
        selected={false} onPress={() => { void choose(item.id); }}
        position={children.length === 1 ? 'only' : index === 0 ? 'first' : index === children.length - 1 ? 'last' : undefined} />
    )} />
  </BottomSheet>;
}
const styles = StyleSheet.create({ body: { flexShrink: 1, minHeight: 0 }, list: { flexShrink: 1 } });
