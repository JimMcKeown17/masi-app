import AsyncStorage from '@react-native-async-storage/async-storage';

// AuthContext owns admission; SDK responses do not grant themselves permission
// to persist credentials. In particular, a completed request can outlive logout.
// Until AuthContext makes its first decision (app launch), the SDK may refresh the
// session already stored: a same-user write is never a takeover, and dropping it
// would lose the rotated refresh token and sign the EA out on the next launch.
const UNDECIDED = Symbol('undecided');
let admittedUser = UNDECIDED;

export const normalizeAuthEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const identityFor = (user) => user?.id ? { id: user.id }
  : normalizeAuthEmail(user?.email) ? { email: normalizeAuthEmail(user.email) } : null;
export const admitAuthSessionUser = (user) => {
  const previous = admittedUser === UNDECIDED ? null : admittedUser;
  admittedUser = identityFor(user);
  return previous;
};
export const revokeAuthSessionAdmission = () => { admittedUser = null; };
export const resetAuthSessionAdmissionForTests = () => { admittedUser = UNDECIDED; };

const sessionUser = (key, storageKey, raw) => {
  try {
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    return session?.user ?? (key === `${storageKey}-user` ? session : null);
  } catch { return null; }
};

const matchesAdmission = (admission, user) => Boolean(admission && user && (
  admission.id ? admission.id === user.id
    : admission.email && admission.email === normalizeAuthEmail(user.email)
));

export const createAuthSessionStorage = (storageKey) => {
  const userKey = `${storageKey}-user`;
  const isSessionKey = (key) => key === storageKey || key === userKey;
  let resolvingLaunch;
  const resolveLaunchAdmission = async () => {
    if (admittedUser !== UNDECIDED) return;
    if (!resolvingLaunch) {
      resolvingLaunch = (async () => {
        // Capture both records before the SDK can remove the split user during
        // migration. The resulting identity also fences its startup refresh.
        const [main, companion] = await Promise.all([
          AsyncStorage.getItem(storageKey), AsyncStorage.getItem(userKey),
        ]);
        const identity = identityFor(sessionUser(storageKey, storageKey, main))
          ?? identityFor(sessionUser(userKey, storageKey, companion));
        // An explicit sign-in or revocation during these reads owns admission.
        if (admittedUser === UNDECIDED) admittedUser = identity;
      })().finally(() => { resolvingLaunch = null; });
    }
    await resolvingLaunch;
  };
  return {
    getItem: async (key) => {
      if (isSessionKey(key)) await resolveLaunchAdmission();
      return AsyncStorage.getItem(key);
    },
    removeItem: async (key) => {
      if (isSessionKey(key)) await resolveLaunchAdmission();
      return AsyncStorage.removeItem(key);
    },
    setItem: async (key, value) => {
      if (isSessionKey(key)) {
        await resolveLaunchAdmission();
        if (!matchesAdmission(admittedUser, sessionUser(key, storageKey, value))) return;
      }
      // No await between the admission check and starting the storage write.
      await AsyncStorage.setItem(key, value);
    },
  };
};
