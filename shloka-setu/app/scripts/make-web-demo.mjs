#!/usr/bin/env node
/**
 * Turn `dist/` (from `npx expo export --platform web`) into a portable demo in `web-demo/`
 * that works when hosted under any path (e.g. a sandboxed claude.ai artifact or a
 * GitHub Pages sub-folder), not only at the server root.
 *
 *   npm run content && npx expo export --platform web && node scripts/make-web-demo.mjs
 *
 * What it does:
 *  - index.html: script/icon URLs become relative, and an inline bootstrap records the
 *    folder the page was served from in `window.__SS_BASE`. It then resets the address to "/"
 *    so expo-router starts on Home whatever the hosting path is.
 *  - JS bundles: absolute "/assets/…" and "/_expo/static/…" URLs are prefixed with
 *    __SS_BASE at runtime. The web content manifest already reads __SS_BASE for content files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(APP, 'dist');
const OUT = path.join(APP, 'web-demo');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html not found: run `npx expo export --platform web` first');
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });

const BASE_EXPR = '(window.__SS_BASE||"/")+';
let jsFiles = 0;
let rewrites = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      let s = fs.readFileSync(p, 'utf8');
      const before = s;
      s = s.replace(/"\/(assets|_expo\/static)\//g, (_m, dirName) => {
        rewrites++;
        return `${BASE_EXPR}"${dirName}/`;
      });
      if (s !== before) {
        fs.writeFileSync(p, s);
        jsFiles++;
      }
    }
  }
};
walk(path.join(OUT, '_expo'));

// Route chunks are named like "[id]-<hash>.js"; brackets in URLs are fragile on some hosts.
const jsDir = path.join(OUT, '_expo', 'static', 'js', 'web');
const renames = fs.readdirSync(jsDir).filter((f) => /[\[\]]/.test(f)).map((f) => [f, f.replace(/\[/g, '_').replace(/\]/g, '_')]);
for (const [from, to] of renames) fs.renameSync(path.join(jsDir, from), path.join(jsDir, to));
if (renames.length) {
  for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
    const p = path.join(jsDir, f);
    let s = fs.readFileSync(p, 'utf8');
    for (const [from, to] of renames) s = s.split(from).join(to);
    fs.writeFileSync(p, s);
  }
}

// Some hosts (claude.ai artifacts) reserve names starting with "_": rename "_expo" and any
// "_"-prefixed bundle files to "x…" and rewrite every reference.
{
  const oldDir = path.join(OUT, '_expo');
  const jsWeb = path.join(oldDir, 'static', 'js', 'web');
  const fileRenames = fs.readdirSync(jsWeb).filter((f) => f.startsWith('_')).map((f) => [f, 'x' + f]);
  for (const [from, to] of fileRenames) fs.renameSync(path.join(jsWeb, from), path.join(jsWeb, to));
  fs.renameSync(oldDir, path.join(OUT, 'x_expo'));
  const fix = (s) => {
    for (const [from, to] of fileRenames) s = s.split('/' + from).join('/' + to);
    return s.split('_expo/static/').join('x_expo/static/').split('xx_expo/').join('x_expo/');
  };
  const newWeb = path.join(OUT, 'x_expo', 'static', 'js', 'web');
  for (const f of fs.readdirSync(newWeb)) {
    const p = path.join(newWeb, f);
    fs.writeFileSync(p, fix(fs.readFileSync(p, 'utf8')));
  }
  const ip = path.join(OUT, 'index.html');
  fs.writeFileSync(ip, fix(fs.readFileSync(ip, 'utf8')));
}

const bootstrap = `<script>
(function(){
  try { window.__SS_BASE = new URL('.', document.baseURI).href; } catch (e) { window.__SS_BASE = '/'; }
  // Pin relative URLs (scripts, icons) to the hosting folder before the address is reset below.
  try { var b = document.createElement('base'); b.href = window.__SS_BASE; document.head.appendChild(b); } catch (e) {}
  try { if (location.pathname !== '/') history.replaceState(null, '', '/' + location.hash); } catch (e) {}
})();
</script>`;
const ribbon = `<div id="ss-demo-ribbon" style="position:fixed;left:0;right:0;bottom:0;z-index:99999;font:12px/1.4 system-ui,sans-serif;background:#2b2a6b;color:#f6efe0;text-align:center;padding:4px 8px;pointer-events:none;opacity:.92">Web demo: reading, quiz, flashcards, glossary and offline search work here. Photo scan &amp; AI tutor need the Shloka Setu server.</div>`;

let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html
  .replace(/(src|href)="\/(?!\/)/g, '$1="./')
  .replace('<head>', `<head>\n${bootstrap}`)
  ;
if (!/<title>/.test(html)) html = html.replace('</head>', '<title>Shloka Setu</title></head>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

let files = 0;
let bytes = 0;
const count = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count(p);
    else {
      files++;
      bytes += fs.statSync(p).size;
    }
  }
};
count(OUT);
console.log(`web-demo/: ${files} files, ${(bytes / 1e6).toFixed(1)} MB; rewrote ${rewrites} URLs in ${jsFiles} JS files`);
