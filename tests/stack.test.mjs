// Thin-film stacks (src/saw/stack.js): limits and self-consistency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stackSAW, STACKS, substrateAxes } from '../src/saw/stack.js';
import { crystal, solveOrientation } from '../src/saw/solver.js';
import { LN_ANDRUSHCHAK, LAYER_MATERIALS } from '../src/saw/constants.js';
import { orientation } from '../src/materials.js';

const o128 = orientation('128Y');
const bulk = solveOrientation(crystal(LN_ANDRUSHCHAK), o128.A, { pfa: false });
const f0 = 1e9;

test('layer materials are complete, and Si / sapphire substrate axes are proper rotations', () => {
  for (const [k, m] of Object.entries(LAYER_MATERIALS)) {
    for (const q of ['rho', 'c11', 'c12', 'c13', 'c14', 'c33', 'c44', 'c66', 'eps11', 'eps33']) assert.ok(Number.isFinite(m[q]), `${k}.${q}`);
  }
  for (const kind of ['Si', 'sapphire']) {
    const A = substrateAxes(kind, 17);
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    assert.ok(Math.abs(det - 1) < 1e-12, `${kind} det ${det}`);
  }
  assert.deepEqual(Object.keys(STACKS), ['bulk', 'lnoi', 'lnos', 'membrane']);
});

test('thick LN film recovers bulk 128°Y LN: on sapphire, on SiO2/Si, and as a membrane', () => {
  const thick = (3 * bulk.v0) / f0; // h = 3 lambda
  for (const [stack, extra] of [['lnos', {}], ['lnoi', { hOx: 0.5 * thick }], ['membrane', {}]]) {
    const r = stackSAW(o128, { stack, hLN: thick, f0, mode: 'R', ...extra });
    assert.ok(r.ok, `${stack}: ${r.reason}`);
    assert.ok(Math.abs(r.v0 / bulk.v0 - 1) < 2e-3, `${stack} v0 ${r.v0} vs bulk ${bulk.v0}`);
    assert.ok(Math.abs(r.K2 / bulk.K2 - 1) < 0.05, `${stack} K2 ${r.K2} vs bulk ${bulk.K2}`);
  }
});

test('stack velocity is self-consistent with h/lambda = h f0 / v and K2 > 0', () => {
  const r = stackSAW(o128, { stack: 'lnos', hLN: 400e-9, f0, mode: 'R' });
  assert.ok(r.ok);
  assert.ok(Math.abs(r.hl - (400e-9 * f0) / r.v0) < 1e-9, `hl ${r.hl}`);
  assert.ok(r.K2 > 0 && r.vm < r.v0, `K2 ${r.K2}`);
  assert.ok(r.v0 < r.vlim, 'guided below the substrate bulk limit');
});
