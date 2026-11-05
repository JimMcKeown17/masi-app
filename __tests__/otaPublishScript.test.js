global.__MASI_NO_DEFAULT_HANDLE__ = true;
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

const fakeGit = ({ status = '', remoteBranches = '  origin/feat/app-release-card\n  origin/HEAD -> origin/main\n' } = {}) => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const key = args.join(' ');
    if (key === 'status --porcelain') return status;
    if (key === 'rev-parse HEAD') return HEAD;
    if (key === 'branch -r --contains HEAD') return remoteBranches;
    throw new Error(`unexpected git ${key}`);
  };
  return { git, calls };
};
const deps = (overrides = {}) => {
  const run = jest.fn();
  const runForOutput = jest.fn((command, args) => JSON.stringify(isChannelView(args) ? previewChannel : previewPage));
  const lines = [];
  return {
    run, runForOutput, lines, env: {},
    git: fakeGit().git, loadConfig: () => config, now: () => NOW, log: line => lines.push(line),
    ...overrides,
  };
};

describe('arguments', () => {
  test('a message is required; the channel defaults to preview', () => {
    expect(parseArgs(['--message', 'Release card'])).toEqual({ message: 'Release card', channel: 'preview', dryRun: false });
    expect(parseArgs(['--message=Release card', '--channel=production', '--dry-run']))
      .toEqual({ message: 'Release card', channel: 'production', dryRun: true });
    expect(parseArgs(['-m', '  Trimmed  ', '--channel', 'preview'])).toMatchObject({ message: 'Trimmed' });
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
  ])('refuses %p', (argv, error) => {
    expect(() => parseArgs(argv)).toThrow(error);
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

  test('npm settings that are unset or false do not block a publish', () => {
    const d = deps({ env: { npm_config_dry_run: 'false', npm_config_message: '', npm_config_loglevel: 'warn' } });
    expect(main(['--message', 'x'], d)).toMatchObject({ dryRun: false, releaseLabel: '1.5.0+2' });
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

  test('a deleted update group cannot make a number repeat: numbers already published stay used', () => {
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
    const result = main(['--message', 'App release card'], d);
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
    const result = main(['--message', "Jim's card", '--dry-run'], d);
    expect(result).toMatchObject({ release: 2, releaseLabel: '1.5.0+2', dryRun: true });
    expect(d.run).not.toHaveBeenCalled();
    expect(d.runForOutput.mock.calls.map(([, args]) => args[2])).toEqual(['channel:view', 'update:list']);
    const output = d.lines.join('\n');
    expect(output).toContain('Next release: 1.5.0+2');
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
    expect(() => main(['--message', 'x'], d)).toThrow(/uncommitted changes/);
    expect(d.runForOutput).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a listing failure publishes nothing', () => {
    const d = deps({ runForOutput: jest.fn((command, args) => {
      if (isChannelView(args)) return JSON.stringify(previewChannel);
      throw new Error('network down');
    }) });
    expect(() => main(['--message', 'x'], d)).toThrow(/Could not list the updates/);
    expect(d.run).not.toHaveBeenCalled();
  });

  test.each([false, true])('a channel pointed at another branch publishes nothing and counts nothing (dry run: %p)', (dryRun) => {
    const d = deps({ runForOutput: jest.fn((command, args) => (isChannelView(args) ? channelView(['wave2-canary']) : JSON.stringify(previewPage))) });
    expect(() => main(['--message', 'x', ...(dryRun ? ['--dry-run'] : [])], d)).toThrow(/sends its updates to branch wave2-canary/);
    expect(d.runForOutput).toHaveBeenCalledTimes(1);
    expect(d.run).not.toHaveBeenCalled();
  });

  test('a failed update never uploads source maps', () => {
    const d = deps();
    d.run.mockImplementationOnce(() => { throw new Error('npx exited with code 1'); });
    expect(() => main(['--message', 'x'], d)).toThrow(/npx exited with code 1/);
    expect(d.run).toHaveBeenCalledTimes(1);
  });

  test('a failed source-map upload after a published update says the update is out and how to finish', () => {
    const d = deps();
    d.run.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('sentry 401'); });
    expect(() => main(['--message', 'x', '--channel', 'preview'], d))
      .toThrow(/1\.5\.0\+2 is published[\s\S]*source maps[\s\S]*npx --yes eas-cli@26\.0\.0 env:exec preview 'npm run sentry:sourcemaps' --non-interactive/);
  });
});
