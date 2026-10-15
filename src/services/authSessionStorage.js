import AsyncStorage from '@react-native-async-storage/async-storage';

// AuthContext owns admission; SDK responses do not grant themselves permission
// to persist credentials. In particular, a completed request can outlive logout.
// Until AuthContext makes its first decision (app launch), the SDK may refresh the
// session already stored: a same-user write is never a takeover, and dropping it
// would lose the rotated refresh token and sign the EA out on the next launch.
const UNDECIDED = Symbol('undecided');
let admittedUser = UNDECIDED;

export const admitAuthSessionUser = (userId) => { admittedUser = userId; };
export const revokeAuthSessionAdmission = () => { admittedUser = null; };
export const resetAuthSessionAdmissionForTests = () => { admittedUser = UNDECIDED; };

const sessionUserId = (key, storageKey, raw) => {
  try {
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    return session?.user?.id ?? (key === `${storageKey}-user` ? session?.id : null);
  } catch { return null; }
};

const isAdmitted = async (key, storageKey, userId) => {
  if (!userId) return false;
  if (admittedUser === UNDECIDED) {
    const stored = await AsyncStorage.getItem(storageKey);
    return Boolean(stored) && sessionUserId(storageKey, storageKey, stored) === userId;
  }
  return Boolean(admittedUser) && (admittedUser === '*' || admittedUser === userId);
};

export const createAuthSessionStorage = (storageKey) => ({
  getItem: (key) => AsyncStorage.getItem(key),
  removeItem: (key) => AsyncStorage.removeItem(key),
  setItem: async (key, value) => {
    if (key === storageKey || key === `${storageKey}-user`) {
      if (!await isAdmitted(key, storageKey, sessionUserId(key, storageKey, value))) return;
    }
    await AsyncStorage.setItem(key, value);
  },
});
