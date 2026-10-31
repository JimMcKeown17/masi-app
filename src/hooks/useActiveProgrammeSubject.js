import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSignedInEA } from '../context/SignedInEAContext';
import { getActiveProgrammeGate } from '../services/activeProgrammeGate';
import { programmeSubject } from '../utils/programmeSubject';

export function useActiveProgrammeSubject() {
  const { handle } = useSignedInEA();
  const { user } = useAuth();
  const [state, setState] = useState({ handle: null, subject: null, loading: true });
  useFocusEffect(useCallback(() => {
    let active = true;
    const canPublish = () => active && handle.isCurrent();
    // Keep the last known subject while refreshing, so screens never blink on refocus.
    if (canPublish()) setState(prev => (prev.handle === handle ? prev : { handle, subject: null, loading: true }));
    (async () => {
      try {
        const gate = await getActiveProgrammeGate({ handle, userId: user.id });
        if (canPublish()) setState({ handle, subject: programmeSubject(gate.programme), loading: false });
      } catch {
        if (canPublish()) setState({ handle, subject: null, loading: false });
      }
    })();
    return () => { active = false; };
  }, [handle, user.id]));
  const subject = state.handle === handle ? state.subject : null;
  return { subject, isMaths: subject === 'maths', loading: state.handle !== handle || state.loading };
}
