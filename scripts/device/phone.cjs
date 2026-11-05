#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ui = require('./lib/uiautomator.cjs');
const ROOT = path.resolve(__dirname, '../..');
const HELP = `device:phone <command> [options]
  start-run <label> | state [--json] | normalize [--apply] | launch
  shot [name] | dump [--all] [--json] | fields | find <q> [--exact]
  tap <q> [--exact] [--nth N] | tapxy <x> <y> | wait <q> [--timeout S=20] [--gone]
  type <text> | type --stdin | clear [n=40] | key <name|code> | hide-keyboard
  scroll <up|down> [--small] | scroll-to <q> [--direction down|up] [--max N=8]
  swipe <x1> <y1> <x2> <y2> [ms=300]
Options: --package ID, --run-dir DIR, --any-app, --no-settle, --exact
Environment: ADB, ANDROID_HOME, ANDROID_SERIAL, DEVICE_PACKAGE, DEVICE_RUN_DIR, DEVICE_RUNS_ROOT
Files go to --run-dir, else DEVICE_RUN_DIR, else device-runs/CURRENT (set by start-run).
Exit: 0 ok; 1 usage/adb; 2 not found/timeout/dump failed; 3 wrong foreground.
Focused text fields can make dumps slow; map fields before focusing, then use tapxy.
Run artifacts (including screenshots) are private local evidence in device-runs/.`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const execute = (binary, args, timeout = 15000) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const chunks = [];
  let length = 0;
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    child.kill('SIGKILL');
  }, timeout);
  child.stdout.on('data', b => {
    length += b.length;
    if (length > 32 * 1024 * 1024) {
      expired = true;
      child.kill('SIGKILL');
    } else {
      chunks.push(b);
    }
  });
  child.stderr.resume();
  child.on('error', () => {
    clearTimeout(timer);
    reject(ui.fail('ADB_ERROR Cannot execute adb', 1));
  });
  child.on('close', code => {
    clearTimeout(timer);
    if (expired || code !== 0) {
      reject(ui.fail('ADB_ERROR adb failed or timed out', 1));
    } else {
      resolve(Buffer.concat(chunks));
    }
  });
});

const SPECS = {
  'start-run': [1, 1, []],
  state: [0, 0, ['json']],
  normalize: [0, 0, ['apply']],
  launch: [0, 0, []],
  shot: [0, 1, []],
  dump: [0, 0, ['all', 'json']],
  fields: [0, 0, []],
  find: [1, 1, ['exact']],
  tap: [1, 1, ['exact', 'nth', 'no-settle']],
  tapxy: [2, 2, ['no-settle']],
  wait: [1, 1, ['exact', 'timeout', 'gone']],
  type: [0, 1, ['stdin']],
  clear: [0, 1, []],
  key: [1, 1, ['no-settle']],
  'hide-keyboard': [0, 0, ['no-settle']],
  scroll: [1, 1, ['small', 'no-settle']],
  'scroll-to': [1, 1, ['exact', 'direction', 'max', 'no-settle']],
  swipe: [4, 5, []]
};

function validateCommandArgs(command, args, options, spec) {
  if (args.length < spec[0] || args.length > spec[1]) {
    throw ui.fail('USAGE Wrong number of arguments', 1);
  }
  for (const key of ['nth', 'timeout', 'max']) {
    if (options[key] !== undefined && (!/^\d+$/.test(options[key]) || +options[key] > 3600)) {
      throw ui.fail('USAGE Invalid numeric option', 1);
    } else if (options[key] !== undefined) {
      options[key] = +options[key];
    }
  }
  if (command === 'type' && Boolean(options.stdin) === Boolean(args.length)) {
    throw ui.fail('USAGE type needs text or --stdin', 1);
  }
  const direction = command === 'scroll' ? args[0] : options.direction || 'down';
  if (['scroll', 'scroll-to'].includes(command) && !['up', 'down'].includes(direction)) {
    throw ui.fail('USAGE Expected up or down', 1);
  }
  const coordinateLimit = command === 'clear' ? 10000 : 100000;
  const invalidCoordinate = n => !/^\d+$/.test(n) || +n > coordinateLimit;
  if (['tapxy', 'swipe', 'clear'].includes(command) && args.some(invalidCoordinate)) {
    throw ui.fail('USAGE Invalid coordinates/count', 1);
  }
  if (command === 'key' && !/^\d+$/.test(args[0]) && !['back', 'home', 'enter', 'del', 'end', 'tab', 'escape'].includes(args[0])) {
    throw ui.fail('USAGE Unknown key', 1);
  }
}

const parseArgs = argv => {
  if (argv.includes('--help')) {
    return {
      help: true
    };
  }
  const command = argv[0];
  const spec = SPECS[command];
  if (!spec) {
    throw ui.fail('USAGE Unknown command; use --help', 1);
  }
  const options = {};
  const args = [];
  for (let i = 1; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args.push(item);
      continue;
    }
    const key = item.slice(2);
    if (![...spec[2], 'package', 'run-dir', 'any-app'].includes(key) || Object.hasOwn(options, key)) {
      throw ui.fail('USAGE Unknown or duplicate option', 1);
    }
    options[key] = ['package', 'run-dir', 'nth', 'timeout', 'direction', 'max'].includes(key) ? argv[++i] : true;
    if (options[key] === undefined || typeof options[key] === 'string' && options[key].startsWith('--')) {
      throw ui.fail('USAGE Missing option value', 1);
    }
  }
  validateCommandArgs(command, args, options, spec);
  return {
    command,
    args,
    options
  };
};

async function guardForeground(context) {
  const { options, pkg } = context;
  if (options['any-app']) {
    return;
  }
  let current;
  // Another agent can move this shared phone to another app between commands.
  for (let i = 0; i < 3; i++) {
    current = await readFocus(context);
    if (current.package === pkg) {
      return;
    }
    if (i < 2) {
      await sleep(750);
    }
  }
  throw ui.fail(`FOREGROUND ${current.package}`, 3);
}

async function dumpScreen(context, timeout = 40000, deadline = Infinity) {
  const { adb } = context;
  for (let i = 0; i < 2; i++) {
    try {
      const dumpTimeout = Math.max(1, Math.min(timeout, deadline - Date.now()));
      const raw = (await adb(
        ['exec-out', 'uiautomator', 'dump', '/dev/tty'],
        dumpTimeout
      )).toString();
      if (/<hierarchy\b/.test(raw)) {
        return ui.parseXml(raw);
      }
    } catch {
      break;
    }
  }
  throw ui.fail('DUMP_FAILED (a focused text field or a running timer keeps the screen busy; use screenshots and tapxy)');
}

async function settleScreen(context) {
  const { options, dump } = context;
  if (options['no-settle']) {
    return;
  }
  // Sheets can still be animating when the first post-tap dump begins.
  await sleep(700);
  const deadline = Date.now() + 6000;
  let previous;
  while (Date.now() < deadline) {
    try {
      const sig = ui.signature(await dump(40000, deadline));
      if (sig === previous) {
        return;
      }
      previous = sig;
    } catch {
      return;
    }
    await sleep(100);
  }
}

async function resolveAdb() {
  let binary;
  const candidates = [
    process.env.ADB,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools/adb'),
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'),
    'adb'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await execute(candidate, ['version']);
      binary = candidate;
      break;
    } catch {}
  }
  if (!binary) {
    throw ui.fail('ADB_ERROR No working adb; set ADB or ANDROID_HOME', 1);
  }
  return binary;
}

async function resolveSerial(binary) {
  const list = (await execute(binary, ['devices'])).toString().split('\n').slice(1).map(s => s.trim().split(/\s+/)).filter(a => a[0]);
  let serial = process.env.ANDROID_SERIAL;
  if (!serial) {
    if (list.length !== 1 || list[0][1] !== 'device') {
      throw ui.fail(`ADB_ERROR Select ANDROID_SERIAL; attached: ${list.map(a => a.join(':')).join(', ') || 'none'}`, 1);
    }
    serial = list[0][0];
  }
  if (!list.some(a => a[0] === serial && a[1] === 'device')) {
    throw ui.fail('ADB_ERROR Selected device unavailable or unauthorized', 1);
  }
  return serial;
}

async function createContext({
  args,
  options
}) {
  const pkg = options.package || process.env.DEVICE_PACKAGE || 'org.masinyusane.masi';
  if (!/^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(pkg)) {
    throw ui.fail('USAGE Invalid package', 1);
  }
  const binary = await resolveAdb();
  const serial = await resolveSerial(binary);
  const adb = (a, timeout) => execute(binary, ['-s', serial, ...a], timeout);
  const shell = async cmd => (await adb(['shell', cmd])).toString();
  const context = {
    adb,
    shell,
    options,
    args,
    pkg,
    serial
  };
  const guard = (...values) => guardForeground(context, ...values);
  const dump = (...values) => dumpScreen(context, ...values);
  const settle = (...values) => settleScreen(context, ...values);
  Object.assign(context, {
    guard,
    dump,
    settle
  });
  return context;
}

async function readFocus(context) {
  const { shell } = context;
  return ui.parseFocus(await shell('dumpsys window'));
}

async function sendInput(context, cmd, settling = false) {
  const { shell, guard, settle } = context;
  await guard();
  await shell(cmd);
  if (settling) {
    await settle();
  }
}

async function readSize(context) {
  const { shell } = context;
  return ui.parseSize(await shell('wm size'));
}

async function scrollScreen(context, direction, small) {
  const { width, height } = await readSize(context);
  const delta = height * (small ? 0.2 : 0.45) / 2;
  const mid = height * 0.5;
  const [y1, y2] = direction === 'down' ? [mid + delta, mid - delta] : [mid - delta, mid + delta];
  await sendInput(context, `input swipe ${Math.round(width / 2)} ${Math.round(y1)} ${Math.round(width / 2)} ${Math.round(y2)} 300`, true);
}

async function readState(context) {
  const { shell, pkg } = context;
  const raw = {};
  for (const [key, cmd] of Object.entries({
    window: 'dumpsys window',
    density: 'wm density',
    size: 'wm size',
    font: 'settings get system font_scale',
    airplane: 'settings get global airplane_mode_on',
    wifi: 'settings get global wifi_on',
    auto: 'settings get global auto_time',
    battery: 'dumpsys battery',
    app: `dumpsys package ${pkg}`
  })) {
    raw[key] = await shell(cmd);
  }
  try {
    await shell('ping -c1 -W3 8.8.8.8');
    raw.ping = true;
  } catch {
    raw.ping = false;
  }
  return ui.parseState(raw);
}

function printState(context, value) {
  const { options } = context;
  const output = options.json
    ? JSON.stringify(value)
    : Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  return console.log(output);
}

function runsRoot() {
  return path.resolve(process.env.DEVICE_RUNS_ROOT || path.join(ROOT, 'device-runs'));
}

function resolveRunDir(context) {
  const { options } = context;
  // Each shell call starts fresh, so fall back to the run that start-run marked CURRENT.
  const current = path.join(runsRoot(), 'CURRENT');
  const fallback = fs.existsSync(current) ? fs.realpathSync(current) : path.join(runsRoot(), 'adhoc');
  const dir = path.resolve(options['run-dir'] || process.env.DEVICE_RUN_DIR || fallback);
  fs.mkdirSync(dir, {
    recursive: true,
    mode: 0o700
  });
  return dir;
}

async function stateCommand(context) {
  printState(context, await readState(context));
}

async function startRunCommand(context) {
  const { args, pkg, serial } = context;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(args[0])) {
    throw ui.fail('USAGE Invalid label', 1);
  }
  const startedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const stamp = startedAtUtc.slice(0, 16).replace('T', '-').replace(':', '');
  const dir = path.join(runsRoot(), `${stamp}-${args[0]}`);
  fs.mkdirSync(path.dirname(dir), {
    recursive: true,
    mode: 0o700
  });
  fs.mkdirSync(dir, {
    mode: 0o700
  });
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({
    label: args[0],
    startedAtUtc,
    serial,
    package: pkg,
    deviceStateAtStart: await readState(context)
  }, null, 2), {
    mode: 0o600
  });
  const current = path.join(runsRoot(), 'CURRENT');
  fs.rmSync(current, { force: true });
  fs.symlinkSync(path.basename(dir), current);
  console.log(`${dir}\nstartedAtUtc=${startedAtUtc}\nCURRENT -> ${path.basename(dir)}`);
}

function normalizationChanges(s) {
  const changes = [];
  if (s.airplane_mode_on !== '0') {
    changes.push('cmd connectivity airplane-mode disable');
  }
  if (s.wifi_on !== '1' || s.airplane_mode_on !== '0') {
    changes.push('cmd wifi set-wifi-enabled enabled');
  }
  if (s.density.override !== null) {
    changes.push('wm density reset');
  }
  if (s.size.override !== null) {
    changes.push('wm size reset');
  }
  if (Number(s.font_scale) !== 1) {
    changes.push('settings put system font_scale 1.0');
  }
  return changes;
}

async function waitForPing(context) {
  const { shell } = context;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await shell('ping -c1 -W3 8.8.8.8');
      break;
    } catch {
      await sleep(500);
    }
  }
}

async function normalizeCommand(context) {
  const { shell, options } = context;
  const s = await readState(context);
  const changes = normalizationChanges(s);
  console.log('NOTE On this phone airplane mode can turn Wi-Fi back on by itself; Wi-Fi is set explicitly when needed.');
  if (!options.apply) {
    console.log(changes.length ? changes.map(c => `WOULD ${c}`).join('\n') : 'OK Already normalized');
  } else {
    for (const c of changes) {
      await shell(c);
    }
    await waitForPing(context);
    printState(context, await readState(context));
  }
}

async function launchCommand(context) {
  const { shell, pkg } = context;
  await shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
  const deadline = Date.now() + 10000;
  while ((await readFocus(context)).package !== pkg) {
    if (Date.now() >= deadline) {
      throw ui.fail('TIMEOUT launch');
    }
    await sleep(300);
  }
  console.log(`OK Launched ${pkg}`);
}

async function shotCommand(context) {
  const { adb, args } = context;
  const name = args[0] || 'screen';
  if (!/^[\w-]+$/.test(name)) {
    throw ui.fail('USAGE Invalid screenshot name', 1);
  }
  const dir = resolveRunDir(context);
  let n = fs.readdirSync(dir).filter(f => f.endsWith('.png')).length;
  let file;
  do {
    file = path.join(dir, `${String(n++).padStart(2, '0')}-${name}.png`);
  } while (fs.existsSync(file));
  fs.writeFileSync(file, await adb(['exec-out', 'screencap', '-p']), {
    mode: 0o600,
    flag: 'wx'
  });
  console.log(file);
}

function isListedNode(node) {
  const layoutId = /(?:^|[/:])(?:content|root|container|decor_content_parent|navigationBarBackground|statusBarBackground)$/;
  return node.text || node.desc || node.id && (node.clickable || !layoutId.test(node.id));
}

async function listNodes(context, command) {
  const { dump, options, args } = context;
  let nodes = await dump();
  if (command === 'find') {
    nodes = ui.matches(nodes, args[0], options);
    if (!nodes.length) {
      throw ui.fail(`NOT_FOUND ${args[0]}`);
    }
  } else if (command === 'fields') {
    nodes = nodes.filter(n => /EditText/.test(n.class));
  } else if (!options.all) {
    nodes = nodes.filter(isListedNode);
  }
  const lines = options.json ? [] : nodes.map(node => {
    const hint = command === 'fields' ? ` hint=${JSON.stringify(node.hint)}` : '';
    return ui.formatNode(node) + hint;
  });
  console.log(options.json ? JSON.stringify(nodes) : lines.join('\n'));
}

async function dumpCommand(context) {
  await listNodes(context, 'dump');
}

async function findCommand(context) {
  await listNodes(context, 'find');
}

async function fieldsCommand(context) {
  await listNodes(context, 'fields');
}

async function tapCommand(context) {
  const { guard, dump, options, args } = context;
  await guard();
  const picked = ui.pick(await dump(), args[0], options);
  if (picked.warning) {
    console.error(picked.warning);
  }
  await sendInput(context, `input tap ${picked.node.bounds.cx} ${picked.node.bounds.cy}`, true);
  console.log(`OK Tapped ${ui.formatNode(picked.node)}`);
}

async function tapxyCommand(context) {
  const { args } = context;
  await sendInput(context, `input tap ${args.join(' ')}`, true);
  console.log(`OK Tapped ${args.join(',')}`);
}

async function waitCommand(context) {
  const { dump, options, args } = context;
  const deadline = Date.now() + (options.timeout ?? 20) * 1000;
  while (true) {
    const found = ui.matches(await dump(40000, deadline), args[0], options).length > 0;
    if (options.gone ? !found : found) {
      break;
    }
    if (Date.now() >= deadline) {
      throw ui.fail(`TIMEOUT ${args[0]}`);
    }
    await sleep(1000);
  }
  console.log(`OK ${options.gone ? 'Gone' : 'Found'} ${args[0]}`);
}

async function typeCommand(context) {
  const { options, args } = context;
  const text = options.stdin ? fs.readFileSync(0, 'utf8') : args[0];
  if (/[\r\n\0]/.test(text)) {
    throw ui.fail('USAGE input text needs a single line without NUL', 1);
  }
  await sendInput(context, `input text ${ui.escapeText(text)}`);
  console.log(`OK Typed ${Array.from(text).length} characters`);
}

async function clearCommand(context) {
  const { args } = context;
  await sendInput(context, `input keyevent KEYCODE_MOVE_END${' KEYCODE_DEL'.repeat(+(args[0] ?? 40))}`);
  console.log('OK Cleared');
}

async function keyCommand(context) {
  const { args } = context;
  const keys = {
    back: 4,
    home: 3,
    enter: 66,
    del: 67,
    end: 123,
    tab: 61,
    escape: 111
  };
  await sendInput(context, `input keyevent ${keys[args[0]] ?? args[0]}`, true);
  console.log('OK Key sent');
}

async function hideKeyboardCommand(context) {
  const { shell } = context;
  if (/mInputShown=true/.test(await shell('dumpsys input_method'))) {
    await sendInput(context, 'input keyevent 4', true);
    console.log('OK Keyboard hidden');
  } else {
    console.log('OK Keyboard already hidden');
  }
}

async function scrollCommand(context) {
  const { options, args } = context;
  await scrollScreen(context, args[0], options.small);
  console.log('OK Scrolled');
}

async function scrollToCommand(context) {
  const { guard, dump, options, args } = context;
  await guard();
  const { width, height } = await readSize(context);
  let found;
  for (let i = 0; i <= (options.max ?? 8); i++) {
    found = ui.matches(await dump(), args[0], options).filter(node => (
      !node.offscreen &&
      node.bounds.cx > 0 &&
      node.bounds.cx < width &&
      node.bounds.cy > 0 &&
      node.bounds.cy < height * 0.88
    ));
    if (found.length) {
      break;
    }
    if (i < (options.max ?? 8)) {
      await scrollScreen(context, options.direction || 'down', true);
    }
  }
  if (!found.length) {
    throw ui.fail(`NOT_FOUND ${args[0]} (scroll limit)`);
  }
  console.log(found.map(ui.formatNode).join('\n'));
}

async function swipeCommand(context) {
  const { args } = context;
  await sendInput(context, `input swipe ${args.slice(0, 4).join(' ')} ${args[4] || 300}`);
  console.log('OK Swiped');
}

const COMMANDS = {
  "state": stateCommand,
  "start-run": startRunCommand,
  "normalize": normalizeCommand,
  "launch": launchCommand,
  "shot": shotCommand,
  "dump": dumpCommand,
  "find": findCommand,
  "fields": fieldsCommand,
  "tap": tapCommand,
  "tapxy": tapxyCommand,
  "wait": waitCommand,
  "type": typeCommand,
  "clear": clearCommand,
  "key": keyCommand,
  "hide-keyboard": hideKeyboardCommand,
  "scroll": scrollCommand,
  "scroll-to": scrollToCommand,
  "swipe": swipeCommand
};

async function runCli(argv) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.help) {
      console.log(HELP);
      return 0;
    }
    const { command } = parsed;
    const context = await createContext(parsed);
    await COMMANDS[command](context);
    return 0;
  } catch (error) {
    if (['tap', 'find'].includes(argv[0]) && error.message.startsWith('NOT_FOUND ')) {
      error.message += ' (if it may be below the fold, use scroll-to)';
    }
    const message = Number.isInteger(error.code)
      ? error.message.replace(/[\r\n]+/g, ' ')
      : 'ADB_ERROR Device command or local file operation failed';
    console.error(message);
    return Number.isInteger(error.code) ? error.code : 1;
  }
}
if (require.main === module) {
  runCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}

module.exports = {
  runCli,
  parseArgs
};
