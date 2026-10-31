import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSignedInEA } from '../context/SignedInEAContext';
import { getActiveProgrammeGate } from '../services/activeProgrammeGate';
import { isKnownMaths, rememberProgrammeSubject } from '../utils/programmeSubject';

// Only maths is shared across screens: hiding literacy is always safe, so a newly mounted
// screen can start from it, while a shared "reading" could open a literacy route after Head
// Office moved the EA to numeracy. Every screen confirms reading with its own read.
function initialState(handle) {
  return isKnownMaths(handle)
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
        setState({ handle, subject: rememberProgrammeSubject(handle, gate.programme), loading: false });
      } catch {
        // A failed read prefers maths known by any screen, then what this screen knew; with
        // nothing known it settles as unknown (today's literacy behaviour).
        if (!canPublish()) return;
        setState(prev => (isKnownMaths(handle) || prev.handle !== handle || prev.loading
          ? { ...initialState(handle), loading: false } : prev));
      }
    })();
    return () => { active = false; };
  }, [handle, user.id]));
  const current = state.handle === handle ? state : initialState(handle);
  return { subject: current.subject, isMaths: current.subject === 'maths', loading: current.loading };
}
