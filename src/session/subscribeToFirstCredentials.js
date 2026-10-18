import { getLatestAuthSession } from './signedInHandle';

export const subscribeToFirstCredentials = ({ handle, subscribeToAuthEvents, onCredentials }) => {
  let active = true;
  const initialSession = getLatestAuthSession();
  let hasCredentials = initialSession?.user?.id === handle.userId && Boolean(initialSession?.access_token);
  const unsubscribe = subscribeToAuthEvents((event, session) => {
    if (hasCredentials || session?.user?.id !== handle.userId || !session?.access_token) return;
    // AuthContext installs credentials after notifying listeners. Defer the
    // one-time wake until that callback has finished.
    void Promise.resolve().then(() => {
      if (!active || !handle.isCurrent() || hasCredentials) return;
      hasCredentials = true;
      return onCredentials();
    });
  });
  return () => { active = false; unsubscribe(); };
};
