// Cache-busting: append ?v=<hash> to every local module and stylesheet URL, where <hash>
// is computed from the content of the page files. A changed file gives a new hash, so
// browsers (and GitHub Pages' 10-minute cache) cannot mix old and new modules.
// Usage: npm run stamp   (run after editing any file under src/, css/ or index.html;
//                         `npm test` fails while the stamps are out of date)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STAMP = /\?v=[0-9a-f]{10}/g;

/** Files whose content defines the stamp, and in which local URLs are stamped. */
export function pageFiles() {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(js|css)$/.test(e.name) ? [join(dir, e.name)] : []);
  return ['index.html', ...walk('css'), ...walk('src')].sort();
}

/** Content hash with stamps removed and line endings normalized (same on every checkout). */
export function contentHash(files = pageFiles()) {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(ROOT, join(ROOT, f)).replace(/\\/g, '/'));
    h.update(readFileSync(join(ROOT, f), 'utf8').replace(STAMP, '').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 10);
}

/** Text with every local .js/.css URL carrying ?v=<v>. */
export function applyStamp(text, file, v) {
  if (file.endsWith('.html')) {
    return text.replace(/((?:src|href)=")((?:src|css)\/[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]{10})?"/g, `$1$2?v=${v}"`);
  }
  // Relative module specifiers in import/export statements and new URL('./x.js', import.meta.url).
  return text.replace(/(['"])(\.\.?\/[^'"?#\s]+\.js)(?:\?v=[0-9a-f]{10})?\1/g, `$1$2?v=${v}$1`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = contentHash();
  let changed = 0;
  for (const f of pageFiles()) {
    const path = join(ROOT, f), text = readFileSync(path, 'utf8'), out = applyStamp(text, f, v);
    if (out !== text) { writeFileSync(path, out); changed++; }
  }
  console.log(`stamp ${v}: ${changed} file(s) updated`);
}
