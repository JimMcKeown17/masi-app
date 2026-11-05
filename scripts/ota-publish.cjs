#!/usr/bin/env node
// The one supported way to publish a Masi app update (OTA):
//   npm run ota:publish -- --message "what changed" [--channel preview]            (dry run)
//   npm run ota:publish -- --message "what changed" [--channel preview] --publish  (publishes)
//   … --allow-rollback "why"   (only when publishing would roll phones back on purpose)
//
// A dry run is the default, like the Head Office scripts' --apply: only an explicit --publish
// reaches phones, so a flag npm swallows or a typo leaves the script on the safe side.
//
// It numbers the update: the Nth update published for a runtime is release <version>+N
// (1.5.0+2), so a tester can read Profile → App release and know which update the phone runs.
// The number is not committed. It is counted from the EAS branch at publish time and stamped
// into the update through app.config.js (MASI_OTA_RELEASE → extra.otaRelease).
//
// It never rolls phones back by accident. Before counting, it finds the update phones on the
// channel run now (the newest update group for this runtime) and refuses unless that update's
// commit is in HEAD, so a tree that lacks it (main behind an unmerged branch, 2026-11-05) cannot
// replace it. A rollback on purpose needs --allow-rollback "why", which goes into the message.
//
// Child processes are spawned with argument arrays: the message never passes through a shell.
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EAS_CLI = 'eas-cli@26.0.0';
const PAGE_SIZE = 50; // eas-cli 26 caps update:list --limit at 50.
const MAX_PAGES = 200;
const CHANNEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IGNORED_UNTRACKED = /^\?\? (node_modules|dist)(\/.*)?$/;
const MESSAGE_REQUIRED = 'Missing --message: --message "describe what changed" is required.';
const ROLLBACK_REASON_REQUIRED = '--allow-rollback needs a reason: --allow-rollback "why phones should go back".';
const USAGE = 'npm run ota:publish -- --message "…" [--channel preview] [--allow-rollback "why"] [--publish]';
const GROUP_ID = /^[0-9A-Za-z][0-9A-Za-z-]*$/;
const COMMIT_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

// npm reads flags written before the `--` as its own settings and passes the script only what
// follows it, so `npm run ota:publish --dry-run -- --message x` would reach this script as a real
// publish. npm exports such a setting as npm_config_<name>; any of this script's flags there means
// the command was not what it looks like, so refuse it rather than guess what was meant.
const NPM_TAKEN_FLAGS = [
  ['dry_run', '--dry-run'], ['publish', '--publish'], ['channel', '--channel'], ['message', '--message'],
  ['allow_rollback', '--allow-rollback'],
];
const refuseFlagsNpmTook = (env) => {
  for (const [name, flag] of NPM_TAKEN_FLAGS) {
    const value = env[`npm_config_${name}`];
    if (value === undefined || value === '' || value === 'false') continue;
    throw new Error(`npm took ${flag} for itself (npm_config_${name}=${value}), so this script never saw it. `
      + `Write every flag after the \`--\`: ${USAGE}. Nothing was published.`);
  }
};

const parseArgs = (argv) => {
  const options = { message: undefined, channel: 'preview', publish: false, dryRunFlag: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--message' || arg === '-m') { options.message = argv[index + 1]; index += 1; }
    else if (arg.startsWith('--message=')) options.message = arg.slice('--message='.length);
    else if (arg === '--channel') { options.channel = argv[index + 1]; index += 1; }
    else if (arg.startsWith('--channel=')) options.channel = arg.slice('--channel='.length);
    else if (arg === '--allow-rollback') { options.allowRollback = argv[index + 1] ?? ''; index += 1; }
    else if (arg.startsWith('--allow-rollback=')) options.allowRollback = arg.slice('--allow-rollback='.length);
    else if (arg === '--dry-run') options.dryRunFlag = true;
    else if (arg === '--publish') options.publish = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const message = typeof options.message === 'string' ? options.message.trim() : '';
  if (!message) throw new Error(MESSAGE_REQUIRED);
  // `--message --dry-run` must not publish with the message "--dry-run" and no dry run.
  if (message.startsWith('-')) throw new Error(`--message needs a description, not "${message}": a message cannot start with "-".`);
  if (/[\r\n]/.test(message)) throw new Error('--message must be one line.');
  if (typeof options.channel !== 'string' || !CHANNEL_NAME.test(options.channel)) {
    throw new Error('--channel needs a channel name, such as preview or production.');
  }
  if (options.publish && options.dryRunFlag) throw new Error('--publish and --dry-run cannot be used together.');
  let allowRollback;
  if (options.allowRollback !== undefined) {
    allowRollback = options.allowRollback.trim();
    if (!allowRollback) throw new Error(ROLLBACK_REASON_REQUIRED);
    if (allowRollback.startsWith('-')) {
      throw new Error(`--allow-rollback needs a reason, not "${allowRollback}": a reason cannot start with "-".`);
    }
    if (/[\r\n]/.test(allowRollback)) throw new Error('--allow-rollback reason must be one line.');
  }
  return { message, channel: options.channel, dryRun: !options.publish, allowRollback };
};

// Under the appVersion runtime policy the runtime is the app version, so numbering per
// runtime is numbering per version.
const readAppVersion = (loadConfig) => {
  const config = loadConfig();
  if (config?.runtimeVersion?.policy !== 'appVersion') {
    throw new Error('app.config.js must use runtimeVersion { policy: "appVersion" }: release numbers count updates per app version.');
  }
  if (typeof config.version !== 'string' || !config.version) throw new Error('app.config.js has no version.');
  return config.version;
};

const parseUpdateGroupPage = (raw) => {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('eas update:list did not return JSON.'); }
  if (!Array.isArray(parsed?.currentPage)) throw new Error('eas update:list returned no update groups list (currentPage).');
  for (const group of parsed.currentPage) {
    if (typeof group?.runtimeVersion !== 'string' || !group.runtimeVersion) {
      throw new Error('eas update:list returned an update group without a runtime version.');
    }
  }
  return parsed.currentPage;
};

const listUpdateGroups = ({ branch, runForOutput, maxPages = MAX_PAGES }) => {
  const groups = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    let page;
    try {
      page = parseUpdateGroupPage(runForOutput('npx', [
        '--yes', EAS_CLI, 'update:list', '--branch', branch, '--limit', String(PAGE_SIZE),
        '--offset', String(pageIndex * PAGE_SIZE), '--json', '--non-interactive',
      ]));
    } catch (error) {
      throw new Error(`Could not list the updates on EAS branch ${branch}, so the release number is unknown. Nothing was published.\n${error.message}`);
    }
    if (page.some(group => group.branch !== undefined && group.branch !== branch)) {
      throw new Error(`eas update:list --branch ${branch} returned updates from another branch. Nothing was published.`);
    }
    groups.push(...page);
    if (page.length < PAGE_SIZE) return groups;
  }
  throw new Error(`EAS branch ${branch} lists more than ${maxPages * PAGE_SIZE} update groups; refusing to guess a release number.`);
};

const parseChannelBranches = (raw, channel) => {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('eas channel:view did not return JSON.'); }
  const view = parsed?.currentPage;
  if (view?.name !== channel) throw new Error(`eas channel:view returned channel ${view?.name}, not ${channel}.`);
  if (!Array.isArray(view.updateBranches)) throw new Error('eas channel:view returned no branches list (updateBranches).');
  return view.updateBranches.map((branch) => {
    if (typeof branch?.name !== 'string' || !branch.name) throw new Error('eas channel:view returned a branch without a name.');
    return branch.name;
  });
};

// `eas update --channel c` publishes to the branch channel c points at, but the release number is
// counted on the branch named c. Refuse unless those are the same single branch (a channel that
// was re-pointed, or is mid-rollout across two branches, would get a wrong or repeated number).
const assertChannelBranch = ({ channel, runForOutput }) => {
  let branches;
  try {
    branches = parseChannelBranches(runForOutput('npx', [
      '--yes', EAS_CLI, 'channel:view', channel, '--json', '--non-interactive',
    ]), channel);
  } catch (error) {
    throw new Error(`Could not read channel ${channel}, so the branch its updates go to is unknown. Nothing was published.\n${error.message}`);
  }
  if (branches.length !== 1 || branches[0] !== channel) {
    const target = branches.length === 0 ? 'no branch' : `${branches.length === 1 ? 'branch' : 'branches'} ${branches.join(', ')}`;
    throw new Error(`Channel ${channel} sends its updates to ${target}, not to branch ${channel}, where its release numbers `
      + 'are counted, so the number would be wrong. Nothing was published.');
  }
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The release number an update message carries ("OTA 1.5.0+5: …" → 5), or 0 when it has none.
const releaseNumberIn = (message, version) => Number(new RegExp(`OTA ${escapeRegExp(version)}\\+(\\d+):`).exec(message || '')?.[1] ?? 0);

// N = (update groups already published for this runtime) + 1. A number already used in an
// update message ("OTA 1.5.0+5: …") also counts, so deleting an older group cannot make one
// repeat. Known limit: EAS lists no deleted groups, so deleting the newest numbered group frees
// its number for the next publish (the phone's Update id still tells the two apart).
const nextReleaseNumber = ({ groups, version }) => {
  const forRuntime = groups.filter(group => group.runtimeVersion === version);
  const used = forRuntime.map(group => releaseNumberIn(group.message, version));
  return Math.max(forRuntime.length, ...used) + 1;
};

// `update:view <group> --json` prints the group's updates, one per platform
// (getUpdateWithFileUrlsJsonInfosForUpdates in eas-cli 26.0.0 build/update/utils.js). Only it carries
// the commit, `gitCommitHash`; update:list leaves it out. Null fields are dropped from the JSON, so
// an update published without a commit has no gitCommitHash. Returns the commit, or undefined.
const parseUpdateGroupView = (raw, groupId) => {
  let updates;
  try { updates = JSON.parse(raw); } catch { throw new Error('eas update:view did not return JSON.'); }
  if (!Array.isArray(updates) || updates.length === 0) throw new Error('eas update:view returned no updates.');
  if (updates.some(update => update?.group !== groupId)) throw new Error('eas update:view returned updates from another group.');
  const commits = [...new Set(updates.map(update => update.gitCommitHash).filter(commit => commit != null))];
  if (commits.length > 1) throw new Error(`eas update:view returned updates with different commits (${commits.join(', ')}).`);
  if (commits.length === 0) return undefined;
  if (typeof commits[0] !== 'string' || !COMMIT_HASH.test(commits[0])) {
    throw new Error(`eas update:view returned the commit ${JSON.stringify(commits[0])}, which is not a git commit hash.`);
  }
  return commits[0].toLowerCase();
};

// The update phones on this channel and runtime run now: the newest update group for the runtime.
// eas-cli lists a branch's groups newest first (it reads offset 0, limit 1 as the latest group:
// channel:view's "most recent update group", selectRuntimeAndGetLatestUpdateGroupForEachPublishPlatformOnBranchAsync).
// A group that rolls back to embedded runs the store build's own bundle; eas-cli records no
// commit for it, so update:view is not asked.
const findRunningUpdate = ({ groups, version, runForOutput }) => {
  const newest = groups.find(group => group.runtimeVersion === version);
  if (!newest) return { builtIn: true };
  if (typeof newest.group !== 'string' || !GROUP_ID.test(newest.group)) {
    throw new Error(`eas update:list returned an update group without a usable id (${JSON.stringify(newest.group)}). Nothing was published.`);
  }
  const running = { group: newest.group, release: releaseNumberIn(newest.message, version) };
  if (newest.isRollBackToEmbedded === true) return { ...running, builtIn: true };
  try {
    const raw = runForOutput('npx', ['--yes', EAS_CLI, 'update:view', newest.group, '--json']);
    return { ...running, commit: parseUpdateGroupView(raw, newest.group) };
  } catch (error) {
    throw new Error(`Could not read update group ${newest.group}, so the code phones run is unknown. Nothing was published.\n${error.message}`);
  }
};

// git exits 1 for "no" (`merge-base --is-ancestor`, `rev-parse --verify --quiet`); any other
// failure (128: an unknown commit, not a repository) is an error, not an answer.
const gitAnswers = (git, args) => {
  try { git(args); return true; } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
};

// Publishing HEAD replaces the update phones run. Refuses when HEAD does not contain that update's
// commit (C equal to HEAD counts), unless --allow-rollback gives a reason; refuses --allow-rollback
// when the publish rolls nothing back, so no update is labelled a rollback by mistake. Returns the
// lines to print: what phones run now, and the check result.
const checkPhonesKeepTheirCode = ({ running, version, channel, head, git, allowRollback }) => {
  const short = commit => commit.slice(0, 7);
  const release = running.release ? `release ${version}+${running.release}` : 'not numbered';
  const phonesRun = `Phones on ${channel} (runtime ${version}) run`;
  let runs;
  let fine;
  if (running.builtIn) {
    runs = running.group
      ? `${phonesRun} their built-in bundle: update group ${running.group} (${release}) rolled them back to it.`
      : `${phonesRun} their built-in bundle: branch ${channel} has no update for this runtime yet.`;
    fine = { why: 'phones run their built-in bundle',
      note: 'Note: phones run their built-in bundle, so there is no update commit this publish must contain.' };
  } else if (!running.commit) {
    runs = `${phonesRun} update group ${running.group} (${release}), no commit recorded.`;
    fine = { why: `update group ${running.group} records no commit`,
      note: `Note: update group ${running.group} records no commit (published before commits were recorded), `
        + 'so there is no commit this publish must contain.' };
  } else {
    const commit = running.commit;
    runs = `${phonesRun} update group ${running.group} (${release}), commit ${commit}.`;
    const known = gitAnswers(git, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
    if (known && gitAnswers(git, ['merge-base', '--is-ancestor', commit, head])) {
      fine = { why: `this commit (${short(head)}) contains ${short(commit)}`,
        note: `Check passed: this commit (${short(head)}) contains ${short(commit)}, so this update keeps the code phones run now.` };
    } else {
      const phones = `phones on ${channel} run update group ${running.group} (${release}) from commit ${commit}`;
      if (allowRollback) {
        return [runs, `Rollback allowed (--allow-rollback): ${allowRollback}. `
          + (known ? `This commit (${short(head)}) does not contain ${short(commit)}, so phones go back to code without it.`
            : `This repository does not have ${short(commit)}, so phones may go back to code without it.`)];
      }
      if (!known) {
        throw new Error(`Refusing to publish: ${phones}, which this repository does not have, so the script cannot tell `
          + 'whether publishing would roll phones back to code without it. Run git fetch origin, then publish again. '
          + 'If that commit is gone from origin for good, --allow-rollback "why" publishes anyway. Nothing was published.');
      }
      throw new Error(`Refusing to publish: ${phones}, and this commit (${short(head)}) does not contain it. `
        + 'Publishing would roll phones back to code without it.\n'
        + `Merge the branch that contains ${short(commit)} into this one (git branch -r --contains ${commit} lists it), `
        + 'then publish again. To roll phones back on purpose, add --allow-rollback "why". Nothing was published.');
    }
  }
  if (allowRollback) {
    throw new Error(`--allow-rollback is only for a publish that rolls phones back, and this one does not: ${fine.why}. `
      + 'Run again without it. Nothing was published.');
  }
  return [runs, fine.note];
};

const formatUpdateMessage = ({ version, release, message, commit, rollbackReason }) => (
  `OTA ${version}+${release}: ${message}${rollbackReason ? ` (rollback: ${rollbackReason})` : ''} (${commit.slice(0, 7)})`
);

// The EAS environment has the channel's name (preview → preview, production → production).
const buildUpdateCommand = ({ channel, message }) => ({
  command: 'npx',
  args: ['--yes', EAS_CLI, 'update', '--channel', channel, '--environment', channel, '--non-interactive', '--message', message],
});

// eas-cli 26 takes the environment as an argument; `env:exec --environment …` fails.
const buildSourcemapCommand = ({ channel }) => ({
  command: 'npx',
  args: ['--yes', EAS_CLI, 'env:exec', channel, 'npm run sentry:sourcemaps', '--non-interactive'],
});

// Returns HEAD. Refuses uncommitted or untracked work, and a commit origin does not have.
const assertReleaseReady = ({ git }) => {
  const dirty = git(['status', '--porcelain']).split('\n').map(line => line.trimEnd())
    .filter(line => line && !IGNORED_UNTRACKED.test(line));
  if (dirty.length) {
    throw new Error(`Refusing to publish with uncommitted changes. Commit and push first:\n${dirty.join('\n')}`);
  }
  const head = git(['rev-parse', 'HEAD']).trim();
  const onOrigin = git(['branch', '-r', '--contains', 'HEAD']).split('\n')
    .some(line => line.trim().startsWith('origin/'));
  if (!onOrigin) throw new Error(`Refusing to publish ${head.slice(0, 7)}: it is not on any origin branch. Push it first.`);
  return head;
};

const shellWord = (word) => (/^[A-Za-z0-9_./:=@+-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`);
const describe = ({ command, args }, env = {}) => [
  ...Object.entries(env).map(([key, value]) => `${key}=${shellWord(value)}`), command, ...args.map(shellWord),
].join(' ');

const main = (argv, { git, runForOutput, run, loadConfig, env = process.env, now = () => new Date(), log = console.log }) => {
  refuseFlagsNpmTook(env);
  const { message, channel, dryRun, allowRollback } = parseArgs(argv);
  const version = readAppVersion(loadConfig);
  const head = assertReleaseReady({ git });
  assertChannelBranch({ channel, runForOutput });
  const groups = listUpdateGroups({ branch: channel, runForOutput });
  const running = findRunningUpdate({ groups, version, runForOutput });
  checkPhonesKeepTheirCode({ running, version, channel, head, git, allowRollback }).forEach(line => log(line));
  const release = nextReleaseNumber({ groups, version });
  const releaseLabel = `${version}+${release}`;
  const updateMessage = formatUpdateMessage({ version, release, message, commit: head, rollbackReason: allowRollback });
  const releaseEnv = { MASI_OTA_RELEASE: String(release), MASI_OTA_PUBLISHED_AT: now().toISOString() };
  const update = buildUpdateCommand({ channel, message: updateMessage });
  const sourcemaps = buildSourcemapCommand({ channel });
  const result = { release, releaseLabel, message: updateMessage, channel, dryRun };

  if (dryRun) {
    log(`Next release: ${releaseLabel} on ${channel}`);
    log(`Update message: ${updateMessage}`);
    log(`Would run: ${describe(update, releaseEnv)}`);
    log(`Then: ${describe(sourcemaps)}`);
    log('Nothing was published. Add --publish to publish.');
    return result;
  }

  log(`Publishing ${releaseLabel} on ${channel}: ${updateMessage}`);
  run(update.command, update.args, { env: releaseEnv });
  try {
    run(sourcemaps.command, sourcemaps.args, {});
  } catch (error) {
    throw new Error(`Update ${releaseLabel} is published, but uploading its Sentry source maps failed (${error.message}). `
      + `Finish the release by re-running: ${describe(sourcemaps)}`);
  }
  log(`Published ${releaseLabel} on ${channel}. A phone shows it in Profile → App release (Release ${releaseLabel}) `
    + 'once it has downloaded the update and restarted.');
  return result;
};

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const spawnChecked = (command, args, options) => {
  const outcome = spawnSync(command, args, { cwd: ROOT, ...options, env: { ...process.env, ...options.env } });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0) throw new Error(`${command} ${args[1] === EAS_CLI ? args.slice(1, 3).join(' ') : args[0]} exited with code ${outcome.status}`);
  return outcome;
};

const runForOutput = (command, args) => spawnChecked(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).stdout;
const run = (command, args, { env } = {}) => { spawnChecked(command, args, { stdio: 'inherit', env }); };
const loadConfig = () => require(path.join(ROOT, 'app.config.js'))().expo;

if (require.main === module) {
  try {
    main(process.argv.slice(2), { git, runForOutput, run, loadConfig });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  EAS_CLI,
  assertChannelBranch,
  assertReleaseReady,
  buildSourcemapCommand,
  buildUpdateCommand,
  checkPhonesKeepTheirCode,
  formatUpdateMessage,
  listUpdateGroups,
  main,
  nextReleaseNumber,
  parseArgs,
  parseUpdateGroupPage,
  readAppVersion,
};
