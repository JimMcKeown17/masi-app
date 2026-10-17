import { useCallback, useEffect, useRef, useState } from 'react';
import { isStaleActorError } from '../session/staleActor';

export const UNSENT_CHECK_FAILED = "Couldn't check for work that hasn't uploaded.";

// Spec §7.1: clock-out question first (clocking out creates unsent work), then unsent work,
// then the §4.3 close. Dependencies are injected so the order is testable without the app tree.
// Ruling 9: each attempt has a generation. Cancel, dismissal and unmount end it, and every
// continuation after an await checks it, so a cancelled attempt can never sign the EA out.
export function useSignOutFlow({ signOut, countUnsent, isClockedIn, clockOut, isOnline, syncNow }) {
  const [step, setStep] = useState(null);
  const [unsentCount, setUnsentCount] = useState(0);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const attempt = useRef(0);
  const busyRef = useRef(null);
  useEffect(() => () => { attempt.current += 1; }, []);
  const setBusyState = (value) => { busyRef.current = value; setBusy(value); };
  const isLive = (mine) => attempt.current === mine;

  const finish = useCallback(async (mine) => {
    if (!isLive(mine)) return;
    attempt.current += 1; // the attempt ends here: no later continuation may act on it
    setBusyState('signing_out');
    setStep(null);
    try { await signOut(); } finally { setBusyState(null); } // on success the signed-in tree unmounts
  }, [signOut]);

  const goToUnsent = useCallback(async (mine) => {
    setBusyState('checking');
    let total;
    try {
      ({ total } = await countUnsent());
    } catch (error) {
      if (!isLive(mine)) return;
      setBusyState(null);
      if (isStaleActorError(error)) return; // a sign-out is already under way
      // Never treat a failed count as zero: ask, and keep an explicit way out.
      setUnsentCount(null);
      setMessage(UNSENT_CHECK_FAILED);
      setStep('unsent');
      return;
    }
    if (!isLive(mine)) return;
    setBusyState(null);
    if (total === 0) { await finish(mine); return; }
    setUnsentCount(total);
    setMessage(null);
    setStep('unsent');
  }, [countUnsent, finish]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    attempt.current += 1;
    const mine = attempt.current;
    setMessage(null);
    if (isClockedIn) { setStep('clocked_in'); return; }
    await goToUnsent(mine);
  }, [isClockedIn, goToUnsent]);

  const clockOutNow = useCallback(async () => {
    if (busyRef.current) return;
    const mine = attempt.current;
    setBusyState('clocking_out');
    let closed = false;
    try { closed = await clockOut(); } finally { if (isLive(mine)) setBusyState(null); }
    if (!isLive(mine)) return;
    if (!closed) { setMessage("Couldn't clock out. Try again, or choose another option."); return; }
    await goToUnsent(mine);
  }, [clockOut, goToUnsent]);

  const stayClockedIn = useCallback(() => {
    if (busyRef.current) return;
    return goToUnsent(attempt.current);
  }, [goToUnsent]);
  const recheck = useCallback(() => {
    if (busyRef.current) return;
    return goToUnsent(attempt.current);
  }, [goToUnsent]);

  const tryUploadNow = useCallback(async () => {
    if (busyRef.current || !isOnline) return;
    const mine = attempt.current;
    setBusyState('uploading');
    try { await syncNow({ force: true }); } finally { if (isLive(mine)) setBusyState(null); }
    if (!isLive(mine)) return;
    await goToUnsent(mine);
  }, [isOnline, syncNow, goToUnsent]);

  const signOutAnyway = useCallback(() => finish(attempt.current), [finish]);

  // Reached by Cancel, backdrop and Android Back (BottomSheet onDismiss). An upload or
  // clock-out already running finishes; the flow just stops acting on its result.
  const cancel = useCallback(() => {
    attempt.current += 1;
    setStep(null);
    setMessage(null);
    setBusyState(null);
  }, []);

  return {
    step, unsentCount, busy, message,
    start, clockOutNow, stayClockedIn, tryUploadNow, recheck, signOutAnyway, cancel,
  };
}
