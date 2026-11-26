// Layered structures (src/saw/layered.js): exact limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStructure, findModes, epsInf, boundaryDet } from '../src/saw/layered.js';
import { crystal, solveOrientation, prepare, strohN, partialWaves } from '../src/saw/solver.js';
import { LN_ANDRUSHCHAK } from '../src/saw/constants.js';
import { orientation } from '../src/materials.js';
import { axesFromNP } from '../src/saw/tensor.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const A128 = orientation('128Y').A, Z = axesFromNP([0, 0, 1], [1, 0, 0]);
const iso = (mu, rho) => ({ rho, c11: 3 * mu, c12: mu, c13: mu, c14: 0, c33: 3 * mu, c44: mu, c66: mu,
  e15: 0, e22: 0, e31: 0, e33: 0, eps11: 5, eps33: 5 });

test('Stroh matrix: every decaying partial-wave state is an eigenvector with eigenvalue beta', () => {
  const ctx = prepare(crystal(LN_ANDRUSHCHAK), A128), v = 3500, N = strohN(ctx, v), pw = partialWaves(ctx, v);
  pw.states.forEach(({ re, im }, r) => {
    const [br, bi] = pw.betas[r];
    for (let i = 0; i < 8; i++) {
      let a = 0, b = 0;
      for (let j = 0; j < 8; j++) { a += N[i * 8 + j] * re[j]; b += N[i * 8 + j] * im[j]; }
      close(a, br * re[i] - bi * im[i], 1e-12, `re ${r},${i}`); close(b, br * im[i] + bi * re[i], 1e-12, `im ${r},${i}`);
    }
  });
});

test('LN film on LN of the same cut equals bulk LN at any thickness (v0, vm, eps_inf)', () => {
  const bulk = solveOrientation(crystal(LN_ANDRUSHCHAK), A128, { pfa: false });
  for (const hl of [0.05, 0.3, 1]) {
    const S = makeStructure({ layers: [{ material: LN_ANDRUSHCHAK, A: A128, hl }], substrate: { material: LN_ANDRUSHCHAK, A: A128 } });
    const o = findModes(S, 'open').find((m) => m.type === 'R'), s = findModes(S, 'short').find((m) => m.type === 'R');
    close(o.v, bulk.v0, 1e-6 * bulk.v0, `v0 at h/lambda ${hl}`);
    close(s.v, bulk.vm, 1e-6 * bulk.vm, `vm at h/lambda ${hl}`);
    close(epsInf(S, S.sub.vlim), bulk.epsInf, 1e-6 * bulk.epsInf, `eps_inf at h/lambda ${hl}`);
  }
});

test('isotropic layer on isotropic substrate: SH mode equals the analytic Love-wave velocity', () => {
  const mu2 = 0.5e11, rho2 = 3000, v2 = Math.sqrt(mu2 / rho2), mu1 = 0.2e11, rho1 = 4000, v1 = Math.sqrt(mu1 / rho1);
  for (const kh of [0.5, 1, 2]) {
    const S = makeStructure({ layers: [{ material: iso(mu1, rho1), A: Z, hl: kh / (2 * Math.PI) }], substrate: { material: iso(mu2, rho2), A: Z } });
    const F = (v) => { const q1 = Math.sqrt((v * v) / (v1 * v1) - 1), p2 = Math.sqrt(1 - (v * v) / (v2 * v2)); return Math.tan(kh * q1) - (mu2 * p2) / (mu1 * q1); };
    let lo = v1 * (1 + 1e-9), hi = Math.min(v2, v1 * Math.sqrt(1 + (Math.PI / (2 * kh)) ** 2)) * (1 - 1e-12);
    for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (F(lo) * F(m) <= 0) hi = m; else lo = m; }
    const sh = findModes(S, 'open').find((m) => m.type === 'SH');
    close(sh.v, (lo + hi) / 2, 1e-6 * sh.v, `Love velocity at kh ${kh}`);
  }
});

test('isotropic plate: SH0 = shear velocity, S0 -> plate velocity, A0 -> thin-plate flexural limit, SH1 cutoff', () => {
  const mu = 0.5e11, rho = 3000, vt = Math.sqrt(mu / rho), nu = 0.25, E = 2 * mu * (1 + nu), vp = Math.sqrt(E / (rho * (1 - nu * nu)));
  const modes = (kh) => findModes(makeStructure({ layers: [{ material: iso(mu, rho), A: Z, hl: kh / (2 * Math.PI) }], substrate: null }), 'open', { vRef: vt });
  const thin = modes(0.01);
  close(thin.find((m) => m.sym === 'SH').v, vt, 1e-6 * vt, 'SH0');
  close(thin.find((m) => m.sym === 'S').v, vp, 2e-5 * vp, 'S0 at kh 0.01');
  close(thin.find((m) => m.sym === 'A').v, (0.01 * vp) / Math.sqrt(12), 1e-3 * vp * 0.01, 'A0 at kh 0.01');
  const thick = modes(2).filter((m) => m.sym === 'SH');
  close(thick[1].v, vt * Math.sqrt(1 + (Math.PI / 2) ** 2), 1e-6 * vt, 'SH1 at kh 2');
});

test('plate and stack determinants are finite below the bulk limit and NaN above it', () => {
  const S = makeStructure({ layers: [{ material: LN_ANDRUSHCHAK, A: A128, hl: 0.1 }], substrate: { material: LN_ANDRUSHCHAK, A: A128 } });
  assert.ok(Number.isFinite(boundaryDet(S, 0.9 * S.sub.vlim)));
  assert.ok(Number.isNaN(boundaryDet(S, 1.01 * S.sub.vlim)));
});
