import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, pageFiles, contentHash, applyStamp } from '../scripts/stamp.mjs';

test('module and stylesheet URLs carry the current content stamp (run `npm run stamp` after edits)', () => {
  const v = contentHash();
  for (const f of pageFiles()) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    assert.equal(applyStamp(text, f, v), text, `${f} has missing or old ?v= stamps; run npm run stamp`);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`src="src/ui\\.js\\?v=${v}"`), 'entry module stamped');
  assert.match(readFileSync(join(ROOT, 'src/ui.js'), 'utf8'), new RegExp(`'\\./saw/worker\\.js\\?v=${v}'`), 'worker URL stamped');
});
