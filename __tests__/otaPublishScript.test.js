global.__MASI_NO_DEFAULT_HANDLE__ = true;
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
// The fixture follows the JSON that eas-cli 26.0.0 prints for
// `update:list --branch <b> --json --non-interactive`: `{ name, id, currentPage: [group] }`, built by
// renderUpdateGroupsOnBranch / getUpdateGroupDescriptionsWithBranch (build/update/queries.js,
// build/update/utils.js). It is shaped from that source, not captured from live EAS.
const previewPage = require('../test-support/fixtures/eas-update-list/preview-page-1.json');
// `channel:view <c> --json --non-interactive` prints `{ currentPage: { ...channel, updateBranches } }`
// (renderPageOfBranchesOnChannel in build/channel/queries.js; the channel fields from
// ViewUpdateChannelOnApp, the branches from ViewBranchesOnUpdateChannel; nulls and __typename
// removed by build/utils/json.js). Also shaped from that source, not captured.
const previewChannel = require('../test-support/fixtures/eas-channel-view/preview.json');
// The branch as it stood when #165 was published (2026-11-05): 1.5.0+2 (group 2ed208c1, from
// e9a4360d on feat/app-release-card) is the newest 1.5.0 update. Same renderer as previewPage.
const pageAtRelease2 = require('../test-support/fixtures/eas-update-list/preview-page-at-1.5.0+2.json');
// The commit is not in the update:list JSON: getUpdateGroupDescriptionsWithBranch
// (build/update/utils.js) leaves gitCommitHash out. `update:view <group> --json` prints the group's
// updates, one per platform, as getUpdateWithFileUrlsJsonInfosForUpdates builds them (same file;
// command in build/commands/update/view.js), with null fields dropped by build/utils/json.js, so an
// update published without a commit has no gitCommitHash key. Shaped from that source, not captured;
// the 1.5.0+2 ids, message, time and commit are the published ones (build log, 2026-11-05).
const viewFixtures = {
  '8addaae6-4f1c-4b0e-9d3a-2c7e5f6a1b90': require('../test-support/fixtures/eas-update-view/lifecycle-8addaae6.json'),
  '2ed208c1-1760-4c1d-b450-0844d4eeb7f0': require('../test-support/fixtures/eas-update-view/release-1.5.0+2.json'),
};
const {
  EAS_CLI,
  assertChannelBranch,
  assertReleaseReady,
  buildSourcemapCommand,
  buildUpdateCommand,
  formatUpdateMessage,
  listUpdateGroups,
  main,
  nextReleaseNumber,
  parseArgs,
  parseUpdateGroupPage,
  readAppVersion,
} = require('../scripts/ota-publish.cjs');

const HEAD = 'fd053cfc0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const NOW = new Date('2026-11-05T09:11:02.000Z');
const config = { version: '1.5.0', runtimeVersion: { policy: 'appVersion' } };
const group = (runtimeVersion, message = '"Some update" (1 day ago by jimmckeown)', extra = {}) => ({
  branch: 'preview', message, runtimeVersion, isRollBackToEmbedded: false,
  group: `${runtimeVersion}-${Math.random().toString(16).slice(2)}`, platforms: 'android, ios', ...extra,
});
const page = (groups, name = 'preview') => JSON.stringify({ name, id: 'branch-id', currentPage: groups });
const channelView = (branchNames, name = 'preview') => JSON.stringify({ currentPage: {
  ...previewChannel.currentPage, name, updateBranches: branchNames.map(branch => ({ id: `${branch}-id`, name: branch, updateGroups: [] })),
} });
const isChannelView = (args) => args.includes('channel:view');
const isUpdateView = (args) => args.includes('update:view');
// Fake EAS: channel:view, update:list (one page) and update:view <group>, from the fixtures.
const fakeEas = ({ list = previewPage, views = viewFixtures } = {}) => jest.fn((command, args) => {
  if (isChannelView(args)) return JSON.stringify(previewChannel);
  if (isUpdateView(args)) {
    const groupId = args[args.indexOf('update:view') + 1];
    if (!views[groupId]) throw new Error(`Could not find any updates with group ID: "${groupId}"`);
    return JSON.stringify(views[groupId]);
  }
  return JSON.stringify(list);
});

// git exits 1 for "no" (`merge-base --is-ancestor`, `rev-parse --verify --quiet`) and 128 for an
// error such as an unknown commit; execFileSync puts the exit code on error.status.
const gitExit = (key, status) => Object.assign(new Error(`Command failed: git ${key}`), { status });
const MERGED_TREE = '7d3c1f0e9b8a7c6d5e4f30211a2b3c4d5e6f7a8b';
// A known commit that is not in HEAD's history gets the content check: merging it into HEAD
// (merge-tree) would change `missing`, beyond documentation. Real-git tests below cover how
// git itself answers; this fake only answers the commands.
const fakeGit = ({
  status = '', remoteBranches = '  origin/feat/app-release-card\n  origin/HEAD -> origin/main\n',
  head = HEAD, ancestors = [head], unrelated = [], shallow = false, missing = ['src/services/lifecycle/restore.js'],
} = {}) => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const key = args.join(' ');
    if (key === 'status --porcelain') return status;
    if (key === 'rev-parse HEAD') return head;
    if (key === 'branch -r --contains HEAD') return remoteBranches;
    if (key === 'rev-parse --is-shallow-repository') return `${shallow}\n`;
    const known = (commit) => ancestors.includes(commit) || unrelated.includes(commit);
    if (args.length === 4 && args.slice(0, 3).join(' ') === 'rev-parse --verify --quiet' && args[3].endsWith('^{commit}')) {
      const commit = args[3].slice(0, -'^{commit}'.length);
      if (known(commit)) return `${commit}\n`;
      throw gitExit(key, 1);
    }
    if (args.length === 4 && args[0] === 'merge-base' && args[1] === '--is-ancestor' && args[3] === head) {
      if (ancestors.includes(args[2])) return '';
      throw gitExit(key, known(args[2]) ? 1 : 128);
    }
    if (args[0] === 'rev-list' && args[1] === '--first-parent' && args[3] === head && unrelated.includes(args[4].slice(1))) return `${head}\n`;
    if (args[0] === 'merge-tree' && args[4] === head && unrelated.includes(args[5])) return `${MERGED_TREE}\n`;
    if (key === `diff-tree -r --name-only -z ${head} ${MERGED_TREE}`) return missing.map(file => `${file}\0`).join('');
    throw new Error(`unexpected git ${key}`);
  };
  return { git, calls };
};
const deps = (overrides = {}) => {
  const run = jest.fn();
  const runForOutput = fakeEas();
  const lines = [];
  return {
    run, runForOutput, lines, env: {},
    git: fakeGit().git, loadConfig: () => config, now: () => NOW, log: line => lines.push(line),
    ...overrides,
  };
};

describe('arguments', () => {
  test('a message is required; the channel defaults to preview; a dry run is the default', () => {
    expect(parseArgs(['--message', 'Release card'])).toEqual({ message: 'Release card', channel: 'preview', dryRun: true });
    expect(parseArgs(['--message=Release card', '--channel=production', '--dry-run']))
      .toEqual({ message: 'Release card', channel: 'production', dryRun: true });
    expect(parseArgs(['-m', '  Trimmed  ', '--channel', 'preview'])).toMatchObject({ message: 'Trimmed' });
  });

  test('only --publish publishes; --publish with --dry-run is refused', () => {
    expect(parseArgs(['--message', 'x', '--publish'])).toEqual({ message: 'x', channel: 'preview', dryRun: false });
    expect(() => parseArgs(['--message', 'x', '--publish', '--dry-run'])).toThrow(/--publish and --dry-run/);
    expect(() => parseArgs(['--message', '--publish'])).toThrow(/--message needs a description, not "--publish"/);
  });

  test.each([
    [[], /--message "describe what changed" is required/],
    [['--message'], /--message "describe what changed" is required/],
    [['--message', '   '], /--message "describe what changed" is required/],
    [['--message', 'two\nlines'], /one line/],
    [['--message', 'ok', '--channel'], /--channel needs a channel name/],
    [['--message', 'ok', '--channel', 'pre view'], /--channel needs a channel name/],
    [['--message', 'ok', '--force'], /Unknown argument: --force/],
    // A flag written where the message should be is never taken as the message.
    [['--message', '--dry-run'], /--message needs a description, not "--dry-run"/],
    [['-m', '--dry-run', '--channel', 'preview'], /--message needs a description, not "--dry-run"/],
    [['--message=--dry-run'], /--message needs a description, not "--dry-run"/],
    [['--message', 'ok', '--channel', '--dry-run'], /--channel needs a channel name/],
    // --allow-rollback takes a reason, which goes into the update message.
    [['--message', 'ok', '--allow-rollback'], /--allow-rollback needs a reason/],
    [['--message', 'ok', '--allow-rollback', '   '], /--allow-rollback needs a reason/],
    [['--message', 'ok', '--allow-rollback='], /--allow-rollback needs a reason/],
    [['--message', 'ok', '--allow-rollback', '--publish'], /--allow-rollback needs a reason, not "--publish"/],
    [['--message', 'ok', '--allow-rollback', 'two\nlines'], /--allow-rollback reason must be one line/],
  ])('refuses %p', (argv, error) => {
    expect(() => parseArgs(argv)).toThrow(error);
  });

  test('--allow-rollback takes a reason, trimmed; without it there is none', () => {
    expect(parseArgs(['--message', 'x', '--allow-rollback', '  lifecycle crash on launch  ']))
      .toEqual({ message: 'x', channel: 'preview', dryRun: true, allowRollback: 'lifecycle crash on launch' });
    expect(parseArgs(['--message', 'x', '--allow-rollback=back to main', '--publish']))
      .toEqual({ message: 'x', channel: 'preview', dryRun: false, allowRollback: 'back to main' });
    expect(parseArgs(['--message', 'x']).allowRollback).toBeUndefined();
  });
});

describe('flags npm takes for itself', () => {
  // npm 10 reads flags written before the `--` as its own settings and passes the script only what
  // follows it: `npm run ota:publish --dry-run -- --message x` runs the script with
  // ["--message", "x"] and npm_config_dry_run=true (probed with npm 10.8.2). Read as written, that
  // would be a real publish to every phone on the channel.
  test.each([
    ['npm run ota:publish --dry-run -- --message x', { npm_config_dry_run: 'true' }, '--dry-run'],
    ['npm run ota:publish --channel=production -- --message x', { npm_config_channel: 'production' }, '--channel'],
    ['npm run ota:publish --channel production -- --message x', { npm_config_channel: 'true' }, '--channel'],
    ['npm run ota:publish --message x', { npm_config_message: 'x' }, '--message'],
    ['npm run ota:publish -m x', { npm_config_message: 'x' }, '--message'],
    ['npm run ota:publish --publish -- --message x', { npm_config_publish: 'true' }, '--publish'],
    // Probed with npm 10.8.2: the script got ["why", "--message", "x"] and npm_config_allow_rollback=true.
    ['npm run ota:publish --allow-rollback why -- --message x', { npm_config_allow_rollback: 'true' }, '--allow-rollback'],
    ['npm run ota:publish --allow-rollback=why -- --message x', { npm_config_allow_rollback: 'why' }, '--allow-rollback'],
  ])('%s is refused before anything is checked, listed or published', (_typed, env, flag) => {
    const d = deps({ env });
    let error;
    try { main(['--message', 'x'], d); } catch (caught) { error = caught; }
    expect(error?.message).toContain(`npm took ${flag} for itself`);
    expect(error.message).toContain('npm run ota:publish -- --message "…"');
    expect(error.message).toContain('Nothing was published.');
    expect(d.runForOutput).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a misspelled flag npm takes for itself leaves the script on the safe side: a dry run', () => {
    const d = deps({ env: { npm_config_dryrun: 'true' } });
    expect(main(['--message', 'x'], d)).toMatchObject({ dryRun: true, releaseLabel: '1.5.0+2' });
    expect(d.run).not.toHaveBeenCalled();
  });

  test('npm settings that are unset or false do not block a publish', () => {
    const d = deps({ env: { npm_config_dry_run: 'false', npm_config_message: '', npm_config_loglevel: 'warn' } });
    expect(main(['--message', 'x', '--publish'], d)).toMatchObject({ dryRun: false, releaseLabel: '1.5.0+2' });
    expect(d.run).toHaveBeenCalledTimes(2);
  });
});

describe('app version', () => {
  test('reads the version, which is the runtime under the appVersion policy', () => {
    expect(readAppVersion(() => config)).toBe('1.5.0');
  });

  test.each([
    [{ version: '1.5.0', runtimeVersion: '1.5.0' }, /appVersion/],
    [{ version: '1.5.0', runtimeVersion: { policy: 'fingerprint' } }, /appVersion/],
    [{ runtimeVersion: { policy: 'appVersion' } }, /no version/],
  ])('refuses a config whose runtime is not its version: %p', (value, error) => {
    expect(() => readAppVersion(() => value)).toThrow(error);
  });
});

describe('release number', () => {
  test('counts the existing update groups for this runtime only: the live 1.5.0 update is the first, so the next is 2', () => {
    const groups = parseUpdateGroupPage(JSON.stringify(previewPage));
    expect(nextReleaseNumber({ groups, version: '1.5.0' })).toBe(2);
    expect(nextReleaseNumber({ groups, version: '1.4.0' })).toBe(3);
    expect(nextReleaseNumber({ groups, version: '1.3.0' })).toBe(2);
    expect(nextReleaseNumber({ groups, version: '1.6.0' })).toBe(1);
  });

  test('numbers already used on the branch stay used, so deleting an older update group cannot make one repeat', () => {
    const groups = [
      group('1.5.0', '"Lifecycle safety" (2 days ago by jimmckeown)'),
      group('1.5.0', '"OTA 1.5.0+5: Release card (abc1234)" (1 hour ago by jimmckeown)'),
      group('1.4.0', '"OTA 1.4.0+9: Older runtime (abc1234)" (9 days ago by jimmckeown)'),
    ];
    expect(nextReleaseNumber({ groups, version: '1.5.0' })).toBe(6);
    // Only this exact version's numbers count: not 1.5.01's, and the dots are not wildcards.
    expect(nextReleaseNumber({ groups: [group('1.5.0', '"OTA 1.5.01+9: x (a)"'), group('1.5.0', '"OTA 1x5x0+9: y (a)"')], version: '1.5.0' })).toBe(3);
  });

  test.each([
    ['not json', /did not return JSON/],
    [JSON.stringify({ name: 'preview' }), /no update groups list/],
    [JSON.stringify({ currentPage: [{ group: 'g' }] }), /without a runtime version/],
  ])('refuses a listing it cannot read: %p', (raw, error) => {
    expect(() => parseUpdateGroupPage(raw)).toThrow(error);
  });

  test('pages through the branch until a short page, with the pinned eas-cli and no prompts', () => {
    const first = Array.from({ length: 50 }, () => group('1.5.0'));
    const second = [group('1.5.0'), group('1.4.0'), group('1.5.0')];
    const runForOutput = jest.fn()
      .mockReturnValueOnce(page(first))
      .mockReturnValueOnce(page(second));
    const groups = listUpdateGroups({ branch: 'preview', runForOutput });
    expect(groups).toHaveLength(53);
    expect(nextReleaseNumber({ groups, version: '1.5.0' })).toBe(53);
    expect(runForOutput.mock.calls.map(([command, args]) => [command, args])).toEqual([0, 50].map(offset => ['npx', [
      '--yes', EAS_CLI, 'update:list', '--branch', 'preview', '--limit', '50', '--offset', String(offset),
      '--json', '--non-interactive',
    ]]));
  });

  test('a listing error stops the publish rather than guessing a number', () => {
    const runForOutput = jest.fn(() => { throw new Error('Could not find branch "preview"'); });
    expect(() => listUpdateGroups({ branch: 'preview', runForOutput }))
      .toThrow(/Could not list the updates on EAS branch preview.*Could not find branch/s);
  });

  test('a listing that never ends is refused', () => {
    const full = page(Array.from({ length: 50 }, () => group('1.5.0')));
    expect(() => listUpdateGroups({ branch: 'preview', runForOutput: () => full, maxPages: 3 })).toThrow(/more than 150/);
  });

  test('a page from another branch is refused', () => {
    expect(() => listUpdateGroups({ branch: 'preview', runForOutput: () => page([{ ...group('1.5.0'), branch: 'production' }]) }))
      .toThrow(/another branch/);
  });
});

describe('channel branch', () => {
  // `eas update --channel c` publishes to the branch channel c points at (eas-cli 26.0.0
  // getBranchFromChannelNameAndCreateAndLinkIfNotExistsAsync), but the number is counted on the
  // branch named c. They must be the same branch, or the number would be wrong or repeat.
  test('a channel that sends its updates to the branch of the same name is ready', () => {
    const runForOutput = jest.fn(() => JSON.stringify(previewChannel));
    expect(() => assertChannelBranch({ channel: 'preview', runForOutput })).not.toThrow();
    expect(runForOutput.mock.calls).toEqual([['npx', ['--yes', EAS_CLI, 'channel:view', 'preview', '--json', '--non-interactive']]]);
  });

  test.each([
    [['wave2-canary'], /Channel preview sends its updates to branch wave2-canary, not to branch preview/],
    [['preview', 'wave2-canary'], /Channel preview sends its updates to branches preview, wave2-canary, not to branch preview/],
    [[], /Channel preview sends its updates to no branch, not to branch preview/],
  ])('a channel pointed at %p is refused, since its number is counted on branch preview', (branches, error) => {
    expect(() => assertChannelBranch({ channel: 'preview', runForOutput: () => channelView(branches) })).toThrow(error);
  });

  test.each([
    ['not json', /did not return JSON/],
    [JSON.stringify({ currentPage: { name: 'preview' } }), /no branches list/],
    [JSON.stringify({ currentPage: { name: 'preview', updateBranches: [{ id: 'b' }] } }), /branch without a name/],
    [channelView(['production'], 'production'), /returned channel production/],
  ])('a channel listing it cannot read is refused: %p', (raw, error) => {
    expect(() => assertChannelBranch({ channel: 'preview', runForOutput: () => raw }))
      .toThrow(new RegExp(`Could not read channel preview[\\s\\S]*Nothing was published[\\s\\S]*${error.source}`));
  });

  test('a channel that EAS cannot find is refused, never created', () => {
    const runForOutput = () => { throw new Error('Could not find channel with the name preview'); };
    expect(() => assertChannelBranch({ channel: 'preview', runForOutput })).toThrow(/Could not read channel preview[\s\S]*Could not find channel/);
  });
});

describe('commands', () => {
  test('the update message names the release, what changed and the short commit', () => {
    expect(formatUpdateMessage({ version: '1.5.0', release: 2, message: 'Release card', commit: HEAD }))
      .toBe('OTA 1.5.0+2: Release card (fd053cf)');
  });

  test('a deliberate rollback carries its reason in the update message', () => {
    expect(formatUpdateMessage({ version: '1.5.0', release: 3, message: 'Back to main', commit: HEAD, rollbackReason: 'card crashes' }))
      .toBe('OTA 1.5.0+3: Back to main (rollback: card crashes) (fd053cf)');
  });

  test('the update and source-map commands are argument arrays on the pinned eas-cli', () => {
    expect(buildUpdateCommand({ channel: 'preview', message: 'OTA 1.5.0+2: "quoted" $(x) (fd053cf)' })).toEqual({
      command: 'npx',
      args: ['--yes', EAS_CLI, 'update', '--channel', 'preview', '--environment', 'preview', '--non-interactive',
        '--message', 'OTA 1.5.0+2: "quoted" $(x) (fd053cf)'],
    });
    expect(buildSourcemapCommand({ channel: 'preview' })).toEqual({
      command: 'npx', args: ['--yes', EAS_CLI, 'env:exec', 'preview', 'npm run sentry:sourcemaps', '--non-interactive'],
    });
    expect(EAS_CLI).toBe('eas-cli@26.0.0');
  });
});

describe('release readiness', () => {
  test('a clean tree whose HEAD is on an origin branch is ready; untracked node_modules and dist are ignored', () => {
    const { git } = fakeGit({ status: '?? node_modules\n?? dist/\n' });
    expect(assertReleaseReady({ git })).toBe(HEAD);
  });

  test('uncommitted or untracked work is refused, naming the files', () => {
    const { git } = fakeGit({ status: ' M src/screens/main/ProfileScreen.js\n?? assets/new.png\n?? node_modules\n' });
    expect(() => assertReleaseReady({ git })).toThrow(/uncommitted changes[\s\S]*ProfileScreen\.js[\s\S]*assets\/new\.png/);
    try { assertReleaseReady({ git }); } catch (error) { expect(error.message).not.toContain('node_modules'); }
  });

  test('a commit that is not on origin is refused', () => {
    expect(() => assertReleaseReady({ git: fakeGit({ remoteBranches: '' }).git })).toThrow(/not on any origin branch/);
    expect(() => assertReleaseReady({ git: fakeGit({ remoteBranches: '  upstream/main\n' }).git })).toThrow(/not on any origin branch/);
  });
});

describe('main', () => {
  test('publishes the next numbered release, then uploads its source maps', () => {
    const d = deps();
    const result = main(['--message', 'App release card', '--publish'], d);
    expect(result).toMatchObject({ release: 2, releaseLabel: '1.5.0+2', message: 'OTA 1.5.0+2: App release card (fd053cf)' });
    expect(d.run.mock.calls).toEqual([
      ['npx', buildUpdateCommand({ channel: 'preview', message: 'OTA 1.5.0+2: App release card (fd053cf)' }).args,
        { env: { MASI_OTA_RELEASE: '2', MASI_OTA_PUBLISHED_AT: '2026-11-05T09:11:02.000Z' } }],
      ['npx', buildSourcemapCommand({ channel: 'preview' }).args, {}],
    ]);
    expect(d.lines.join('\n')).toMatch(/Published 1\.5\.0\+2 on preview[\s\S]*Profile → App release/);
  });

  test('a dry run checks and counts, prints the number, message and both commands, and runs nothing', () => {
    const d = deps();
    const result = main(['--message', "Jim's card"], d);
    expect(result).toMatchObject({ release: 2, releaseLabel: '1.5.0+2', dryRun: true });
    expect(d.run).not.toHaveBeenCalled();
    expect(d.runForOutput.mock.calls.map(([, args]) => args[2])).toEqual(['channel:view', 'update:list', 'update:view']);
    const output = d.lines.join('\n');
    expect(output).toContain('Next release: 1.5.0+2');
    expect(output).toContain('Nothing was published. Add --publish to publish.');
    expect(output).toContain("OTA 1.5.0+2: Jim's card (fd053cf)");
    expect(output).toContain("MASI_OTA_RELEASE=2 MASI_OTA_PUBLISHED_AT=2026-11-05T09:11:02.000Z npx --yes eas-cli@26.0.0 update --channel preview --environment preview --non-interactive --message 'OTA 1.5.0+2: Jim'\\''s card (fd053cf)'");
    expect(output).toContain("npx --yes eas-cli@26.0.0 env:exec preview 'npm run sentry:sourcemaps' --non-interactive");
  });

  test.each([
    ['uncommitted work', { status: ' M app.config.js\n' }, /uncommitted changes/],
    ['a commit origin does not have', { remoteBranches: '' }, /not on any origin branch/],
  ])('a dry run makes the same checks as a publish: %s is refused before EAS is asked anything', (_case, gitState, error) => {
    const d = deps({ git: fakeGit(gitState).git });
    expect(() => main(['--message', 'x', '--dry-run'], d)).toThrow(error);
    expect(d.runForOutput).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a dirty tree is refused before EAS is asked anything', () => {
    const d = deps({ git: fakeGit({ status: ' M app.config.js\n' }).git });
    expect(() => main(['--message', 'x', '--publish'], d)).toThrow(/uncommitted changes/);
    expect(d.runForOutput).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a listing failure publishes nothing', () => {
    const d = deps({ runForOutput: jest.fn((command, args) => {
      if (isChannelView(args)) return JSON.stringify(previewChannel);
      throw new Error('network down');
    }) });
    expect(() => main(['--message', 'x', '--publish'], d)).toThrow(/Could not list the updates/);
    expect(d.run).not.toHaveBeenCalled();
  });

  test.each([false, true])('a channel pointed at another branch publishes nothing and counts nothing (dry run: %p)', (dryRun) => {
    const d = deps({ runForOutput: jest.fn((command, args) => (isChannelView(args) ? channelView(['wave2-canary']) : JSON.stringify(previewPage))) });
    expect(() => main(['--message', 'x', ...(dryRun ? [] : ['--publish'])], d)).toThrow(/sends its updates to branch wave2-canary/);
    expect(d.runForOutput).toHaveBeenCalledTimes(1);
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a failed update never uploads source maps', () => {
    const d = deps();
    d.run.mockImplementationOnce(() => { throw new Error('npx exited with code 1'); });
    expect(() => main(['--message', 'x', '--publish'], d)).toThrow(/npx exited with code 1/);
    expect(d.run).toHaveBeenCalledTimes(1);
  });

  test('a failed source-map upload after a published update says the update is out and how to finish', () => {
    const d = deps();
    d.run.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('sentry 401'); });
    expect(() => main(['--message', 'x', '--channel', 'preview', '--publish'], d))
      .toThrow(/1\.5\.0\+2 is published[\s\S]*source maps[\s\S]*npx --yes eas-cli@26\.0\.0 env:exec preview 'npm run sentry:sourcemaps' --non-interactive/);
  });
});

describe('the update phones run now', () => {
  // 2026-11-05: phones ran 1.5.0+2 (group 2ed208c1, from e9a4360d on feat/app-release-card). A bare
  // `eas update` from main (9f6b0f96), which did not contain e9a4360d, rolled every phone back for
  // 13 minutes. These are the real commits; the fake git knows which contains which.
  const MAIN_AT_165 = '9f6b0f961da83b642e65b5ee2efebf6f0fcbc630';
  const RELEASE_2 = 'e9a4360d47ce9d9b1c1c40ed3ffb8f0dfa2277db';
  const MERGE = 'b759128f71c3a174ccbf57376c8a1988f57934b7'; // main + feat/app-release-card (1.5.0+4)
  const GROUP_2 = '2ed208c1-1760-4c1d-b450-0844d4eeb7f0';
  const LIFECYCLE = '8addaae6-4f1c-4b0e-9d3a-2c7e5f6a1b90';
  const incident = (overrides = {}) => deps({
    git: fakeGit({ head: MAIN_AT_165, unrelated: [RELEASE_2] }).git,
    runForOutput: fakeEas({ list: pageAtRelease2 }),
    ...overrides,
  });
  const attempt = (argv, d) => {
    try { main(argv, d); } catch (error) { return error; }
    throw new Error('main did not refuse');
  };
  const viewCalls = d => d.runForOutput.mock.calls.filter(([, args]) => isUpdateView(args));

  test.each([false, true])('the #165 publish (main, without the code phones run) is refused before counting (dry run: %p)', (dryRun) => {
    const d = incident();
    const error = attempt(['--message', 'Draft content packs', ...(dryRun ? [] : ['--publish'])], d);
    expect(error.message).toContain(`phones on preview run update group ${GROUP_2} (release 1.5.0+2) from commit ${RELEASE_2}`);
    expect(error.message).toContain('this commit (9f6b0f9) does not contain it: it is not in its history, and merging it '
      + 'would change more than documentation (1 file: src/services/lifecycle/restore.js).');
    expect(error.message).toContain('Publishing would roll phones back to code without it.');
    expect(error.message).toContain(`Merge the branch that contains e9a4360 into this one (git branch -r --contains ${RELEASE_2} lists it)`);
    expect(error.message).toContain('To roll phones back on purpose, add --allow-rollback "why".');
    expect(error.message).toContain('Nothing was published.');
    expect(d.run).not.toHaveBeenCalled();
    expect(d.lines.join('\n')).not.toContain('Next release');
  });

  test('the update phones run is the newest group for this runtime, read with update:view on the pinned eas-cli', () => {
    const d = incident();
    attempt(['--message', 'x'], d);
    expect(viewCalls(d)).toEqual([['npx', ['--yes', EAS_CLI, 'update:view', GROUP_2, '--json']]]);
  });

  test('a commit that contains the code phones run is counted and published; the dry run says what phones run and that the check passed', () => {
    const git = fakeGit({ head: MERGE, ancestors: [MERGE, RELEASE_2, MAIN_AT_165] });
    const d = incident({ git: git.git });
    expect(main(['--message', 'Restore the lifecycle update'], d)).toMatchObject({ releaseLabel: '1.5.0+3', dryRun: true });
    const output = d.lines.join('\n');
    expect(output).toContain(`Phones on preview (runtime 1.5.0) run update group ${GROUP_2} (release 1.5.0+2), commit ${RELEASE_2}.`);
    // History, not content: a later revert of e9a4360 would still pass, so the line claims only
    // what git checked.
    expect(output).toContain('Check passed: this commit (b759128) has commit e9a4360 in its history.');
    expect(output).not.toContain('keeps the code');
    expect(output.indexOf('Check passed')).toBeLessThan(output.indexOf('Next release: 1.5.0+3'));
    expect(git.calls).toEqual(expect.arrayContaining([
      ['rev-parse', '--verify', '--quiet', `${RELEASE_2}^{commit}`],
      ['merge-base', '--is-ancestor', RELEASE_2, MERGE],
    ]));

    const published = incident({ git: git.git });
    expect(main(['--message', 'Restore the lifecycle update', '--publish'], published))
      .toMatchObject({ releaseLabel: '1.5.0+3', message: 'OTA 1.5.0+3: Restore the lifecycle update (b759128)' });
    expect(published.run).toHaveBeenCalledTimes(2);
    expect(published.lines.join('\n')).toContain('Check passed: this commit (b759128) has commit e9a4360 in its history.');
  });

  test('republishing the commit phones already run counts as containing it', () => {
    const d = deps();
    expect(main(['--message', 'Same code again'], d)).toMatchObject({ releaseLabel: '1.5.0+2' });
    const output = d.lines.join('\n');
    expect(output).toContain(`Phones on preview (runtime 1.5.0) run update group ${LIFECYCLE} (not numbered), commit ${HEAD}.`);
    expect(output).toContain('Check passed: this commit (fd053cf) is the commit phones run.');
  });

  test('the newest group for this runtime is the one phones run, even when a newer group serves another runtime', () => {
    const list = { ...pageAtRelease2, currentPage: [group('1.4.0', '"OTA 1.4.0+3: Old phones (abc1234)" (1 minute ago by jimmckeown)'), ...pageAtRelease2.currentPage] };
    const d = incident({ runForOutput: fakeEas({ list }) });
    expect(attempt(['--message', 'x'], d).message).toContain(`update group ${GROUP_2} (release 1.5.0+2)`);
    expect(viewCalls(d).map(([, args]) => args[3])).toEqual([GROUP_2]);
  });

  test('the refusal names what merging would change, src/ first, at most three files', () => {
    const missing = ['scripts/x.cjs', '__tests__/a.test.js', 'src/b.js', 'App.js', 'src/a.js'];
    const d = incident({ git: fakeGit({ head: MAIN_AT_165, unrelated: [RELEASE_2], missing }).git });
    expect(attempt(['--message', 'x'], d).message)
      .toContain('merging it would change more than documentation (5 files: src/a.js, src/b.js, App.js and 2 more).');
  });

  test('a commit this repository does not have is refused: fetch first', () => {
    const d = incident({ git: fakeGit({ head: MAIN_AT_165 }).git });
    const error = attempt(['--message', 'x', '--publish'], d);
    expect(error.message).toContain(`from commit ${RELEASE_2}, which this repository does not have`);
    expect(error.message).toContain('Run git fetch origin, then publish again.');
    expect(error.message).toContain('Nothing was published.');
    expect(d.run).not.toHaveBeenCalled();
  });

  test('--allow-rollback publishes a deliberate rollback, prints the reason and records it in the update message', () => {
    const d = incident();
    const result = main(['--message', 'Back to main', '--allow-rollback', 'the card crashes on launch', '--publish'], d);
    expect(result).toMatchObject({ releaseLabel: '1.5.0+3', message: 'OTA 1.5.0+3: Back to main (rollback: the card crashes on launch) (9f6b0f9)' });
    expect(d.run.mock.calls[0][1]).toEqual(buildUpdateCommand({ channel: 'preview', message: result.message }).args);
    expect(d.lines.join('\n')).toContain('Rollback allowed (--allow-rollback): the card crashes on launch. '
      + 'This commit (9f6b0f9) does not contain e9a4360, so phones go back to code without it.');
  });

  test('--allow-rollback also lets through a commit this repository does not have, saying so', () => {
    const d = incident({ git: fakeGit({ head: MAIN_AT_165 }).git });
    expect(main(['--message', 'Back', '--allow-rollback', 'gone from origin'], d)).toMatchObject({
      message: 'OTA 1.5.0+3: Back (rollback: gone from origin) (9f6b0f9)', dryRun: true,
    });
    expect(d.lines.join('\n')).toContain('Rollback allowed (--allow-rollback): gone from origin. '
      + 'This repository does not have e9a4360, so phones may go back to code without it.');
  });

  test('--allow-rollback on a publish that does not roll phones back is refused, so no update is labelled a rollback by mistake', () => {
    const d = deps();
    const error = attempt(['--message', 'x', '--allow-rollback', 'just in case', '--publish'], d);
    expect(error.message).toContain('--allow-rollback is only for a publish that rolls phones back, and this one does not: '
      + 'this commit (fd053cf) is the commit phones run.');
    expect(error.message).toContain('Nothing was published.');
    expect(d.run).not.toHaveBeenCalled();
  });

  test('phones rolled back to their built-in bundle: no commit to contain, a note says so, and no group is read', () => {
    const rolledBack = {
      ...pageAtRelease2.currentPage[0], group: '5b1f0c2e-7a3d-4e6f-9b8a-1c2d3e4f5a6b', isRollBackToEmbedded: true,
      message: '"Back to the built-in bundle" (2 minutes ago by jimmckeown)',
    };
    const d = incident({ runForOutput: fakeEas({ list: { ...pageAtRelease2, currentPage: [rolledBack, ...pageAtRelease2.currentPage] } }) });
    expect(main(['--message', 'x', '--publish'], d)).toMatchObject({ releaseLabel: '1.5.0+4' });
    const output = d.lines.join('\n');
    expect(output).toContain('Phones on preview (runtime 1.5.0) run their built-in bundle: update group 5b1f0c2e-7a3d-4e6f-9b8a-1c2d3e4f5a6b (not numbered) rolled them back to it.');
    expect(output).toContain('Note: phones run their built-in bundle, so there is no update commit this publish must contain.');
    expect(viewCalls(d)).toEqual([]);
    expect(d.run).toHaveBeenCalledTimes(2);
  });

  test('phones on an update that records no commit (published before commits were recorded): a note says so', () => {
    const views = { [GROUP_2]: viewFixtures[GROUP_2].map(({ gitCommitHash, ...update }) => update) };
    const d = incident({ runForOutput: fakeEas({ list: pageAtRelease2, views }) });
    expect(main(['--message', 'x', '--publish'], d)).toMatchObject({ releaseLabel: '1.5.0+3' });
    const output = d.lines.join('\n');
    expect(output).toContain(`Phones on preview (runtime 1.5.0) run update group ${GROUP_2} (release 1.5.0+2), no commit recorded.`);
    expect(output).toContain(`Note: update group ${GROUP_2} records no commit (published before commits were recorded), `
      + 'so there is no commit this publish must contain.');
  });

  test('no update for this runtime yet (a new app version): phones run their built-in bundle; a note says so', () => {
    const d = deps({ loadConfig: () => ({ ...config, version: '1.6.0' }) });
    expect(main(['--message', 'x'], d)).toMatchObject({ releaseLabel: '1.6.0+1' });
    const output = d.lines.join('\n');
    expect(output).toContain('Phones on preview (runtime 1.6.0) run their built-in bundle: branch preview has no update for this runtime yet.');
    expect(output).toContain('Note: phones run their built-in bundle, so there is no update commit this publish must contain.');
    expect(viewCalls(d)).toEqual([]);
  });

  const view = viewFixtures[GROUP_2];
  test.each([
    ['EAS fails', () => { throw new Error('network down'); }, /network down/],
    ['not JSON', () => 'nope', /update:view did not return JSON/],
    ['no updates', () => '[]', /update:view returned no updates/],
    ['another group', () => JSON.stringify(view.map(update => ({ ...update, group: LIFECYCLE }))), /update:view returned updates from another group/],
    ['two commits', () => JSON.stringify([view[0], { ...view[1], gitCommitHash: MAIN_AT_165 }]), /different commits/],
    ['a commit that is not a hash', () => JSON.stringify(view.map(update => ({ ...update, gitCommitHash: '--output=x' }))), /not a git commit hash/],
  ])('an update group it cannot read is refused: %s', (_case, viewOutput, error) => {
    const eas = fakeEas({ list: pageAtRelease2 });
    const runForOutput = jest.fn((command, args) => (isUpdateView(args) ? viewOutput() : eas(command, args)));
    const d = incident({ git: fakeGit({ head: MERGE, ancestors: [MERGE, RELEASE_2] }).git, runForOutput });
    expect(() => main(['--message', 'x', '--publish'], d))
      .toThrow(new RegExp(`Could not read update group ${GROUP_2}, so the code phones run is unknown\\. Nothing was published\\.[\\s\\S]*${error.source}`));
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a newest group without a usable id is refused, never passed to update:view', () => {
    const list = { ...pageAtRelease2, currentPage: [{ ...pageAtRelease2.currentPage[0], group: '--json' }] };
    const d = incident({ runForOutput: fakeEas({ list }) });
    expect(() => main(['--message', 'x'], d)).toThrow(/update group without a usable id[\s\S]*Nothing was published/);
    expect(viewCalls(d)).toEqual([]);
  });

  // EAS serves each platform the newest update for its runtime that has that platform; eas-cli
  // reads it so (limit 1, offset 0, with a platform filter:
  // selectRuntimeAndGetLatestUpdateGroupForEachPublishPlatformOnBranchAsync in build/update/queries.js).
  // update:list's `platforms` is the group's platforms sorted and joined with ", "
  // (formatPlatformForUpdateGroup, build/update/utils.js), so a group published with
  // `--platform android` lists "android". The script publishes both platforms, so both are checked.
  const ANDROID_ONLY = '7a7a7a7a-1111-4222-8333-944444444444';
  const androidOnly = (extra = {}) => ({
    ...pageAtRelease2.currentPage[0], group: ANDROID_ONLY, platforms: 'android',
    message: '"Android hotfix" (5 minutes ago by jimmckeown)', ...extra,
  });
  const { gitCommitHash: _release2Commit, ...androidUpdateOf2 } = viewFixtures[GROUP_2].find(update => update.platform === 'android');
  const androidOnlyView = commit => [{
    ...androidUpdateOf2, id: '01a1ad00-0000-7000-8000-000000000001', group: ANDROID_ONLY, message: 'Android hotfix',
    ...(commit ? { gitCommitHash: commit } : {}),
  }];
  const withNewest = (newest, views = {}) => fakeEas({
    list: { ...pageAtRelease2, currentPage: [newest, ...pageAtRelease2.currentPage] }, views: { ...viewFixtures, ...views },
  });

  test.each([
    ['an Android update from a commit this one contains', androidOnly(), { [ANDROID_ONLY]: androidOnlyView(MAIN_AT_165) }],
    ['an Android roll back to the built-in bundle', androidOnly({ isRollBackToEmbedded: true }), {}],
    ['an Android update that records no commit', androidOnly(), { [ANDROID_ONLY]: androidOnlyView() }],
  ])('a newer one-platform group does not hide the other platform: with %s newest, iOS phones still run 1.5.0+2, so the publish is refused', (_case, newest, views) => {
    const d = incident({ runForOutput: withNewest(newest, views) });
    const error = attempt(['--message', 'Draft content packs', '--publish'], d);
    expect(error.message).toContain(`Refusing to publish: iOS phones on preview run update group ${GROUP_2} (release 1.5.0+2) from commit ${RELEASE_2}`);
    expect(error.message).toContain('this commit (9f6b0f9) does not contain it');
    expect(error.message).not.toContain('Android phones');
    expect(error.message).toContain('Nothing was published.');
    expect(d.run).not.toHaveBeenCalled();
  });

  test('when the platforms run different groups, the dry run says what each runs and checks each', () => {
    const git = fakeGit({ head: MERGE, ancestors: [MERGE, RELEASE_2, MAIN_AT_165] });
    const d = incident({ git: git.git, runForOutput: withNewest(androidOnly(), { [ANDROID_ONLY]: androidOnlyView(MAIN_AT_165) }) });
    expect(main(['--message', 'x'], d)).toMatchObject({ releaseLabel: '1.5.0+4', dryRun: true });
    const output = d.lines.join('\n');
    expect(output).toContain(`Android phones on preview (runtime 1.5.0) run update group ${ANDROID_ONLY} (not numbered), commit ${MAIN_AT_165}.`);
    expect(output).toContain(`iOS phones on preview (runtime 1.5.0) run update group ${GROUP_2} (release 1.5.0+2), commit ${RELEASE_2}.`);
    expect(output).toContain('Check passed: this commit (b759128) has commit 9f6b0f9 in its history.');
    expect(output).toContain('Check passed: this commit (b759128) has commit e9a4360 in its history.');
    expect(viewCalls(d).map(([, args]) => args[3])).toEqual([ANDROID_ONLY, GROUP_2]);
  });

  test('--allow-rollback when only one platform rolls back: that platform gets the rollback line, the other its check', () => {
    const d = incident({ runForOutput: withNewest(androidOnly(), { [ANDROID_ONLY]: androidOnlyView(MAIN_AT_165) }) });
    expect(main(['--message', 'Back', '--allow-rollback', 'iOS card crash', '--publish'], d))
      .toMatchObject({ message: 'OTA 1.5.0+4: Back (rollback: iOS card crash) (9f6b0f9)' });
    const output = d.lines.join('\n');
    expect(output).toContain('Check passed: this commit (9f6b0f9) is the commit Android phones run.');
    expect(output).toContain('Rollback allowed (--allow-rollback): iOS card crash. '
      + 'This commit (9f6b0f9) does not contain e9a4360, so iOS phones go back to code without it.');
    expect(d.run).toHaveBeenCalledTimes(2);
  });

  test('a platform with no update for this runtime runs its built-in bundle; a note says so', () => {
    const list = { ...pageAtRelease2, currentPage: [androidOnly(), ...pageAtRelease2.currentPage.filter(g => g.runtimeVersion !== '1.5.0')] };
    const d = incident({ runForOutput: fakeEas({ list, views: { [ANDROID_ONLY]: androidOnlyView(MAIN_AT_165) } }) });
    expect(main(['--message', 'x'], d)).toMatchObject({ releaseLabel: '1.5.0+2' });
    const output = d.lines.join('\n');
    expect(output).toContain('iOS phones on preview (runtime 1.5.0) run their built-in bundle: branch preview has no iOS update for this runtime yet.');
    expect(output).toContain('Note: iOS phones run their built-in bundle, so there is no update commit this publish must contain.');
    expect(output).toContain('Check passed: this commit (9f6b0f9) is the commit Android phones run.');
  });

  test.each([[undefined], ['N/A'], ['android,ios'], [7]])('a group whose platforms cannot be read is refused: %p', (platforms) => {
    const list = { ...pageAtRelease2, currentPage: [{ ...pageAtRelease2.currentPage[0], platforms }, ...pageAtRelease2.currentPage.slice(1)] };
    const d = incident({ runForOutput: fakeEas({ list }) });
    expect(() => main(['--message', 'x'], d))
      .toThrow(new RegExp(`update group ${GROUP_2} with platforms .*, so which phones run it is unknown\\. Nothing was published\\.`));
    expect(viewCalls(d)).toEqual([]);
  });

  test.each([false, true])('a shallow clone cannot tell whether it has the commit, so it is refused with --unshallow (--allow-rollback: %p)', (allow) => {
    const d = incident({ git: fakeGit({ head: MAIN_AT_165, unrelated: [RELEASE_2], shallow: true }).git });
    const error = attempt(['--message', 'x', ...(allow ? ['--allow-rollback', 'why'] : [])], d);
    expect(error.message).toContain(`Refusing to publish: phones on preview run update group ${GROUP_2} (release 1.5.0+2) from commit ${RELEASE_2}, `
      + 'and this clone is shallow (part of its history is missing), so the script cannot tell whether this commit (9f6b0f9) contains it. '
      + 'Run git fetch --unshallow, then publish again.');
    expect(error.message).not.toContain('Publishing would roll phones back');
    expect(error.message).not.toContain('git fetch origin');
    expect(d.lines.join('\n')).not.toContain('Next release');
  });

  test('a shallow clone that has the commit in its history passes', () => {
    const d = incident({ git: fakeGit({ head: MERGE, ancestors: [MERGE, RELEASE_2], shallow: true }).git });
    expect(main(['--message', 'x'], d)).toMatchObject({ releaseLabel: '1.5.0+3' });
    expect(d.lines.join('\n')).toContain('Check passed: this commit (b759128) has commit e9a4360 in its history.');
  });
});

describe('the content check, with real git', () => {
  // Through main() against real repositories (a bare origin and clones in a temp directory), since
  // what matters is how git answers: a squash merge (Masi squash-merges PRs, so a merged branch tip
  // is never in main's history), a build-log union conflict, later work on the same lines, a revert,
  // a shallow clone. EAS is faked as above, with phones running commit C, the feature branch tip.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  });
  const gitIn = cwd => args => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  const short = commit => commit.slice(0, 7);
  let root;
  beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-publish-git-')); });
  afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

  // base: src/app.js and documentation/build-log.md on main. feat's tip C adds the lifecycle line
  // phones run, and a build-log entry; main then gets its own build-log entry.
  const repoWithFeature = (name) => {
    const origin = path.join(root, `${name}-origin.git`);
    const dir = path.join(root, name);
    gitIn(root)(['init', '-q', '--bare', '-b', 'main', origin]);
    gitIn(root)(['init', '-q', '-b', 'main', dir]);
    const git = gitIn(dir);
    git(['remote', 'add', 'origin', origin]);
    const commit = (files, message) => {
      for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
      }
      git(['add', '-A']);
      git(['commit', '-q', '-m', message]);
      return git(['rev-parse', 'HEAD']).trim();
    };
    commit({ 'src/app.js': 'base\n', 'documentation/build-log.md': 'log\n' }, 'Base');
    git(['checkout', '-q', '-b', 'feat']);
    const feature = commit({ 'src/app.js': 'base\nlifecycle\n', 'documentation/build-log.md': 'log\nfeat entry\n' }, 'Lifecycle');
    git(['checkout', '-q', 'main']);
    commit({ 'documentation/build-log.md': 'log\nmain entry\n' }, 'Main build log');
    const head = () => git(['rev-parse', 'HEAD']).trim();
    return { origin, git, commit, feature, head, push: () => git(['push', '-q', 'origin', 'main', 'feat']) };
  };
  // Phones run update group 2ed208c1 (1.5.0+2), published from `commit`.
  const GROUP_2_ID = '2ed208c1-1760-4c1d-b450-0844d4eeb7f0';
  const phonesRun = commit => fakeEas({
    list: pageAtRelease2, views: { ...viewFixtures, [GROUP_2_ID]: viewFixtures[GROUP_2_ID].map(update => ({ ...update, gitCommitHash: commit })) },
  });
  const dryRun = (git, commit) => {
    const d = deps({ git, runForOutput: phonesRun(commit) });
    let error;
    try { main(['--message', 'x'], d); } catch (caught) { error = caught; }
    return { output: d.lines.join('\n'), error };
  };

  test('a squash merge: main has the branch\'s code under another commit, so publishing from main passes', () => {
    const repo = repoWithFeature('squash');
    // GitHub's squash merge: the branch's changes as one new commit on main, the build log unioned.
    const squash = repo.commit({ 'src/app.js': 'base\nlifecycle\n', 'documentation/build-log.md': 'log\nmain entry\nfeat entry\n' }, 'Lifecycle (#167)');
    repo.push();
    expect(() => repo.git(['merge-base', '--is-ancestor', repo.feature, squash])).toThrow();
    const { output, error } = dryRun(repo.git, repo.feature);
    expect(error).toBeUndefined();
    expect(output).toContain(`Check passed: commit ${short(repo.feature)} is not in this commit's (${short(squash)}) history, but this `
      + 'commit already has its changes (a squash merge, for example): merging it would change only documentation.');
    expect(output).toContain('Next release: 1.5.0+3');
  });

  test('a squash merge followed by later work on the same lines still passes: an earlier commit on this line had the code', () => {
    const repo = repoWithFeature('squash-later');
    const squash = repo.commit({ 'src/app.js': 'base\nlifecycle\n', 'documentation/build-log.md': 'log\nmain entry\nfeat entry\n' }, 'Lifecycle (#167)');
    const later = repo.commit({ 'src/app.js': 'base\nlifecycle, later\n' }, 'Later work on the lifecycle line');
    repo.push();
    const { output, error } = dryRun(repo.git, repo.feature);
    expect(error).toBeUndefined();
    expect(output).toContain(`Check passed: commit ${short(repo.feature)} is not in this commit's (${short(later)}) history, but commit `
      + `${short(squash)} before it already had its changes (a squash merge, for example).`);
  });

  test('main without the branch\'s code (the #165 publish) is refused, naming what it lacks', () => {
    const repo = repoWithFeature('behind');
    repo.push();
    const { error } = dryRun(repo.git, repo.feature);
    expect(error?.message).toContain(`Refusing to publish: phones on preview run update group ${GROUP_2_ID} (release 1.5.0+2) from commit ${repo.feature}, `
      + `and this commit (${short(repo.head())}) does not contain it: it is not in its history, and merging it would change more `
      + 'than documentation (1 file: src/app.js).');
    expect(error.message).toContain('Publishing would roll phones back to code without it.');
  });

  test('a revert in this commit\'s history passes, since reverting is deliberate; the line says only that the commit is in the history', () => {
    const repo = repoWithFeature('revert');
    repo.git(['merge', '-q', '--no-ff', '-X', 'ours', '-m', 'Merge feat', 'feat']);
    repo.git(['revert', '--no-edit', '-m', '1', 'HEAD']);
    repo.push();
    expect(repo.git(['show', 'HEAD:src/app.js'])).toBe('base\n');
    const { output, error } = dryRun(repo.git, repo.feature);
    expect(error).toBeUndefined();
    expect(output).toContain(`Check passed: this commit (${short(repo.head())}) has commit ${short(repo.feature)} in its history.`);
    expect(output).not.toContain('keeps the code');
  });

  test('a shallow clone is refused with --unshallow, whether or not it has fetched the commit, and passes once unshallowed', () => {
    const repo = repoWithFeature('shallow');
    repo.git(['merge', '-q', '--no-ff', '-X', 'ours', '-m', 'Merge feat', 'feat']);
    repo.push();
    const clone = path.join(root, 'shallow-clone');
    gitIn(root)(['clone', '-q', '--depth', '1', '--branch', 'main', `file://${repo.origin}`, clone]);
    const git = gitIn(clone);
    const refusal = 'this clone is shallow (part of its history is missing), so the script cannot tell whether this commit '
      + `(${short(repo.head())}) contains it. Run git fetch --unshallow, then publish again.`;
    expect(dryRun(git, repo.feature).error?.message).toContain(refusal);
    git(['fetch', '-q', '--depth', '1', 'origin', 'feat']);
    expect(dryRun(git, repo.feature).error?.message).toContain(refusal);
    git(['fetch', '-q', '--unshallow']);
    const { output, error } = dryRun(git, repo.feature);
    expect(error).toBeUndefined();
    expect(output).toContain(`Check passed: this commit (${short(repo.head())}) has commit ${short(repo.feature)} in its history.`);
  });
});
