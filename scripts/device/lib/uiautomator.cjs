const fail = (message, code = 2) => Object.assign(new Error(message), {
  code
});
const decodeXml = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
  if (entity[0] === '#') {
    return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  }
  return {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'"
  }[entity.toLowerCase()];
});

function parseNode(raw) {
  const attrs = Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, decodeXml(v)]));
  const nums = (attrs.bounds || '').match(/-?\d+/g)?.map(Number) || [0, 0, 0, 0];
  const [x1, y1, x2, y2] = nums;
  const node = {
    text: attrs.password === 'true' ? '•'.repeat(Array.from(attrs.text || '').length) : attrs.text || '',
    desc: attrs['content-desc'] || '',
    id: attrs['resource-id'] || '',
    class: attrs.class || '',
    hint: attrs.hint || '',
    bounds: {
      x1,
      y1,
      x2,
      y2,
      cx: Math.floor((x1 + x2) / 2),
      cy: Math.floor((y1 + y2) / 2)
    },
    offscreen: x2 <= x1 || y2 <= y1
  };
  for (const flag of ['clickable', 'enabled', 'focused', 'checked', 'selected', 'password']) {
    node[flag] = attrs[flag] === 'true';
  }
  return node;
}

const parseXml = xml => [...xml.matchAll(/<node\b([^>]*)>/g)].map(([, raw]) => parseNode(raw));

const normalize = text => text.replace(/\u00a0/g, ' ').toLowerCase();

const matches = (nodes, query, {
  exact = false
} = {}) => {
  const q = normalize(query);
  const found = nodes.filter(n => [n.text, n.desc, n.id].some(value => exact ? normalize(value) === q : normalize(value).includes(q)));
  return found.some(n => n.clickable) ? found.filter(n => n.clickable) : found;
};

const formatNode = node => {
  const flags = ['clickable', 'focused', 'checked', 'selected']
    .filter(key => node[key])
    .map(key => ` [${key}]`)
    .join('');
  const text = `text=${JSON.stringify(node.text)}`;
  const desc = ` desc=${JSON.stringify(node.desc)}`;
  const id = ` id=${JSON.stringify(node.id)}`;
  const centre = ` @${node.bounds.cx},${node.bounds.cy}`;
  const disabled = node.enabled ? '' : ' [DISABLED]';
  const offscreen = node.offscreen ? ' [OFFSCREEN]' : '';
  return text + desc + id + centre + flags + disabled + offscreen;
};

const pick = (nodes, query, options = {}) => {
  const found = matches(nodes, query, options);
  if (!found.length) {
    throw fail(`NOT_FOUND ${query}`);
  }
  const visible = found.filter(n => !n.offscreen);
  if (!visible.length) {
    throw fail(`OFFSCREEN ${query} (scroll first)`);
  }
  const candidates = visible.filter(n => n.enabled);
  if (!candidates.length) {
    throw fail(`DISABLED ${query}`);
  }
  // Later nodes belong to overlays drawn over matching page buttons.
  const node = options.nth === undefined ? candidates.at(-1) : candidates[options.nth];
  if (!node) {
    throw fail(`NOT_FOUND ${query} nth=${options.nth}`);
  }
  return {
    node,
    warning: candidates.length > 1 && options.nth === undefined ? `WARN ${candidates.map(formatNode).join(' ; ')}; picking last` : null
  };
};

const shellQuote = value => `'${value.replace(/'/g, "'\\''")}'`;

const escapeText = text => shellQuote(text.replace(/ /g, '%s'));

const parseFocus = text => {
  const line = text.split('\n').find(s => s.includes('mCurrentFocus=')) || '';
  const match = line.match(/\bu\d+\s+([\w.]+)\/([^\s}]+)/);
  return {
    package: match?.[1] || null,
    activity: match?.[2] || null
  };
};

const signature = nodes => JSON.stringify(nodes.map(n => [n.text, n.desc, n.bounds]));

const parseSize = raw => {
  const all = [...raw.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g)];
  if (!all.length) {
    throw fail('ADB_ERROR Could not read screen size', 1);
  }
  return {
    width: +all.at(-1)[1],
    height: +all.at(-1)[2]
  };
};

const parseState = raw => ({
  focus: parseFocus(raw.window),
  density: {
    physical: Number(raw.density.match(/Physical density:\s*(\d+)/)?.[1]) || null,
    override: Number(raw.density.match(/Override density:\s*(\d+)/)?.[1]) || null
  },
  size: {
    ...parseSize(raw.size),
    override: raw.size.match(/Override size:\s*(\d+x\d+)/)?.[1] || null
  },
  font_scale: raw.font.trim(),
  airplane_mode_on: raw.airplane.trim(),
  wifi_on: raw.wifi.trim(),
  auto_time: raw.auto.trim(),
  battery: Number(raw.battery.match(/level:\s*(\d+)/)?.[1]) || 0,
  app: {
    versionName: raw.app.match(/versionName=([^\s]+)/)?.[1] || null,
    versionCode: raw.app.match(/versionCode=(\d+)/)?.[1] || null,
    lastUpdateTime: raw.app.match(/lastUpdateTime=([^\n]+)/)?.[1]?.trim() || null
  },
  ping: raw.ping
});

module.exports = {
  parseXml,
  fail,
  matches,
  pick,
  formatNode,
  shellQuote,
  escapeText,
  parseFocus,
  signature,
  parseSize,
  parseState
};
