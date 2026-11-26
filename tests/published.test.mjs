// Comparisons with published SAW data. Each data set is a JSON file in tests/data/
// that records its source, whether it is measured or simulated, and the angle convention.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LN_ANDRUSHCHAK } from '../src/saw/constants.js';
import { crystal, solveOrientation } from '../src/saw/solver.js';
import { orientation } from '../src/materials.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));
const argmin = (rows, f) => rows.reduce((best, r) => (f(r) < f(best) ? r : best));

test('X-cut LiNbO3 vs Shao et al., Nat. Electron. 2022, Extended Data Fig. 1 (simulated)', () => {
  const data = load('shao2022_ned_fig1_xcut.json');
  // Default constants: Andrushchak smp-1 with rho = 4700 kg/m^3.
  const LN = crystal(LN_ANDRUSHCHAK);
  // Paper angle theta from Z corresponds to X-cut psi = 90 + theta here.
  const ours = new Map(data.velocity.map(([th]) => [th, solveOrientation(LN, orientation('Xcut', { psi: 90 + th }).A, { pfa: false })]));
  for (const [th, v0, vm] of data.velocity) {
    const r = ours.get(th);
    assert.ok(r.ok, `solved at ${th}°`);
    assert.ok(Math.abs(r.v0 - v0) < 2, `v0 at ${th}°: ${r.v0.toFixed(2)} vs ${v0}`);
    assert.ok(Math.abs(r.vm - vm) < 2, `vm at ${th}°: ${r.vm.toFixed(2)} vs ${vm}`);
    const k2 = (200 * (v0 - vm)) / v0;
    assert.ok(Math.abs(100 * r.K2 - k2) < 0.12, `K2 at ${th}°: ${(100 * r.K2).toFixed(3)} vs ${k2.toFixed(3)} %`);
  }
  // Features named in the paper: slowest direction at 30° (the waveguide), K2 = 0 near -40°.
  assert.equal(argmin(data.velocity, (r) => ours.get(r[0]).v0)[0], 30, 'slowest v0 direction');
  assert.equal(argmin(data.velocity, (r) => ours.get(r[0]).vm)[0], 30, 'slowest vm direction');
  assert.equal(argmin(data.velocity, (r) => ours.get(r[0]).K2)[0], -40, 'K2 minimum');
  assert.equal(argmin(data.k2.filter(([th]) => Math.abs(th) < 90), (r) => r[1])[0], -40, 'paper K2 minimum');
});
