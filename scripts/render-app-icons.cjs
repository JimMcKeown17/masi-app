#!/usr/bin/env node
'use strict';

// Renders every app icon, splash and favicon PNG, plus the SVG master, from the mark geometry
// in scripts/lib/appIcon.cjs. Run after changing that file: node scripts/render-app-icons.cjs
// __tests__/appIcon.test.js fails if a committed PNG no longer matches the geometry.

const fs = require('fs');
const path = require('path');
const { ICON_OUTPUTS, encodePng, markSvg, renderIcon } = require('./lib/appIcon.cjs');

const root = path.join(__dirname, '..');

for (const output of ICON_OUTPUTS) {
  const target = path.join(root, output.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encodePng(renderIcon(output)));
  console.log(`wrote ${output.file} (${output.size}x${output.size})`);
}

const svgTarget = path.join(root, 'assets/app-icon/masi-mark.svg');
fs.writeFileSync(svgTarget, markSvg());
console.log('wrote assets/app-icon/masi-mark.svg');
