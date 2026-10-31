import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSignedInEA } from '../context/SignedInEAContext';
import { getActiveProgrammeGate } from '../services/activeProgrammeGate';
import { programmeSubject } from '../utils/programmeSubject';

// The last known subject per signed-in EA, so a newly mounted screen starts resolved
// instead of rendering literacy pieces for a moment and then removing them.
const lastKnown = new WeakMap();

function initialState(handle) {
  return lastKnown.has(handle)
    ? { handle, subject: lastKnown.get(handle), loading: false }
    : { handle, subject: null, loading: true };
}

export function useActiveProgrammeSubject() {
  const { handle } = useSignedInEA();
  const { user } = useAuth();
  const [state, setState] = useState(() => initialState(handle));
  useFocusEffect(useCallback(() => {
    let active = true;
    const canPublish = () => active && handle.isCurrent();
    // Keep the last known subject while refreshing, so screens never blink on refocus.
    if (canPublish()) setState(prev => (prev.handle === handle ? prev : initialState(handle)));
    (async () => {
      try {
        const gate = await getActiveProgrammeGate({ handle, userId: user.id });
        if (!canPublish()) return;
        const subject = programmeSubject(gate.programme);
        lastKnown.set(handle, subject);
        setState({ handle, subject, loading: false });
      } catch {
        if (canPublish()) setState(prev => (prev.handle === handle && !prev.loading
          ? prev : { handle, subject: null, loading: false }));
      }
    })();
    return () => { active = false; };
  }, [handle, user.id]));
  const current = state.handle === handle ? state : initialState(handle);
  return { subject: current.subject, isMaths: current.subject === 'maths', loading: current.loading };
}
