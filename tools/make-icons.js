// Generates the app icons from one design.
// Usage: node tools/make-icons.js   (needs the `playwright` package and Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// A notebook with a spark on a deep-indigo tile. `pad` shrinks the artwork for maskable icons.
function iconSvg({ pad = 0, round = true } = {}) {
  const s = 1 - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5646e8"/><stop offset="1" stop-color="#1b1456"/></linearGradient></defs>
  <rect width="512" height="512" rx="${round ? 112 : 0}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <rect x="132" y="104" width="248" height="304" rx="28" fill="#f1f0ff"/>
    <rect x="132" y="104" width="44" height="304" rx="22" fill="#c9c6f2"/>
    <rect x="204" y="170" width="140" height="14" rx="7" fill="#5646e8"/>
    <rect x="204" y="214" width="140" height="14" rx="7" fill="#9d95ee"/>
    <rect x="204" y="258" width="100" height="14" rx="7" fill="#9d95ee"/>
    <path d="M352 300 l14 34 l34 14 l-34 14 l-14 34 l-14 -34 l-34 -14 l34 -14z" fill="#ffd166"/>
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
