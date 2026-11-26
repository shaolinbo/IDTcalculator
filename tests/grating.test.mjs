// Periodic-grating finite-element unit cell (src/saw/grating.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gratingEdges, gratingCOM } from '../src/saw/grating.js';
import { LN_ANDRUSHCHAK } from '../src/saw/constants.js';
import { crystal, solveOrientation, prepare, isoFilm, filmVelocity } from '../src/saw/solver.js';
import { orientation, METALS } from '../src/materials.js';

const A = orientation('128Y').A;
const pw = solveOrientation(crystal(LN_ANDRUSHCHAK), A, { pfa: false });
const ppm = (a, b) => Math.abs(a / b - 1) * 1e6;

test('grating cell without strips gives the free-surface velocity v0 (no stopband)', () => {
  // Without strips the default mesh (res 0.75) is not graded; its error is about 100 ppm (0.4 m/s).
  const fp = gratingEdges(LN_ANDRUSHCHAK, A, null, { eta: 0, vGuess: pw.v0 }).fp;
  assert.ok(ppm(2 * fp[0], pw.v0) < 150 && ppm(2 * fp[1], pw.v0) < 150, `2fp ${2 * fp[0]}, ${2 * fp[1]} vs v0 ${pw.v0}`);
});

test('fully metallized cell gives vm (h = 0) and the continuous-film velocity (h/lambda = 2 %)', () => {
  const fm = gratingEdges(LN_ANDRUSHCHAK, A, METALS.Al, { eta: 1, hp: 0, vGuess: pw.vm }).fp;
  assert.ok(ppm(2 * fm[0], pw.vm) < 100, `2fp ${2 * fm[0]} vs vm ${pw.vm}`);
  const vf = filmVelocity(prepare(crystal(LN_ANDRUSHCHAK), A), isoFilm({ rho: 2699, E: 70e9, nu: 0.35 }), 2 * Math.PI * 0.02);
  const ff = gratingEdges(LN_ANDRUSHCHAK, A, METALS.Al, { eta: 1, hp: 0.04, vGuess: vf }).fp;
  assert.ok(ppm(2 * ff[0], vf) < 100, `2fp ${2 * ff[0]} vs film ${vf}`);
});

test('128°Y, Al strips, h = 0: r_s about -1.9 %, lower edge couples, uncoupled edge unchanged when opened', () => {
  const g = gratingCOM(LN_ANDRUSHCHAK, A, METALS.Al, { eta: 0.5, hOverLambda: 0, vGuess: 3900 });
  assert.ok(g.rs < -0.0185 && g.rs > -0.0200, `r_s ${g.rs}`);
  assert.equal(g.coupled, 'lower');
  // The upper shorted edge reappears in the open grating.
  assert.ok(Math.min(...g.edgesOpen.map((o) => Math.abs(o - g.edgesShort[1]))) < 1e-6 * g.edgesShort[1], 'uncoupled edge shared');
  assert.ok(g.v > pw.vm && g.v < pw.v0, `v ${g.v} between vm and v0`);
});

test('128°Y, Al strips: reflection changes sign between h/lambda = 2 % and 3 %', () => {
  const r2 = gratingCOM(LN_ANDRUSHCHAK, A, METALS.Al, { eta: 0.5, hOverLambda: 0.02, vGuess: 3870 }).rs;
  const r3 = gratingCOM(LN_ANDRUSHCHAK, A, METALS.Al, { eta: 0.5, hOverLambda: 0.03, vGuess: 3850 }).rs;
  assert.ok(r2 < 0 && r3 > 0, `r_s ${r2} at 2 %, ${r3} at 3 %`);
});

test('mesh convergence: default and doubled mesh agree within 0.05 % in r_s and 3 m/s in v', () => {
  const edges = (res) => gratingEdges(LN_ANDRUSHCHAK, A, METALS.Al, { eta: 0.5, hp: 0.02, res, vGuess: 3880 }).fp;
  const rsOf = ([a, b]) => (Math.PI * (b - a)) / (a + b);
  const e1 = edges(0.75), e2 = edges(1.5);
  assert.ok(Math.abs(rsOf(e1) - rsOf(e2)) < 5e-4, `|r_s| ${rsOf(e1)} vs ${rsOf(e2)}`);
  assert.ok(Math.abs(e1[0] + e1[1] - e2[0] - e2[1]) < 3, `v ${e1[0] + e1[1]} vs ${e2[0] + e2[1]}`);
});
