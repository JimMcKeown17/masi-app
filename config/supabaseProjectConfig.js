const KNOWN_SUPABASE_PROJECTS = {
  primary: 'jcqrlwetutnpuchjoyyd',
  'sqlite-staging': 'segygjzpujphwvrubusm',
};

// The forward backend (masi-app-sqlite) is the default; the retired pre-SQLite
// backend stays reachable only behind EXPO_PUBLIC_SUPABASE_TARGET=primary.
const DEFAULT_SUPABASE_TARGET = 'sqlite-staging';

// Publishable (anon) keys only; safe to commit.
const TARGET_FALLBACKS = {
  primary: {
    url: 'https://jcqrlwetutnpuchjoyyd.supabase.co',
    anonKey: 'sb_publishable_Fg3Papwm3y4H3_L5c9RrWg_WwDk8Rs0',
  },
  'sqlite-staging': {
    url: 'https://segygjzpujphwvrubusm.supabase.co',
    anonKey: 'sb_publishable_nBApylByXt6pn1Owd8eaxg_MA_QwZg7',
  },
};

const readValue = (env, expoExtra, envName, extraName) => (
  env?.[envName] || expoExtra?.[extraName] || ''
);

const assertPresent = (value, name, target) => {
  if (!value) {
    throw new Error(`${name} is required for Supabase target "${target}".`);
  }
};

const normalizeUrl = (url) => url.replace(/\/+$/, '');

const expectedSupabaseUrl = (projectId) => `https://${projectId}.supabase.co`;

const assertUrlMatchesProject = (url, projectId) => {
  const expectedUrl = expectedSupabaseUrl(projectId);
  if (normalizeUrl(url) !== expectedUrl) {
    throw new Error(`Supabase URL for project "${projectId}" must be ${expectedUrl}.`);
  }
};

const targetOwningUrl = (url) => {
  const normalized = normalizeUrl(url);
  return Object.keys(KNOWN_SUPABASE_PROJECTS).find(
    (target) => expectedSupabaseUrl(KNOWN_SUPABASE_PROJECTS[target]) === normalized
  );
};

const resolveSupabaseProjectConfig = ({
  env = process.env,
  expoExtra = {},
} = {}) => {
  const supabaseTarget =
    readValue(env, expoExtra, 'EXPO_PUBLIC_SUPABASE_TARGET', 'supabaseTarget') ||
    DEFAULT_SUPABASE_TARGET;

  const expectedProjectId = KNOWN_SUPABASE_PROJECTS[supabaseTarget];
  if (!expectedProjectId) {
    throw new Error(`Unknown Supabase target "${supabaseTarget}".`);
  }

  const envProjectId = readValue(
    env,
    expoExtra,
    'EXPO_PUBLIC_SUPABASE_PROJECT_ID',
    'supabaseProjectId'
  );
  const envUrl = readValue(env, expoExtra, 'EXPO_PUBLIC_SUPABASE_URL', 'supabaseUrl');
  const envAnonKey = readValue(
    env,
    expoExtra,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'supabaseAnonKey'
  );

  const fallbacks = TARGET_FALLBACKS[supabaseTarget] || {};
  const supabaseProjectId = envProjectId || expectedProjectId;
  const supabaseUrl = envUrl || fallbacks.url || '';
  const supabaseAnonKey = envAnonKey || fallbacks.anonKey || '';

  assertPresent(supabaseProjectId, 'EXPO_PUBLIC_SUPABASE_PROJECT_ID', supabaseTarget);
  assertPresent(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL', supabaseTarget);
  assertPresent(supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', supabaseTarget);

  if (supabaseProjectId !== expectedProjectId) {
    throw new Error(
      `Supabase project ID "${supabaseProjectId}" is not allowed for target "${supabaseTarget}".`
    );
  }

  const owningTarget = targetOwningUrl(supabaseUrl);
  if (owningTarget && owningTarget !== supabaseTarget) {
    throw new Error(
      `EXPO_PUBLIC_SUPABASE_URL "${supabaseUrl}" belongs to target "${owningTarget}" but the selected target is "${supabaseTarget}". `
      + `Either set EXPO_PUBLIC_SUPABASE_TARGET=${owningTarget} explicitly, or remove stale `
      + `EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY overrides (e.g. from .env.local).`
    );
  }

  assertUrlMatchesProject(supabaseUrl, supabaseProjectId);

  return {
    supabaseTarget,
    supabaseProjectId,
    supabaseUrl,
    supabaseAnonKey,
  };
};

module.exports = {
  KNOWN_SUPABASE_PROJECTS,
  resolveSupabaseProjectConfig,
};
