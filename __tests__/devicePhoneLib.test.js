const ui = require('../scripts/device/lib/uiautomator.cjs');
const xml = attrs => `<hierarchy><node text="Gr&#160;1 &amp; &quot;Hi&quot;" content-desc="Discard lesson" resource-id="app:id/button" class="android.view.ViewGroup" clickable="true" enabled="true" focused="false" checked="false" selected="false" password="false" bounds="[42,1260][230,1334]" ${attrs || ''}/></hierarchy>`;
test('parses real dump attributes, XML entities, NBSP and centres', () => {
  expect(ui.parseXml(xml())[0]).toMatchObject({ text: 'Gr\u00a01 & "Hi"', desc: 'Discard lesson', id: 'app:id/button', clickable: true, enabled: true, bounds: { x1: 42, y1: 1260, x2: 230, y2: 1334, cx: 136, cy: 1297 }, offscreen: false });
});
test('masks password values and detects zero-area nodes', () => {
  const nodes = ui.parseXml('<node text="secret" password="true" bounds="[0,0][0,0]"/><node text="x" bounds="[1,2][1,9]"/>');
  expect(nodes[0].text).toBe('••••••');
  expect(JSON.stringify(nodes)).not.toContain('secret');
  expect(nodes.every(n => n.offscreen)).toBe(true);
});
test('matching normalizes NBSP, prefers clickable and defaults to the last overlay', () => {
  const nodes = ui.parseXml(xml() + xml());
  expect(ui.matches(nodes, 'gr 1')).toHaveLength(2);
  expect(ui.matches(nodes, 'gr 1', { exact: true })).toHaveLength(0);
  expect(ui.pick(nodes, 'discard lesson').node).toBe(nodes[1]);
  expect(ui.pick(nodes, 'discard lesson').warning).toMatch(/^WARN/);
  expect(ui.pick(nodes, 'discard lesson', { nth: 0 }).node).toBe(nodes[0]);
  nodes[1].clickable = false;
  expect(ui.matches(nodes, 'app:id/button', { exact: true })).toEqual([nodes[0]]);
});
test('tapping refuses offscreen-only, disabled and missing matches', () => {
  const nodes = ui.parseXml(xml()); nodes[0].offscreen = true;
  expect(() => ui.pick(nodes, 'Discard')).toThrow('OFFSCREEN Discard (scroll first)');
  expect(() => ui.pick(nodes, 'unknown')).toThrow('NOT_FOUND unknown');
  nodes[0].offscreen = false; nodes[0].enabled = false;
  expect(() => ui.pick(nodes, 'Discard')).toThrow('DISABLED');
});
test('shell escaping protects text including spaces, quotes and expansion characters', () => {
  expect(ui.escapeText('hello world')).toBe("'hello%sworld'");
  expect(ui.escapeText("a'\"&$`;|<>()\\*?!")).toBe("'a'\\''\"&$`;|<>()\\*?!'");
});
test.each([
  ['  mCurrentFocus=Window{2cfbb70 u0 org.masinyusane.zz/org.masinyusane.zz.MainActivity}', { package: 'org.masinyusane.zz', activity: 'org.masinyusane.zz.MainActivity' }],
  ['mCurrentFocus=null', { package: null, activity: null }],
  ['mCurrentFocus=Window{abc u0 PopupWindow:123}', { package: null, activity: null }],
  ['mCurrentFocus=Window{abc u0 org.masinyusane.masi/PopupWindow:123}', { package: 'org.masinyusane.masi', activity: 'PopupWindow:123' }],
])('parses focus: %s', (raw, expected) => expect(ui.parseFocus(raw)).toEqual(expected));
test('settling compares only text, description and bounds', () => {
  const a = ui.parseXml(xml()); const b = ui.parseXml(xml()); b[0].focused = true;
  expect(ui.signature(a)).toBe(ui.signature(b)); b[0].text = 'changed';
  expect(ui.signature(a)).not.toBe(ui.signature(b));
});
test('state parsing prefers the screen override and reports app/device settings', () => {
  const s = ui.parseState({ window: 'mCurrentFocus=null', density: 'Physical density: 320\nOverride density: 280', size: 'Physical size: 720x1600\nOverride size: 600x1200', font: '1.0\n', airplane: '0', wifi: '1', auto: '1', battery: 'level: 83', app: 'versionCode=58 minSdk=24\nversionName=1.5.0\nlastUpdateTime=2026-11-05 10:00:00\n', ping: true });
  expect(s).toMatchObject({ density: { physical: 320, override: 280 }, size: { width: 600, height: 1200, override: '600x1200' }, battery: 83, app: { versionCode: '58', versionName: '1.5.0' }, ping: true });
});
test('phone CLI validates inputs before touching adb', () => {
  const { parseArgs } = require('../scripts/device/phone.cjs');
  expect(parseArgs(['tap', 'Discard lesson', '--nth', '0', '--no-settle'])).toMatchObject({ command: 'tap', options: { nth: 0, 'no-settle': true } });
  for (const args of [['tap'], ['tap', 'x', '--nth', '-1'], ['type'], ['type', 'x', '--stdin'], ['tapxy', '1;bad', '2'], ['key', 'bad'], ['scroll', 'left'], ['swipe', '1', '2', '3'], ['state', '--unknown']]) expect(() => parseArgs(args)).toThrow();
});
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
test('a foreign foreground blocks input; --any-app deliberately bypasses it without echoing stdin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-device-'));
  const fake = path.join(dir, 'adb'); const record = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(fake, `#!${process.execPath}\nconst fs=require('fs'); const a=process.argv.slice(2); fs.appendFileSync(process.env.FAKE_CALLS,JSON.stringify(a)+'\\n');
if(a[0]==='version') console.log('Android Debug Bridge');
else if(a[0]==='devices') console.log('List of devices attached\\nfixture\\tdevice');
else if(a.at(-1)==='dumpsys window') console.log('mCurrentFocus=Window{abc u0 other.app/.Main}');\n`, { mode: 0o700 });
  const env = { ...process.env, ADB: fake, ANDROID_SERIAL: 'fixture', DEVICE_PACKAGE: 'org.masinyusane.masi', FAKE_CALLS: record };
  const script = path.resolve(__dirname, '../scripts/device/phone.cjs');
  try {
    const blocked = spawnSync(process.execPath, [script, 'tapxy', '10', '20', '--no-settle'], { env, encoding: 'utf8' });
    expect(blocked.status).toBe(3); expect(blocked.stderr.trim()).toBe('FOREGROUND other.app');
    expect(fs.readFileSync(record, 'utf8')).not.toContain('input tap');
    const typed = spawnSync(process.execPath, [script, 'type', '--stdin', '--any-app'], { env, input: "secret '&$` value", encoding: 'utf8' });
    expect(typed.status).toBe(0); expect(typed.stdout).toMatch(/^OK Typed \d+ characters\n$/); expect(typed.stdout + typed.stderr).not.toContain('secret');
    expect(fs.readFileSync(record, 'utf8')).toContain('input text');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}, 15000);

test.each(['tap', 'find'])('%s appends the below-the-fold hint without changing exit 2', command => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-device-not-found-'));
  const fake = path.join(dir, 'adb');
  fs.writeFileSync(fake, `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'version') {
  console.log('Android Debug Bridge');
} else if (args[0] === 'devices') {
  console.log('List of devices attached\\nfixture\\tdevice');
} else if (args.at(-1) === 'dumpsys window') {
  console.log('mCurrentFocus=Window{abc u0 org.masinyusane.masi/.Main}');
} else if (args.includes('uiautomator')) {
  console.log('<hierarchy><node text="Different label" bounds="[1,1][20,20]"/></hierarchy>');
}
`, { mode: 0o700 });
  try {
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../scripts/device/phone.cjs'), command, 'Missing label',
    ], {
      env: { ...process.env, ADB: fake, ANDROID_SERIAL: 'fixture', DEVICE_PACKAGE: 'org.masinyusane.masi' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe(
      'NOT_FOUND Missing label (if it may be below the fold, use scroll-to)',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
