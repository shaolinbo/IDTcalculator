import test from 'node:test';
import assert from 'node:assert/strict';
import { LN_KUSHIBIKI, LN_ANDRUSHCHAK } from '../src/saw/constants.js';
import { crystal, solveOrientation, polyRoots } from '../src/saw/solver.js';
import { axesFromNP, axesFromEuler, rotateTensor } from '../src/saw/tensor.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const rel = (a, b, tol, msg) => close(a, b, tol * Math.abs(b), msg);
const d = Math.PI / 180;
const LN = crystal(LN_KUSHIBIKI);
const A128 = axesFromNP([0, Math.cos(128 * d), Math.sin(128 * d)], [1, 0, 0]);
const AYZ = axesFromNP([0, 1, 0], [0, 0, 1]);

test('polynomial roots', () => {
  // (x^2 + 1)(x - 2)(x + 3) = x^4 + x^3 - 5x^2 + x - 6
  const { zr, zi } = polyRoots([-6, 1, -5, 1, 1]);
  const rnd = (x) => Math.round(x * 1e9) / 1e9;
  const roots = Array.from(zr, (r, i) => [rnd(r), rnd(zi[i])]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  [[-3, 0], [0, -1], [0, 1], [2, 0]].forEach(([r, i], k) => {
    close(roots[k][0], r, 1e-12, 'root re'); close(roots[k][1], i, 1e-12, 'root im');
  });
});

test('tensor rotation keeps invariants', () => {
  const A = axesFromEuler(23, 61, -37);
  const tr = (eps) => eps[0] + eps[4] + eps[8];
  close(tr(rotateTensor(LN.eps, A, 2)), tr(LN.eps), 1e-24, 'trace of eps');
  const r = rotateTensor(rotateTensor(LN.c, A, 4), A.map((_, i) => A.map((row) => row[i])), 4);
  LN.c.forEach((x, i) => close(r[i], x, 1e-3, `c round trip ${i}`));
});

test('isotropic half-space: Rayleigh velocity for Poisson ratio 1/4', () => {
  // lambda = mu; c66 differs only to split the SH partial wave from SV (sagittal plane unaffected).
  const mu = 0.5e11, rho = 3000;
  const iso = crystal({ rho, c11: 3 * mu, c12: mu, c13: mu, c14: 0, c33: 3 * mu, c44: mu, c66: 1.2 * mu,
    e15: 0, e22: 0, e31: 0, e33: 0, eps11: 5, eps33: 5 });
  const r = solveOrientation(iso, axesFromNP([0, 0, 1], [1, 0, 0]), { pfa: false });
  const vt = Math.sqrt(mu / rho);
  rel(r.v0, vt * Math.sqrt(2 - 2 / Math.sqrt(3)), 1e-9, 'v_R');
  rel(r.vm, r.v0, 1e-9, 'no piezoelectric shift');
  close(r.epsInf, 6, 1e-6, 'eps_inf = 1 + eps_r');
  rel(r.vlim, vt, 1e-8, 'bulk limit = shear velocity');
});

test('non-piezoelectric LiNbO3: K2 = 0 and eps_inf from the dielectric tensor alone', () => {
  const np = crystal({ ...LN_KUSHIBIKI, e15: 0, e22: 0, e31: 0, e33: 0 });
  const r = solveOrientation(np, A128, { pfa: false });
  rel(r.vm, r.v0, 1e-9, 'v0 = vm');
  // 1 + sqrt(e11 e33' - e13'^2) in device axes: x1 = X, x3 = n
  const n = A128[2], e11 = 44.9, e33 = 26.7;
  const enn = e11 * (n[0] ** 2 + n[1] ** 2) + e33 * n[2] ** 2;
  close(r.epsInf, 1 + Math.sqrt(e11 * enn), 1e-8, 'eps_inf');
});

test('LiNbO3 Y-Z and 128°Y-X against Datta (1986) and Morgan (2007)', () => {
  // Datta's table (via Kawada et al. 2025): Y-Z 3488 / 3408 m/s, 4.6 %; 128°Y-X 3996 / 3884 m/s, 5.6 %.
  // Tolerances reflect the spread between material-constant sets, not solver error.
  const yz = solveOrientation(LN, AYZ);
  rel(yz.v0, 3488, 0.003, 'YZ v0'); rel(yz.vm, 3408, 0.003, 'YZ vm'); rel(yz.K2, 0.046, 0.10, 'YZ K2');
  close(yz.epsInf, 46, 0.5, 'YZ eps_inf (Morgan: 46)');
  close(yz.pfa, 0, 1e-6, 'YZ pfa (mirror symmetry)');
  const a = solveOrientation(LN, A128);
  rel(a.v0, 3996, 0.006, '128 v0'); rel(a.vm, 3884, 0.006, '128 vm'); rel(a.K2, 0.056, 0.06, '128 K2');
  close(a.epsInf, 56, 1, '128 eps_inf (Morgan: 56)');
  close(a.pfa, 0, 1e-6, '128 pfa (mirror symmetry)');
});

test('LiNbO3 Y-Z and 128°Y-X with the default constants (Andrushchak 2009, rho = 4700) against Datta (1986)', () => {
  // The adjusted density lowers all velocities by 0.77 % from the paper's measured 4628 kg/m^3.
  const ln = crystal(LN_ANDRUSHCHAK);
  const yz = solveOrientation(ln, AYZ, { pfa: false });
  rel(yz.v0, 3488, 0.01, 'YZ v0'); rel(yz.vm, 3408, 0.01, 'YZ vm'); rel(yz.K2, 0.046, 0.10, 'YZ K2');
  const a = solveOrientation(ln, A128, { pfa: false });
  rel(a.v0, 3996, 0.01, '128 v0'); rel(a.vm, 3884, 0.01, '128 vm'); rel(a.K2, 0.056, 0.10, '128 K2');
});

test('orientation invariances: Euler angles, opposite face, reversed propagation', () => {
  const ref = solveOrientation(LN, A128, { pfa: false });
  for (const [name, A] of [
    ['Euler (0, 38, 0)', axesFromEuler(0, 38, 0)],
    ['opposite face', axesFromNP([0, -Math.cos(128 * d), -Math.sin(128 * d)], [1, 0, 0])],
    ['reversed propagation', axesFromNP([0, Math.cos(128 * d), Math.sin(128 * d)], [-1, 0, 0])],
  ]) {
    const r = solveOrientation(LN, A, { pfa: false });
    rel(r.v0, ref.v0, 1e-9, `${name} v0`); rel(r.vm, ref.vm, 1e-9, `${name} vm`);
    close(r.epsInf, ref.epsInf, 1e-7, `${name} eps_inf`);
  }
});

test('Z-cut: 3-fold axis and mirror symmetry of v0(psi)', () => {
  const v = (psi) => solveOrientation(LN, axesFromNP([0, 0, 1], [Math.cos(psi * d), Math.sin(psi * d), 0]), { pfa: false }).v0;
  const v17 = v(17);
  rel(v(137), v17, 1e-9, '120° period');
  rel(v(163), v17, 1e-9, 'mirror about Y (psi -> 180° - psi)');
});

test('no spurious roots where partial waves coalesce (rotated Y-cut, 59-61° and 75-78°)', () => {
  // Before normalizing by det(V), theta = 60, 76, 77 returned v0 = vm off the smooth curve.
  const v = (th) => solveOrientation(LN, axesFromNP([0, Math.cos(th * d), Math.sin(th * d)], [1, 0, 0]), { pfa: false });
  for (const th of [60, 76, 77]) {
    const a = v(th - 1).v0, b = v(th).v0, c = v(th + 1).v0;
    assert.ok(Math.abs(a - 2 * b + c) / b < 1e-3, `smooth v0 at ${th}°: ${a}, ${b}, ${c}`);
    assert.ok(b > Math.min(a, c) && b < Math.max(a, c), `v0 at ${th}° lies between its neighbours`);
  }
});

test('metallized surface with a second surface wave: vm is the Rayleigh-type (slowest) root', () => {
  // With this alternative constant set (close to Warner 1967), X-cut at psi = 18-25° has a second
  // shorted-surface root just below the bulk limit (about 4038 m/s at 25°). The old search took it.
  const alt = crystal({ rho: 4700, c11: 2.03e11, c12: 0.53e11, c13: 0.75e11, c14: 0.09e11, c33: 2.45e11,
    c44: 0.60e11, c66: 0.75e11, e15: 3.7, e22: 2.5, e31: 0.2, e33: 1.3, eps11: 44, eps33: 29 });
  const v = (psi) => solveOrientation(alt, axesFromNP([1, 0, 0], [0, Math.cos(psi * d), Math.sin(psi * d)]), { pfa: false });
  for (const psi of [18, 21, 25]) {
    const r = v(psi), a = v(psi - 1), b = v(psi + 1);
    assert.ok(r.vm < r.v0 && r.K2 > 0, `psi ${psi}°: vm ${r.vm} < v0 ${r.v0}`);
    assert.ok(Math.abs(a.vm - 2 * r.vm + b.vm) / r.vm < 1e-3, `smooth vm at ${psi}°: ${a.vm}, ${r.vm}, ${b.vm}`);
  }
});

test('power-flow angle matches the slope of v0 across directions', () => {
  // X-cut, psi measured from Y toward Z (rotation about +x3 = +X).
  const A = (psi) => axesFromNP([1, 0, 0], [0, Math.cos(psi * d), Math.sin(psi * d)]);
  const r = solveOrientation(LN, A(30));
  const h = 1;
  const vp = solveOrientation(LN, A(30 + h), { pfa: false }).v0, vn = solveOrientation(LN, A(30 - h), { pfa: false }).v0;
  const pfa = Math.atan((vp - vn) / (2 * h * d * r.v0)) / d;
  close(r.pfa, pfa, 0.01, 'pfa (deg)');
});
