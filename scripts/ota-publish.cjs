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
// It never rolls phones back by accident. Before counting, it finds the updates phones on the
// channel run now (per platform, the newest update group for this runtime) and refuses unless HEAD
// contains each one's commit: in its history, or as the same changes (a squash merge), or as the
// changes of a branch tip that has the commit in its history (a squash merge of a branch phones ran
// mid-way), or, for a merge commit that adds nothing of its own (a release branch that merged a
// feature branch), as both its parents. Files that never reach phones (tests, scripts,
// documentation) do not count. So a tree that lacks it (main behind an unmerged branch, 2026-11-05)
// cannot replace it. A rollback on purpose needs --allow-rollback "why", which goes into the message.
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

// Phones are Android and iOS, and the script publishes both: `eas update` without --platform
// publishes defaultPublishPlatforms ['android', 'ios'] (eas-cli 26.0.0 build/project/publish.js).
const PHONE_PLATFORMS = [['android', 'Android'], ['ios', 'iOS']];
// update:list's `platforms` is the group's platforms sorted and joined with ", "
// (formatPlatformForUpdateGroup, build/update/utils.js): "android, ios", or "android" for a group
// published with --platform android.
const PLATFORMS_FIELD = /^[a-z]+(?:, [a-z]+)*$/;

// What one update group means for the phones it serves. No group: their built-in bundle. A roll back
// to embedded: also their built-in bundle; eas-cli records no commit for it, so update:view is not
// asked. Otherwise the update and its commit, read with update:view.
const describeRunningGroup = ({ group, version, runForOutput }) => {
  if (!group) return { builtIn: true };
  if (typeof group.group !== 'string' || !GROUP_ID.test(group.group)) {
    throw new Error(`eas update:list returned an update group without a usable id (${JSON.stringify(group.group)}). Nothing was published.`);
  }
  const running = { group: group.group, release: releaseNumberIn(group.message, version) };
  if (group.isRollBackToEmbedded === true) return { ...running, builtIn: true };
  try {
    const raw = runForOutput('npx', ['--yes', EAS_CLI, 'update:view', group.group, '--json']);
    return { ...running, commit: parseUpdateGroupView(raw, group.group) };
  } catch (error) {
    throw new Error(`Could not read update group ${group.group}, so the code phones run is unknown. Nothing was published.\n${error.message}`);
  }
};

// The updates phones on this channel and runtime run now. EAS serves each platform the newest group
// for its runtime that has that platform, so a group published for one platform leaves the other
// platform's phones on an older group. eas-cli reads it the same way: offset 0, limit 1, with a
// platform filter (selectRuntimeAndGetLatestUpdateGroupForEachPublishPlatformOnBranchAsync,
// build/update/queries.js); the listing is newest first. Returns one entry per group phones run,
// with the platforms that run it.
const findRunningUpdates = ({ groups, version, runForOutput }) => {
  const newest = new Map();
  for (const group of groups) {
    if (newest.size === PHONE_PLATFORMS.length) break;
    if (group.runtimeVersion !== version) continue;
    if (typeof group.platforms !== 'string' || !PLATFORMS_FIELD.test(group.platforms)) {
      throw new Error(`eas update:list returned update group ${group.group} with platforms ${JSON.stringify(group.platforms)}, `
        + 'so which phones run it is unknown. Nothing was published.');
    }
    const platforms = group.platforms.split(', ');
    PHONE_PLATFORMS.forEach(([platform]) => {
      if (platforms.includes(platform) && !newest.has(platform)) newest.set(platform, group);
    });
  }
  const entries = [];
  PHONE_PLATFORMS.forEach(([platform]) => {
    const source = newest.get(platform);
    const same = entries.find(entry => entry.source === source);
    if (same) same.platforms.push(platform);
    else entries.push({ source, platforms: [platform] });
  });
  return entries.map(({ source, platforms }) => ({ platforms, ...describeRunningGroup({ group: source, version, runForOutput }) }));
};

// git exits 1 for "no" (`merge-base --is-ancestor`, `rev-parse --verify --quiet`); any other
// failure (128: an unknown commit, not a repository) is an error, not an answer.
const gitAnswers = (git, args) => {
  try { git(args); return true; } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
};

// Paths that never reach the app bundle, so a difference only there is not code phones run: tests
// (__tests__/ at any depth, test-support/), scripts/, Supabase migrations and functions, CI and agent
// files, and documentation. Nothing in src/, App.js, index.js, config/ or app.config.js imports from
// them (only tests import test-support/). Everything else counts, to stay on the safe side: src/,
// config/, content/, assets/, plugins/, package.json, the lockfile, top-level .js and .json files.
const OUTSIDE_THE_APP = new RegExp('^(?:(?:documentation|docs|test-support|scripts|supabase|supabase-migrations|'
  + '\\.github|\\.agents|\\.claude)/|[^/]+\\.md$)|(?:^|/)__tests__/');
const TREE_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_LINE_COMMITS = 200;
const MAX_BRANCH_TIPS = 20;

// Where merging `commit` into `at` gives something other than `against`: { app, other } paths. By
// default `against` is `at`, so this is what the merge would change. git merge-tree exits 1 on
// conflicts and still prints the merged tree, then the conflicted paths (--name-only); a conflict
// counts as a change. Writes the merged tree's objects (unreferenced; git gc removes them).
const mergeChanges = ({ git, at, commit, against = at }) => {
  let out;
  let conflicted = false;
  try { out = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', at, commit]); } catch (error) {
    if (error?.status !== 1 || typeof error.stdout !== 'string') throw error;
    out = error.stdout;
    conflicted = true;
  }
  const [tree, ...conflicts] = out.split('\n').filter(Boolean);
  if (!TREE_ID.test(tree ?? '')) throw new Error(`git merge-tree printed no tree for ${at} and ${commit}.`);
  const changed = git(['diff-tree', '-r', '--name-only', '-z', against, tree]).split('\0').filter(Boolean);
  const paths = [...new Set([...(conflicted ? conflicts : []), ...changed])].sort();
  return { app: paths.filter(file => !OUTSIDE_THE_APP.test(file)), other: paths.filter(file => OUTSIDE_THE_APP.test(file)) };
};

// Whether HEAD has the changes of one of `commits` although none is in its history: a squash merge
// copies a branch's changes into one new commit. HEAD has a commit's changes when merging it would
// change only files that never reach phones. Later work on the same lines makes that merge
// conflict, so when no commit passes at HEAD, the check walks back along HEAD's first-parent line
// (to where it meets that commit's history) and passes at the first commit that already had them.
// Every commit is merged into HEAD first (one merge-tree each), so a walk runs only when none passes
// there. Returns { commit, at, other } or { missing } (what merging the first commit into HEAD would
// change in files that reach phones).
const findAppCode = ({ git, commits, head }) => {
  let missing;
  for (const commit of commits) {
    const atHead = mergeChanges({ git, at: head, commit });
    if (atHead.app.length === 0) return { commit, at: head, other: atHead.other };
    if (!missing) missing = atHead.app;
  }
  for (const commit of commits) {
    const line = git(['rev-list', '--first-parent', `--max-count=${MAX_LINE_COMMITS}`, head, `^${commit}`])
      .split('\n').filter(Boolean);
    const at = line.find(candidate => candidate !== head && mergeChanges({ git, at: candidate, commit }).app.length === 0);
    if (at) return { commit, at };
  }
  return { missing };
};

// The local and remote-tracking branch tips whose history has `commit`, newest first: one entry per
// tip (named after its first branch; symbolic refs such as origin/HEAD skipped), `commit` itself
// left out, at most MAX_BRANCH_TIPS checked. HEAD has `commit`'s changes when it has the changes of
// such a tip: phones can run a commit mid-way along a branch (1.5.0+4 ran b759128f, mid-way along
// feat/app-release-card), and the branch's squash merge also has the later commits' changes, so it
// conflicts with `commit` on the lines they changed, but not with the tip.
const branchTipsContaining = ({ git, commit }) => {
  const tips = new Map();
  git(['for-each-ref', '--contains', commit, '--sort=-committerdate',
    '--format=%(objectname) %(refname:short) %(symref)', 'refs/heads', 'refs/remotes'])
    .split('\n').forEach((line) => {
      const [tip, name, symref] = line.split(' ');
      if (tip && name && !symref && tip !== commit && !tips.has(tip)) tips.set(tip, name);
    });
  const all = [...tips].map(([tip, name]) => ({ commit: tip, name }));
  return { checked: all.slice(0, MAX_BRANCH_TIPS), total: all.length };
};

const short = commit => commit.slice(0, 7);
// "a, b, c and 2 more": at most three named.
const someOf = items => (items.length > 3 ? `${items.slice(0, 3).join(', ')} and ${items.length - 3} more` : items.join(', '));
// "2 files: src/a.js, src/b.js", src/ first, at most three named.
const someFiles = (files) => {
  const named = [...files].sort((x, y) => (y.startsWith('src/') - x.startsWith('src/')) || (x < y ? -1 : Number(x > y)));
  return `${files.length} file${files.length === 1 ? '' : 's'}: ${someOf(named)}`;
};
// " This commit does not have the changes of a branch that contains C either (checked …)." or ''.
const tipsChecked = ({ tips, commit }) => {
  if (tips.total === 0) return '';
  const { length } = tips.checked;
  const checked = tips.total > length ? `the newest ${length} of ${tips.total} branch tips` : `${length} branch tip${length === 1 ? '' : 's'}`;
  const rest = tips.total > length ? `; the other ${tips.total - length} were not checked` : '';
  return ` This commit does not have the changes of a branch that contains ${short(commit)} either `
    + `(checked ${checked}: ${someOf(tips.checked.map(tip => tip.name))}${rest}).`;
};

// How many merges deep the merge rule follows: the commit phones run, and its parents.
const MERGE_DEPTH = 2;

// The commits `commit` merges (its parents, first parent first); one for an ordinary commit.
const parentsOf = ({ git, commit }) => git(['rev-parse', `${commit}^@`]).split('\n').filter(Boolean);

// How HEAD has the changes of `commit`, which is not in its history. Returns what passed:
//   { at, other }  its changes, at HEAD or at a commit before it on HEAD's first-parent line;
//   { at, tip }    the changes of a branch tip that has `commit` in its history;
//   { merge }      `commit` is a merge that adds nothing of its own, and HEAD has both its parents
//                  (merge.passed);
// or { missing, tips, merge }: what merging `commit` into HEAD would change in files that reach
// phones, the branch tips checked, and, when `commit` is a merge, why the merge rule failed.
const findChanges = (context, commit, depth) => {
  const { git, head } = context;
  const own = findAppCode({ git, commits: [commit], head });
  if (own.at) return { at: own.at, other: own.other };
  const tips = branchTipsContaining({ git, commit });
  const viaTip = findAppCode({ git, commits: tips.checked.map(tip => tip.commit), head });
  if (viaTip.at) return { at: viaTip.at, tip: tips.checked.find(entry => entry.commit === viaTip.commit) };
  const merge = checkMerge(context, commit, depth); // defined below; the two call each other
  return merge?.passed ? { merge } : { missing: own.missing, tips, merge };
};

// Whether HEAD contains `commit`: in its history ({ history: true }), or as findChanges finds it.
const findInHead = (context, commit, depth) => (
  gitAnswers(context.git, ['merge-base', '--is-ancestor', commit, context.head])
    ? { history: true } : findChanges(context, commit, depth)
);

// A merge commit's code is its parents' code put together, plus anything the merge changed itself (a
// conflict resolved by hand, or an "evil" merge's own edit). When git merging the two parents again
// conflicts in no file that reaches phones, and differs from the merge's tree only in files that never
// reach phones, the merge added nothing of its own, so HEAD has it when HEAD has both parents. Each
// parent gets the full check: history, its changes, branch tips, and this rule again for a parent
// that is itself a merge (up to MERGE_DEPTH merges deep). A release branch that merged a feature
// branch is the case: phones run the merge (1.5.0+5 runs 1bddda8e), main gets each side as a squash,
// and the feature's later commits rework lines the merge has, so the merge itself never matches.
// Returns undefined for a commit that is not a merge; else { parents, found, missing, passed }, or
// why the rule was not used: `own` (files the merge changed itself), `octopus` (3+ parents), `deep`.
const checkMerge = (context, commit, depth) => {
  const { git } = context;
  const parents = parentsOf({ git, commit });
  if (parents.length < 2) return undefined;
  if (depth >= MERGE_DEPTH) return { parents, deep: true };
  if (parents.length > 2) return { parents, octopus: true };
  const own = mergeChanges({ git, at: parents[0], commit: parents[1], against: commit });
  if (own.app.length > 0) return { parents, own: own.app };
  const found = parents.map(parent => ({ commit: parent, found: findInHead(context, parent, depth + 1) }));
  const missing = found.filter(parent => parent.found.missing);
  return { parents, found, missing, passed: missing.length === 0 };
};

const mergeOf = parents => `a merge of ${parents.map(short).join(' and ')}`;
// Why HEAD has `commit`, a parent of a merge phones run, in a few words.
const hasReason = ({ commit, found, head }) => {
  if (found.history) return `${short(commit)} in its history`;
  const earlier = found.at && found.at !== head ? `, already in commit ${short(found.at)} before it` : '';
  if (found.tip) {
    return `the changes of branch ${found.tip.name} (${short(found.tip.commit)}), which has ${short(commit)} in its history${earlier}`;
  }
  if (found.at) return `${short(commit)}'s changes${earlier}`;
  return `${short(commit)}, ${mergeOf(found.merge.parents)} that adds nothing of its own that reaches phones, through both `
    + `its parents (${found.merge.found.map(parent => hasReason({ ...parent, head })).join(' and ')})`;
};
// Whether a failed merge rule stopped at MERGE_DEPTH somewhere below.
const stoppedDeep = merge => Boolean(merge?.deep || merge?.missing?.some(parent => stoppedDeep(parent.found.merge)));
// " It is a merge of A and B …" when the merge rule was tried for the commit phones run and failed, or ''.
const mergeRefused = (merge) => {
  if (!merge) return '';
  if (merge.octopus) return ` It is a merge of ${merge.parents.length} commits; the script checks merges of two only.`;
  if (merge.deep) return ` It is ${mergeOf(merge.parents)}; the script follows merges at most ${MERGE_DEPTH} deep.`;
  if (merge.own) {
    return ` It is ${mergeOf(merge.parents)}, but not a clean one: it has changes of its own in files that reach phones `
      + `(${someFiles(merge.own)}).`;
  }
  const merging = merge.missing.map(parent => `merging ${short(parent.commit)} would change files that reach phones `
    + `(${someFiles(parent.found.missing)})`).join('; ');
  return ` It is ${mergeOf(merge.parents)} that adds nothing of its own that reaches phones, but this commit does not have `
    + `${merge.missing.map(parent => short(parent.commit)).join(' or ')}: ${merging}.`
    + `${stoppedDeep(merge) ? ` The script follows merges at most ${MERGE_DEPTH} deep.` : ''}`;
};

// Whether publishing HEAD keeps the code one set of phones runs. Returns what they run (`runs`) and
// either a pass (`why`, `note`) or a refusal (`refusal`, plus the `rollback` line --allow-rollback
// prints instead; `final` when --allow-rollback cannot help either).
const checkRunningUpdate = ({ running, version, channel, head, git, isShallow }) => {
  const platforms = running.platforms ?? PHONE_PLATFORMS.map(([platform]) => platform);
  const name = platforms.length === 1 ? PHONE_PLATFORMS.find(([platform]) => platform === platforms[0])[1] : '';
  const who = name ? `${name} phones` : 'phones';
  const Who = name ? who : 'Phones';
  const release = running.release ? `release ${version}+${running.release}` : 'not numbered';
  const run = `${Who} on ${channel} (runtime ${version}) run`;
  if (running.builtIn) {
    return {
      runs: running.group
        ? `${run} their built-in bundle: update group ${running.group} (${release}) rolled them back to it.`
        : `${run} their built-in bundle: branch ${channel} has no ${name ? `${name} ` : ''}update for this runtime yet.`,
      why: `${who} run their built-in bundle`,
      note: `Note: ${who} run their built-in bundle, so there is no update commit this publish must contain.`,
    };
  }
  if (!running.commit) {
    return {
      runs: `${run} update group ${running.group} (${release}), no commit recorded.`,
      why: `update group ${running.group} records no commit`,
      note: `Note: update group ${running.group} records no commit (published before commits were recorded), `
        + 'so there is no commit this publish must contain.',
    };
  }
  const { commit } = running;
  const runs = `${run} update group ${running.group} (${release}), commit ${commit}.`;
  const pass = why => ({ runs, why, note: `Check passed: ${why}.` });
  if (commit === head) return pass(`this commit (${short(head)}) is the commit ${who} run`);
  const known = gitAnswers(git, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
  if (known && gitAnswers(git, ['merge-base', '--is-ancestor', commit, head])) {
    return pass(`this commit (${short(head)}) has commit ${short(commit)} in its history`);
  }
  const phones = `Refusing to publish: ${who} on ${channel} run update group ${running.group} (${release}) from commit ${commit}`;
  // A shallow clone lacks history, so "not in its history" and "not in this repository" mean nothing.
  if (isShallow()) {
    return { runs, final: true, refusal: `${phones}, and this clone is shallow (part of its history is missing), so the script `
      + `cannot tell whether this commit (${short(head)}) contains it. Run git fetch --unshallow, then publish again.` };
  }
  if (!known) {
    return {
      runs,
      refusal: `${phones}, which this repository does not have, so the script cannot tell whether publishing would roll `
        + `${who} back to code without it. Run git fetch origin, then publish again. If that commit is gone from origin `
        + 'for good, --allow-rollback "why" publishes anyway.',
      rollback: `This repository does not have ${short(commit)}, so ${who} may go back to code without it.`,
    };
  }
  const notInHistory = `Check passed: commit ${short(commit)} is not in this commit's (${short(head)}) history, but`;
  // Its changes; else a branch tip's (C's own changes conflict with later work on the same lines, and
  // a branch tip whose history has C carries that later work too); else, for a merge, its parents.
  const found = findChanges({ git, head }, commit, 0);
  if (found.tip) {
    const branch = `branch ${found.tip.name} (${short(found.tip.commit)}), which has commit ${short(commit)} in its history`;
    return found.at === head
      ? { runs, why: `this commit (${short(head)}) already has the changes of ${branch}`,
        note: `${notInHistory} this commit already has the changes of ${branch} (a squash merge, for example).` }
      : { runs, why: `commit ${short(found.at)} before this one already had the changes of ${branch}`,
        note: `${notInHistory} commit ${short(found.at)} before it already had the changes of ${branch} (a squash merge, for example).` };
  }
  if (found.at === head) {
    return {
      runs,
      why: `this commit (${short(head)}) already has the changes of commit ${short(commit)}`,
      note: `${notInHistory} this commit already has its changes (a squash merge, for example): merging it would change `
        + `${found.other.length ? 'only files that never reach phones' : 'nothing'}.`,
    };
  }
  if (found.at) {
    return {
      runs,
      why: `commit ${short(found.at)} before this one already had the changes of commit ${short(commit)}`,
      note: `${notInHistory} commit ${short(found.at)} before it already had its changes (a squash merge, for example).`,
    };
  }
  if (found.merge?.passed) {
    const merge = `${mergeOf(found.merge.parents)}, adds nothing of its own that reaches phones`;
    const reasons = found.merge.found.map(parent => hasReason({ ...parent, head })).join('; ');
    return {
      runs,
      why: `commit ${short(commit)} is ${merge}, and this commit (${short(head)}) has both its parents`,
      note: `${notInHistory} it is ${merge}, and this commit has both (${reasons}).`,
    };
  }
  return {
    runs,
    refusal: `${phones}, and this commit (${short(head)}) does not contain it: it is not in its history, and merging it would `
      + `change files that reach phones (${someFiles(found.missing)}).${tipsChecked({ tips: found.tips, commit })}`
      + `${mergeRefused(found.merge)} Publishing would roll ${who} back to code without it.\n`
      + `Merge the branch that contains ${short(commit)} into this one (git branch -r --contains ${commit} lists it), `
      + 'then publish again. To roll phones back on purpose, add --allow-rollback "why".',
    rollback: `This commit (${short(head)}) does not contain ${short(commit)}, so ${who} go back to code without it.`,
  };
};

// The check asks git only about commits and refs, which do not change while it runs, so each answer is
// kept: a commit reached twice (a merge's parent, a branch tip, a commit along a walk, the other
// platform's update) costs nothing the second time. Failures are kept too: gitAnswers reads exit 1 as "no".
const answerOnce = (git) => {
  const answers = new Map();
  return (args) => {
    const key = args.join('\0');
    if (!answers.has(key)) {
      try { answers.set(key, { output: git(args) }); } catch (error) { answers.set(key, { error }); }
    }
    const { output, error } = answers.get(key);
    if (error) throw error;
    return output;
  };
};

// Publishing HEAD replaces the updates phones run (one per platform). Refuses when HEAD does not
// contain an update's commit, in its history or as the same changes (a squash merge, a branch tip's,
// or a clean merge's parents), unless --allow-rollback gives a reason; refuses --allow-rollback when
// the publish rolls nothing back, so no update is labelled a rollback by mistake. Returns the lines to
// print: what phones run now, and the check results.
const checkPhonesKeepTheirCode = ({ running, version, channel, head, git: askGit, allowRollback }) => {
  const git = answerOnce(askGit);
  let shallow;
  const isShallow = () => {
    if (shallow === undefined) shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
    return shallow;
  };
  const checks = (Array.isArray(running) ? running : [running])
    .map(entry => checkRunningUpdate({ running: entry, version, channel, head, git, isShallow }));
  const runs = checks.map(check => check.runs);
  const refused = checks.filter(check => check.refusal);
  if (refused.length > 0) {
    if (!allowRollback || refused.some(check => check.final)) {
      throw new Error(`${[...new Set(refused.map(check => check.refusal))].join('\n')} Nothing was published.`);
    }
    return [...runs, ...checks.map(check => (check.refusal
      ? `Rollback allowed (--allow-rollback): ${allowRollback}. ${check.rollback}` : check.note))];
  }
  if (allowRollback) {
    throw new Error('--allow-rollback is only for a publish that rolls phones back, and this one does not: '
      + `${checks.map(check => check.why).join('; ')}. Run again without it. Nothing was published.`);
  }
  return [...runs, ...checks.map(check => check.note)];
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
  const running = findRunningUpdates({ groups, version, runForOutput });
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
