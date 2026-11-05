'use strict';

// One source of truth for the Masi app icon, splash image and Android adaptive foreground.
//
// The mark (two legs, the child's V body and head) is plain geometry traced from
// assets/brand/masi-mark-white@3x.png, in that PNG's 144x123 coordinate space. Every icon file
// is rendered from these shapes by scripts/render-app-icons.cjs, so the sizes never drift apart.

const fs = require('fs');
const zlib = require('zlib');

const MARK_VIEWBOX = { width: 144, height: 123 };

const MARK_POLYGONS = [
  // Left leg, right leg (a mirror of the left about x = 72), then the child's V body.
  [[21, 5], [24, 5], [50, 68], [40, 118], [3, 119]],
  [[123, 5], [120, 5], [94, 68], [104, 118], [141, 119]],
  [[28, 2], [72, 106], [116, 2], [72, 51]],
];
const MARK_HEAD = { cx: 72, cy: 26, r: 10 };

// Centre of the mark's bounding box, in mark units.
const MARK_CENTRE = { x: 72, y: 60.5 };

const BRAND_RED = '#C81F3E'; // colors.red600 / colors.primary
const WHITE = '#FFFFFF';

// The mark sits a few pixels above true centre (per 1024 px) so it reads as centred.
const OPTICAL_LIFT_PER_1024 = 6;

// Every file the app config and stores consume. `markScale` is mark units -> pixels at 1024 px.
const ICON_OUTPUTS = [
  {
    // iOS and the top-level Expo icon: full-bleed and opaque. iOS applies its own mask and
    // paints any transparency white, so this file must never carry an alpha channel.
    file: 'assets/app-icon/icon.png', size: 1024, background: BRAND_RED, markScale: 4.4,
  },
  {
    // Android adaptive foreground (and the Android 13 themed-icon monochrome layer): white mark
    // on transparent, kept inside the 66dp-of-108dp safe circle the launcher never crops.
    file: 'assets/app-icon/android-foreground.png', size: 1024, background: null, markScale: 3.0,
  },
  {
    // Splash image: white mark on transparent, shown on a red600 splash background. Android 12+
    // crops the splash icon to a circle two thirds of its width, so the mark stays inside that.
    file: 'assets/app-icon/splash.png', size: 1024, background: null, markScale: 3.6,
  },
  {
    // Google Play store listing icon (uploaded by hand in Play Console): 512 px, full-bleed, opaque.
    file: 'assets/app-icon/play-store.png', size: 512, background: BRAND_RED, markScale: 4.4,
  },
  {
    // Web favicon (Expo web only).
    file: 'assets/favicon.png', size: 48, background: BRAND_RED, markScale: 4.4,
  },
];

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Mark units -> output pixels for one output.
function markTransform({ size, markScale }) {
  const scale = markScale * (size / 1024);
  return {
    scale,
    tx: size / 2 - MARK_CENTRE.x * scale,
    ty: size / 2 - MARK_CENTRE.y * scale - OPTICAL_LIFT_PER_1024 * (size / 1024),
  };
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideMark(x, y) {
  const dx = x - MARK_HEAD.cx;
  const dy = y - MARK_HEAD.cy;
  if (dx * dx + dy * dy <= MARK_HEAD.r * MARK_HEAD.r) return true;
  return MARK_POLYGONS.some((polygon) => insidePolygon(x, y, polygon));
}

// Farthest point of the mark from its centre, in mark units: what a circular crop must clear.
function markMaxRadius() {
  const points = MARK_POLYGONS.flat();
  const polygonMax = Math.max(...points.map(([x, y]) => Math.hypot(x - MARK_CENTRE.x, y - MARK_CENTRE.y)));
  const headMax = Math.hypot(MARK_HEAD.cx - MARK_CENTRE.x, MARK_HEAD.cy - MARK_CENTRE.y) + MARK_HEAD.r;
  return Math.max(polygonMax, headMax);
}

// Renders one output to { width, height, channels, data } with 4x4 supersampled edges.
function renderIcon(output, samples = 4) {
  const { size, background } = output;
  const { scale, tx, ty } = markTransform(output);
  const channels = background ? 3 : 4;
  const data = Buffer.alloc(size * size * channels);
  const bg = background ? hexToRgb(background) : null;
  const fg = hexToRgb(WHITE);
  const total = samples * samples;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const mx = (px + (sx + 0.5) / samples - tx) / scale;
          const my = (py + (sy + 0.5) / samples - ty) / scale;
          if (mx >= 0 && mx <= MARK_VIEWBOX.width && my >= 0 && my <= MARK_VIEWBOX.height
            && insideMark(mx, my)) hits += 1;
        }
      }
      const coverage = hits / total;
      const offset = (py * size + px) * channels;
      if (bg) {
        for (let c = 0; c < 3; c += 1) {
          data[offset + c] = Math.round(bg[c] * (1 - coverage) + fg[c] * coverage);
        }
      } else {
        data[offset] = fg[0];
        data[offset + 1] = fg[1];
        data[offset + 2] = fg[2];
        data[offset + 3] = Math.round(255 * coverage);
      }
    }
  }
  return { width: size, height: size, channels, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// 8-bit RGB (colour type 2) or RGBA (colour type 6), no interlace.
function encodePng({ width, height, channels, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Decodes an 8-bit, non-interlaced RGB or RGBA PNG (any row filter). Enough to check our own files.
function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        bitDepth: body[8], colourType: body[9], interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    offset += 12 + length;
  }
  const channelsByType = { 2: 3, 6: 4 };
  const channels = channelsByType[header?.colourType];
  if (!header || header.bitDepth !== 8 || header.interlace !== 0 || !channels) {
    throw new Error(`Unsupported PNG: ${JSON.stringify(header)}`);
  }
  const { width, height } = header;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? data[y * stride + x - channels] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? data[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      data[y * stride + x] = (value + predictor) & 255;
    }
  }
  return { width, height, channels, data };
}

function readPng(path) {
  return decodePng(fs.readFileSync(path));
}

// The same geometry as an SVG master, white mark on transparent, for designers and future exports.
function markSvg() {
  const polygons = MARK_POLYGONS
    .map((points) => `  <polygon points="${points.map((p) => p.join(',')).join(' ')}"/>`)
    .join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}" fill="${WHITE}">`,
    '  <title>Masinyusane mark</title>',
    polygons,
    `  <circle cx="${MARK_HEAD.cx}" cy="${MARK_HEAD.cy}" r="${MARK_HEAD.r}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

module.exports = {
  BRAND_RED,
  ICON_OUTPUTS,
  MARK_CENTRE,
  decodePng,
  encodePng,
  markMaxRadius,
  markSvg,
  markTransform,
  readPng,
  renderIcon,
};
