import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useChildren } from '../context/ChildrenContext';
import { useClasses } from '../context/ClassesContext';
import { useSignedInEA } from '../context/SignedInEAContext';
import { isStaleActorError } from '../session/staleActor';

const EMPTY_ROWS = [];
const byFirstName = (a, b) => (a.first_name || '').localeCompare(b.first_name || '')
  || (a.last_name || '').localeCompare(b.last_name || '')
  || a.id.localeCompare(b.id);

export function useAssessableChildren() {
  const { handle, repositories } = useSignedInEA();
  const childrenRepository = repositories.children;
  const { children, rosterVersion } = useChildren();
  const { classes, assignmentsVersion } = useClasses();
  const [roster, setRoster] = useState({ handle: null, rows: EMPTY_ROWS, loading: true });

  useFocusEffect(useCallback(() => {
    let active = true;
    const canPublish = () => active && handle.isCurrent();
    // Loading covers only the first settled read for this handle, not background refreshes.
    setRoster(previous => previous.handle === handle ? previous : ({
      handle,
      rows: EMPTY_ROWS,
      loading: true,
    }));
    (async () => {
      try {
        const rows = await childrenRepository.getAssessableChildren(handle.userId);
        if (canPublish()) setRoster({ handle, rows, loading: false });
      } catch (error) {
        if (!canPublish()) return;
        if (!isStaleActorError(error)) console.error('Error loading assessable children:', error);
        setRoster(previous => ({
          handle,
          rows: previous.handle === handle ? previous.rows : EMPTY_ROWS,
          loading: false,
        }));
      }
    })();
    return () => { active = false; };
  }, [handle, childrenRepository, children, classes, rosterVersion, assignmentsVersion]));

  // An EA change must hide the previous EA's rows even before the focus effect runs.
  const rows = roster.handle === handle ? roster.rows : EMPTY_ROWS;
  const lists = useMemo(() => {
    const yourChildren = rows.filter(child => child.is_delivery).sort(byFirstName);
    const restOfClass = rows.filter(child => !child.is_delivery).sort(byFirstName);
    return { yourChildren, restOfClass, all: [...yourChildren, ...restOfClass] };
  }, [rows]);
  return { ...lists, loading: roster.handle !== handle || roster.loading };
}

export default useAssessableChildren;
