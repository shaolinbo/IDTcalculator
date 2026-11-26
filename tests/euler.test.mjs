import test from 'node:test';
import assert from 'node:assert/strict';
import { comsolEuler, toolEuler, rotZXZ, zxzAngles } from '../src/saw/euler.js';
import { axesFromNP, axesFromEuler } from '../src/saw/tensor.js';
import { orientation } from '../src/materials.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// Angles are rounded to 1e-9 deg, so matrices agree to about 1e-11.
const sameMatrix = (P, Q, msg) => P.forEach((r, i) => r.forEach((x, j) => close(x, Q[i][j], 1e-9, `${msg} [${i}][${j}]`)));

// Deterministic pseudo-random unit vectors.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
const unit = (v) => { const r = Math.hypot(...v); return v.map((x) => x / r); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function randomOrientation() {
  const n = unit([rnd(), rnd(), rnd()]);
  const p = unit(cross(n, [rnd(), rnd(), rnd()]));
  return axesFromNP(n, p);
}

test('COMSOL angles for 128°Y-X match COMSOL\'s own example: (0, -38°, 0) in 3D, (0, -128°, 0) in 2D', () => {
  const c = comsolEuler(orientation('128Y').A);
  assert.deepEqual([c.d3.alpha, c.d3.beta, c.d3.gamma], [0, -38, 0]);
  assert.deepEqual([c.d2.alpha, c.d2.beta, c.d2.gamma], [0, -128, 0]);
});

test('COMSOL 3D axes: crystal axes are the columns of A; x = SAW, z = surface normal', () => {
  const A = orientation('Xcut', { psi: 120 }).A;
  const c = comsolEuler(A);
  // Global x (SAW) and z (normal) in crystal axes are rows of R^T, i.e. components of X, Y, Z.
  const xG = [c.d3.axes.X[0], c.d3.axes.Y[0], c.d3.axes.Z[0]];
  const zG = [c.d3.axes.X[2], c.d3.axes.Y[2], c.d3.axes.Z[2]];
  xG.forEach((v, i) => close(v, A[0][i], 1e-12, 'x = propagation'));
  zG.forEach((v, i) => close(v, A[2][i], 1e-12, 'z = normal'));
  // 2D: y = normal.
  const yG2 = [c.d2.axes.X[1], c.d2.axes.Y[1], c.d2.axes.Z[1]];
  yG2.forEach((v, i) => close(v, A[2][i], 1e-12, '2D y = normal'));
});

test('Z-X-Z angles rebuild the rotation, including beta = 0 and 180°', () => {
  const cases = [...Array.from({ length: 200 }, randomOrientation),
    orientation('Zcut', { psi: 30 }).A, axesFromNP([0, 0, -1], [Math.cos(0.7), Math.sin(0.7), 0])];
  for (const A of cases) {
    const c = comsolEuler(A);
    sameMatrix(rotZXZ(c.d3.alpha, c.d3.beta, c.d3.gamma), A, '3D');
    const R2 = [[1, 0, 0], [0, 0, 1], [0, -1, 0]].map((r) => [0, 1, 2].map((j) => r[0] * A[0][j] + r[1] * A[1][j] + r[2] * A[2][j]));
    sameMatrix(rotZXZ(c.d2.alpha, c.d2.beta, c.d2.gamma), R2, '2D');
    const t = toolEuler(A);
    sameMatrix(axesFromEuler(t.lambda, t.mu, t.theta), A, 'tool Euler');
  }
});

test('this tool\'s Euler angles: 128°Y-X = (0, 38°, 0); round trip for given angles', () => {
  const t = toolEuler(orientation('128Y').A);
  assert.deepEqual([t.lambda, t.mu, t.theta], [0, 38, 0]);
  const e = zxzAngles(rotZXZ(25, 70, -40));
  assert.deepEqual([e.alpha, e.beta, e.gamma].map((x) => Math.round(x * 1e6) / 1e6), [25, 70, -40]);
});

test('128°Y and rotated Y-cuts with propagation angle phi equal Euler (0, rot - 90°, phi)', () => {
  for (const phi of [0, 25, 90, -60]) {
    sameMatrix(orientation('128Y', { psi: phi }).A, axesFromEuler(0, 38, phi), `128Y phi ${phi}`);
    sameMatrix(orientation('RY', { rot: 41, psi: phi }).A, axesFromEuler(0, -49, phi), `RY 41 phi ${phi}`);
  }
  // phi = 0 is X propagation.
  orientation('128Y', { psi: 0 }).p.forEach((x, i) => close(x, [1, 0, 0][i], 1e-15, 'p along X'));
});
