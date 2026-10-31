import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSignedInEA } from '../context/SignedInEAContext';
import { getActiveProgrammeGate } from '../services/activeProgrammeGate';
import { programmeSubject } from '../utils/programmeSubject';

// Signed-in EAs last confirmed as maths. Only maths is cached: hiding literacy is always safe,
// so a newly mounted screen can start from it, while a cached "reading" could open a literacy
// route after Head Office moved the EA to numeracy. Every screen confirms reading itself.
const knownMaths = new WeakSet();

function initialState(handle) {
  return knownMaths.has(handle)
    ? { handle, subject: 'maths', loading: false }
    : { handle, subject: null, loading: true };
}

export function useActiveProgrammeSubject() {
  const { handle } = useSignedInEA();
  const { user } = useAuth();
  const [state, setState] = useState(() => initialState(handle));
  useFocusEffect(useCallback(() => {
    let active = true;
    const canPublish = () => active && handle.isCurrent();
    // Keep this screen's last subject while refreshing, so it never blinks on refocus.
    if (canPublish()) setState(prev => (prev.handle === handle ? prev : initialState(handle)));
    (async () => {
      try {
        const gate = await getActiveProgrammeGate({ handle, userId: user.id });
        if (!canPublish()) return;
        const subject = programmeSubject(gate.programme);
        if (subject === 'maths') knownMaths.add(handle); else knownMaths.delete(handle);
        setState({ handle, subject, loading: false });
      } catch {
        // A failed read keeps what this screen knew; with nothing known it settles as unknown
        // (today's literacy behaviour), and it never turns a known maths EA back to literacy.
        if (!canPublish()) return;
        setState(prev => (prev.handle === handle && !prev.loading
          ? prev : { ...initialState(handle), loading: false }));
      }
    })();
    return () => { active = false; };
  }, [handle, user.id]));
  const current = state.handle === handle ? state : initialState(handle);
  return { subject: current.subject, isMaths: current.subject === 'maths', loading: current.loading };
}
