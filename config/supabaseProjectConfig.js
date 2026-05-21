const KNOWN_SUPABASE_PROJECTS = {
  primary: 'jcqrlwetutnpuchjoyyd',
  'sqlite-staging': 'segygjzpujphwvrubusm',
};

const PRIMARY_SUPABASE_URL = 'https://jcqrlwetutnpuchjoyyd.supabase.co';
const PRIMARY_SUPABASE_ANON_KEY = 'sb_publishable_Fg3Papwm3y4H3_L5c9RrWg_WwDk8Rs0';

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

const resolveSupabaseProjectConfig = ({
  env = process.env,
  expoExtra = {},
} = {}) => {
  const supabaseTarget =
    readValue(env, expoExtra, 'EXPO_PUBLIC_SUPABASE_TARGET', 'supabaseTarget') ||
    'primary';

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

  const supabaseProjectId = envProjectId || expectedProjectId;
  const supabaseUrl = envUrl || (supabaseTarget === 'primary' ? PRIMARY_SUPABASE_URL : '');
  const supabaseAnonKey =
    envAnonKey || (supabaseTarget === 'primary' ? PRIMARY_SUPABASE_ANON_KEY : '');

  assertPresent(supabaseProjectId, 'EXPO_PUBLIC_SUPABASE_PROJECT_ID', supabaseTarget);
  assertPresent(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL', supabaseTarget);
  assertPresent(supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', supabaseTarget);

  if (supabaseProjectId !== expectedProjectId) {
    throw new Error(
      `Supabase project ID "${supabaseProjectId}" is not allowed for target "${supabaseTarget}".`
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
