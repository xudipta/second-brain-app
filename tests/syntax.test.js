// Every script the page loads must at least compile. A typo in app.js would otherwise only show up in a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const assets = path.join(__dirname, '..', 'assets');
for (const file of fs.readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  test(`assets/${file} compiles`, () => {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(assets, file), 'utf8'), { filename: file }));
  });
}

test('sw.js compiles and every file it precaches exists', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(src, { filename: 'sw.js' }));
  const shell = src.match(/const SHELL = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.ok(shell.length > 5);
  for (const f of shell) if (f !== './') assert.ok(fs.existsSync(path.join(__dirname, '..', f)), `sw.js precaches ${f}, which does not exist`);
});

test('index.html loads only scripts that exist, and sw.js precaches them', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 5);
  for (const s of scripts) { assert.ok(fs.existsSync(path.join(root, s)), `${s} is loaded but missing`); assert.ok(sw.includes(`'${s}'`), `${s} is not in the offline cache list in sw.js`); }
});
