// Generates the app icons from one design.
// Usage: node tools/make-icons.js   (needs the `playwright` package and Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// A paper sheet with a check on a forest-green tile. `pad` shrinks the artwork for maskable icons.
function iconSvg({ pad = 0, round = true } = {}) {
  const s = 1 - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${round ? 112 : 0}" fill="#1f5c4a"/>
  <g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <rect x="140" y="96" width="232" height="320" rx="24" fill="#f5f3ee"/>
    <path d="M188 200l36 36 70-76" fill="none" stroke="#1f5c4a" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="188" y="290" width="136" height="16" rx="8" fill="#1f5c4a" opacity=".35"/>
    <rect x="188" y="330" width="96" height="16" rx="8" fill="#1f5c4a" opacity=".35"/>
  </g>
</svg>`;
}

(async () => {
  const out = (f) => path.join(root, f);
  fs.writeFileSync(out('assets/favicon.svg'), iconSvg());
  const b = await chromium.launch();
  const shot = async (svg, size, file) => {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await p.screenshot({ path: out(file), omitBackground: true });
    await p.close();
  };
  await shot(iconSvg(), 192, 'assets/icons/icon-192.png');
  await shot(iconSvg(), 512, 'assets/icons/icon-512.png');
  await shot(iconSvg({ pad: 0.1, round: false }), 512, 'assets/icons/icon-maskable-512.png');
  await shot(iconSvg({ round: false }), 180, 'assets/icons/apple-touch-icon.png');
  await b.close();
})();
