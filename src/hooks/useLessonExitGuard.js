import { useEffect, useState } from 'react';
import { CommonActions, usePreventRemove } from '@react-navigation/native';

export function useLessonExitGuard({ navigation, route, status, restartRoute, restartParams }) {
  const [leaveAction, setLeaveAction] = useState(null);
  const [pendingExit, setPendingExit] = useState(null);
  usePreventRemove(status === 'ready', ({ data }) => setLeaveAction(data.action));
  useEffect(() => {
    if (status !== 'ready') return;
    const state = navigation.getState();
    const index = state.routes.findIndex(item => item.key === route.key);
    if (state.routes[index - 1]?.name !== 'SessionForm') return;
    // A kept lesson leaves to where the EA started; the picker below would reopen it on focus.
    navigation.dispatch(current => {
      const lessonIndex = current.routes.findIndex(item => item.key === route.key);
      if (lessonIndex < 1 || current.routes[lessonIndex - 1].name !== 'SessionForm') return CommonActions.reset(current);
      const routes = current.routes.filter((_, i) => i !== lessonIndex - 1);
      return CommonActions.reset({ ...current, routes, index: current.index - 1 });
    });
  }, [status, navigation, route.key]);
  // Callers pass a fresh params object each render; the key keeps this effect to real changes.
  const restartKey = JSON.stringify(restartParams ?? null);
  // These actions run after the committed empty render has released usePreventRemove.
  useEffect(() => {
    if (status === 'missing') navigation.goBack();
    if (status !== 'empty' || !pendingExit) return;
    setPendingExit(null);
    if (pendingExit === 'back') navigation.goBack();
    else navigation.replace(restartRoute, JSON.parse(restartKey) ?? undefined);
  }, [status, pendingExit, navigation, restartRoute, restartKey]);

  return { leaveAction, setLeaveAction, requestExit: setPendingExit };
}
