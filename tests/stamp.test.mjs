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

test('every page module parses (node --check), including the browser-only ones', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const f of pageFiles().filter((x) => x.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--check', join(ROOT, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
