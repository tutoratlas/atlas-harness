#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

const require = createRequire(import.meta.url);
const sharp = require(join(repoRoot, 'node_modules/.pnpm/sharp@0.34.5/node_modules/sharp'));

// Read source logo
const logoSvgPath = join(repoRoot, 'assets/atlas/logo.svg');
const logoSvg = readFileSync(logoSvgPath, 'utf-8');

// SVG wrapper variants
function createAppIconSvg(glyphSvg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="180" fill="white"/>
  <g transform="translate(278,184) scale(6.24)">
    ${extractGlyphContent(glyphSvg)}
  </g>
</svg>`;
}

function createFaviconSvg(glyphSvg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="110" fill="white"/>
  <g transform="translate(219,102) scale(7.8)">
    ${extractGlyphContent(glyphSvg)}
  </g>
</svg>`;
}

function createAppleTouchSvg(glyphSvg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="white"/>
  <g transform="translate(278,184) scale(6.24)">
    ${extractGlyphContent(glyphSvg)}
  </g>
</svg>`;
}

function extractGlyphContent(svgContent) {
  const match = svgContent.match(/<g>([\s\S]*?)<\/g>/);
  return match ? match[1] : '';
}

// Render SVG to PNG at specific size
async function renderPng(svgContent, size, flatten = false) {
  let pipeline = sharp(Buffer.from(svgContent), { density: 300 })
    .resize(size, size);

  if (flatten) {
    pipeline = pipeline.flatten({ background: '#ffffff' });
  }

  return await pipeline.png().toBuffer();
}

// Build ICO file (little-endian)
function buildIco(sizes, pngBuffers) {
  const imageCount = sizes.length;
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + (entrySize * imageCount);

  let totalSize = dirSize;
  const entries = [];

  for (let i = 0; i < imageCount; i++) {
    const size = sizes[i];
    const pngBuffer = pngBuffers[i];
    entries.push({
      width: size === 256 ? 0 : size,
      height: size === 256 ? 0 : size,
      offset: totalSize,
      size: pngBuffer.length,
      buffer: pngBuffer
    });
    totalSize += pngBuffer.length;
  }

  const icoBuffer = Buffer.alloc(totalSize);
  let offset = 0;

  // ICONDIR header
  icoBuffer.writeUInt16LE(0, offset); offset += 2; // Reserved
  icoBuffer.writeUInt16LE(1, offset); offset += 2; // Type (1 = ICO)
  icoBuffer.writeUInt16LE(imageCount, offset); offset += 2; // Image count

  // ICONDIRENTRY entries
  for (const entry of entries) {
    icoBuffer.writeUInt8(entry.width, offset); offset += 1;
    icoBuffer.writeUInt8(entry.height, offset); offset += 1;
    icoBuffer.writeUInt8(0, offset); offset += 1; // Color palette
    icoBuffer.writeUInt8(0, offset); offset += 1; // Reserved
    icoBuffer.writeUInt16LE(1, offset); offset += 2; // Color planes
    icoBuffer.writeUInt16LE(32, offset); offset += 2; // Bits per pixel
    icoBuffer.writeUInt32LE(entry.size, offset); offset += 4; // Image size
    icoBuffer.writeUInt32LE(entry.offset, offset); offset += 4; // Offset
  }

  // PNG payloads
  for (const entry of entries) {
    entry.buffer.copy(icoBuffer, offset);
    offset += entry.buffer.length;
  }

  return icoBuffer;
}

// Build ICNS file (big-endian)
function buildIcns(pngMap) {
  const entries = [
    { type: 'ic11', size: 32 },
    { type: 'ic12', size: 64 },
    { type: 'ic07', size: 128 },
    { type: 'ic13', size: 256 },
    { type: 'ic08', size: 256 },
    { type: 'ic14', size: 512 },
    { type: 'ic09', size: 512 },
    { type: 'ic10', size: 1024 }
  ];

  let totalSize = 8; // Header size
  const entriesData = [];

  for (const entry of entries) {
    const pngBuffer = pngMap[entry.size];
    if (!pngBuffer) continue;

    const entrySize = 8 + pngBuffer.length;
    entriesData.push({
      type: entry.type,
      size: entrySize,
      buffer: pngBuffer
    });
    totalSize += entrySize;
  }

  const icnsBuffer = Buffer.alloc(totalSize);
  let offset = 0;

  // ICNS header
  icnsBuffer.write('icns', offset, 'ascii'); offset += 4;
  icnsBuffer.writeUInt32BE(totalSize, offset); offset += 4;

  // Entries
  for (const entry of entriesData) {
    icnsBuffer.write(entry.type, offset, 'ascii'); offset += 4;
    icnsBuffer.writeUInt32BE(entry.size, offset); offset += 4;
    entry.buffer.copy(icnsBuffer, offset);
    offset += entry.buffer.length;
  }

  return icnsBuffer;
}

// Main generation
async function generateAssets() {
  // Create SVG variants
  const appIconSvg = createAppIconSvg(logoSvg);
  const faviconSvg = createFaviconSvg(logoSvg);
  const appleTouchSvg = createAppleTouchSvg(logoSvg);

  // Render PNGs for app icon variant
  const appIcon1024 = await renderPng(appIconSvg, 1024);
  const appIcon512 = await renderPng(appIconSvg, 512);
  const appIcon256 = await renderPng(appIconSvg, 256);
  const appIcon128 = await renderPng(appIconSvg, 128);
  const appIcon64 = await renderPng(appIconSvg, 64);
  const appIcon32 = await renderPng(appIconSvg, 32);

  // Render PNGs for favicon variant
  const favicon48 = await renderPng(faviconSvg, 48);
  const favicon32 = await renderPng(faviconSvg, 32);
  const favicon16 = await renderPng(faviconSvg, 16);

  // Render PNGs for apple touch variant (with flatten)
  const appleTouch180 = await renderPng(appleTouchSvg, 180, true);

  // Build ICO files
  const webFaviconIco = buildIco([16, 32, 48], [favicon16, favicon32, favicon48]);
  const windowsIco = buildIco([16, 32, 48, 256], [favicon16, favicon32, favicon48, appIcon256]);

  // Build ICNS file
  const icnsMap = {
    32: appIcon32,
    64: appIcon64,
    128: appIcon128,
    256: appIcon256,
    512: appIcon512,
    1024: appIcon1024
  };
  const macIconIcns = buildIcns(icnsMap);

  // Output files
  const outputMatrix = [
    // Production assets (9 files)
    { path: 'assets/prod/black-macos-1024.png', data: appIcon1024 },
    { path: 'assets/prod/black-universal-1024.png', data: appIcon1024 },
    { path: 'assets/prod/t3-black-windows.ico', data: windowsIco },
    { path: 'assets/prod/t3-black-web-favicon.ico', data: webFaviconIco },
    { path: 'assets/prod/t3-black-web-favicon-16x16.png', data: favicon16 },
    { path: 'assets/prod/t3-black-web-favicon-32x32.png', data: favicon32 },
    { path: 'assets/prod/t3-black-web-apple-touch-180.png', data: appleTouch180 },
    { path: 'assets/prod/logo.svg', data: logoSvg },

    // Nightly assets (8 files)
    { path: 'assets/nightly/blueprint-macos-1024.png', data: appIcon1024 },
    { path: 'assets/nightly/blueprint-universal-1024.png', data: appIcon1024 },
    { path: 'assets/nightly/blueprint-windows.ico', data: windowsIco },
    { path: 'assets/nightly/blueprint-web-favicon.ico', data: webFaviconIco },
    { path: 'assets/nightly/blueprint-web-favicon-16x16.png', data: favicon16 },
    { path: 'assets/nightly/blueprint-web-favicon-32x32.png', data: favicon32 },
    { path: 'assets/nightly/blueprint-web-apple-touch-180.png', data: appleTouch180 },
    { path: 'assets/nightly/logo.svg', data: logoSvg },

    // Dev assets (8 files)
    { path: 'assets/dev/blueprint-macos-1024.png', data: appIcon1024 },
    { path: 'assets/dev/blueprint-universal-1024.png', data: appIcon1024 },
    { path: 'assets/dev/blueprint-windows.ico', data: windowsIco },
    { path: 'assets/dev/blueprint-web-favicon.ico', data: webFaviconIco },
    { path: 'assets/dev/blueprint-web-favicon-16x16.png', data: favicon16 },
    { path: 'assets/dev/blueprint-web-favicon-32x32.png', data: favicon32 },
    { path: 'assets/dev/blueprint-web-apple-touch-180.png', data: appleTouch180 },
    { path: 'assets/dev/logo.svg', data: logoSvg },

    // Desktop resources (3 files)
    { path: 'apps/desktop/resources/icon.png', data: appIcon512 },
    { path: 'apps/desktop/resources/icon.ico', data: windowsIco },
    { path: 'apps/desktop/resources/icon.icns', data: macIconIcns },

    // Web public (4 files)
    { path: 'apps/web/public/favicon.ico', data: webFaviconIco },
    { path: 'apps/web/public/favicon-16x16.png', data: favicon16 },
    { path: 'apps/web/public/favicon-32x32.png', data: favicon32 },
    { path: 'apps/web/public/apple-touch-icon.png', data: appleTouch180 }
  ];

  // Write all files
  for (const { path, data } of outputMatrix) {
    const fullPath = join(repoRoot, path);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, typeof data === 'string' ? data : data);
  }
}

// Run
generateAssets().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
