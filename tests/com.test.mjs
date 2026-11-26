import test from 'node:test';
import assert from 'node:assert/strict';
import { idtPMatrix, comParams } from '../src/com.js';
import { idtAdmittance } from '../src/impulse.js';
import { DEFAULTS, resolve, evalAt, simulate } from '../src/model.js';
import { cx, sub, mul, div, abs, abs2 } from '../src/complex.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const f0 = 220e6, v = 3963, lambda = v / f0, K2 = 0.0537, Cs = 4.844e-10, W = 500e-6;
const pm = (f, { Np = 22, rs = 0, gamma = 0 } = {}) => {
  const c = comParams({ K2, Cs, W, f0, lambda, rs });
  return idtPMatrix({ delta: cx((2 * Math.PI * (f - f0)) / v, -gamma), kappa: c.kappa, alpha: c.alpha, C: c.C, omega: 2 * Math.PI * f, L: Np * lambda });
};
const FREQS = [190e6, 205e6, 214e6, 218.6e6, 219.7e6, 220e6, 221.3e6, 228e6, 250e6];

test('COM without reflection equals the impulse model (Ga, Ba and Ct)', () => {
  for (const f of FREQS) {
    const Y = idtAdmittance(f, { f0, Np: 22, K2, Cs, W }).Y, P33 = pm(f).P33;
    assert.ok(abs(sub(P33, Y)) < 1e-12 * abs(Y), `P33 at ${f / 1e6} MHz`);
  }
});

test('COM P-matrix: lossless unitarity, reciprocity and power balance', () => {
  for (const rs of [-0.03, 0.015]) for (const f of FREQS) {
    const P = pm(f, { rs });
    close(abs2(P.P11) + abs2(P.P21), 1, 1e-12, 'column 1 unitary');
    close(abs2(P.P12) + abs2(P.P22), 1, 1e-12, 'column 2 unitary');
    assert.ok(abs(sub(P.P12, P.P21)) < 1e-12, 'P12 = P21');
    assert.ok(abs(sub(P.P31, mul(cx(-2, 0), P.P13))) < 1e-12 * abs(P.P13), 'P31 = -2 P13');
    assert.ok(abs(sub(P.P32, mul(cx(-2, 0), P.P23))) < 1e-12 * abs(P.P23), 'P32 = -2 P23');
    close(P.P33.re, abs2(P.P13) + abs2(P.P23), 1e-12 * P.P33.re, 'Re P33 = |P13|^2 + |P23|^2 (radiated power)');
  }
});

/** Numerical exp of a complex 4x4 matrix (scaling and squaring, Taylor series). */
function expm4(Ar, Ai) {
  const mulc = (Xr, Xi, Yr, Yi) => {
    const Zr = new Float64Array(16), Zi = new Float64Array(16);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) {
      Zr[i * 4 + j] += Xr[i * 4 + k] * Yr[k * 4 + j] - Xi[i * 4 + k] * Yi[k * 4 + j];
      Zi[i * 4 + j] += Xr[i * 4 + k] * Yi[k * 4 + j] + Xi[i * 4 + k] * Yr[k * 4 + j];
    }
    return [Zr, Zi];
  };
  let nrm = 0;
  for (let i = 0; i < 16; i++) nrm = Math.max(nrm, 4 * Math.hypot(Ar[i], Ai[i]));
  const s = Math.max(0, Math.ceil(Math.log2(nrm / 0.25)));
  const Br = Ar.map((x) => x / 2 ** s), Bi = Ai.map((x) => x / 2 ** s);
  let Er = new Float64Array(16), Ei = new Float64Array(16), Tr = new Float64Array(16), Ti = new Float64Array(16);
  for (let i = 0; i < 4; i++) { Er[i * 5] = 1; Tr[i * 5] = 1; }
  for (let k = 1; k < 30; k++) {
    [Tr, Ti] = mulc(Tr, Ti, Br, Bi);
    Tr = Tr.map((x) => x / k); Ti = Ti.map((x) => x / k);
    for (let q = 0; q < 16; q++) { Er[q] += Tr[q]; Ei[q] += Ti[q]; }
  }
  for (let k = 0; k < s; k++) [Er, Ei] = mulc(Er, Ei, Er, Ei);
  return [Er, Ei];
}

test('closed-form P-matrix agrees with a numerical integration of the COM equations', () => {
  for (const [f, rs, gamma] of [[219.7e6, -0.02, 0], [221e6, 0.015, 3], [230e6, -0.03, 1], [220e6, 0, 0.5]]) {
    const c = comParams({ K2, Cs, W, f0, lambda, rs }), L = 22 * lambda, w = 2 * Math.PI * f;
    const delta = cx((2 * Math.PI * (f - f0)) / v, -gamma);
    const P = pm(f, { rs, gamma });
    // y = (R, S, I, V); dy/dx = A y with A = j * (...)
    const Ar = new Float64Array(16), Ai = new Float64Array(16);
    const setj = (r, col, re, im) => { Ar[r * 4 + col] = -im * L; Ai[r * 4 + col] = re * L; };
    setj(0, 0, -delta.re, -delta.im); setj(0, 1, c.kappa, 0); setj(0, 3, c.alpha, 0);
    setj(1, 0, -c.kappa, 0); setj(1, 1, delta.re, delta.im); setj(1, 3, -c.alpha, 0);
    setj(2, 0, -2 * c.alpha, 0); setj(2, 1, -2 * c.alpha, 0); setj(2, 3, w * c.C, 0);
    const [Tr, Ti] = expm4(Ar, Ai);
    const T = (r, col) => cx(Tr[r * 4 + col], Ti[r * 4 + col]);
    const P33 = sub(T(2, 3), div(mul(T(2, 1), T(1, 3)), T(1, 1)));
    const P23 = sub(T(0, 3), div(mul(T(0, 1), T(1, 3)), T(1, 1)));
    assert.ok(abs(sub(P33, P.P33)) < 1e-10 * abs(P.P33), `P33 at ${f / 1e6} MHz, r_s ${rs}`);
    assert.ok(abs(sub(P23, P.P23)) < 1e-10 * abs(P.P23), `P23 at ${f / 1e6} MHz, r_s ${rs}`);
  }
});

test('long grating: stopband at f0 (1 ± |r_s|/pi); the coupled edge follows the sign of r_s', () => {
  const rs = 0.02, edge = rs / Math.PI;
  for (const x of [-0.5, 0, 0.5]) assert.ok(abs(pm(f0 * (1 + x * edge), { Np: 300, rs: -rs }).P11) > 0.99, `in stopband ${x}`);
  for (const x of [-2, 2]) assert.ok(abs(pm(f0 * (1 + x * edge), { Np: 300, rs: -rs }).P11) < 0.5, `outside stopband ${x}`);
  // Radiation conductance of a long IDT peaks at the coupled edge: lower for r_s < 0, upper for r_s > 0.
  const peak = (r) => {
    let best = null;
    for (let i = -300; i <= 300; i++) {
      const f = f0 * (1 + (i / 100) * edge), g = pm(f, { Np: 100, rs: r }).P33.re;
      if (!best || g > best.g) best = { f, g };
    }
    return best.f;
  };
  assert.ok(peak(-rs) < f0 && peak(rs) > f0, `peaks ${peak(-rs)}, ${peak(rs)}`);
});

test('COM delay line: equals the impulse model at r_s = 0; passive and reciprocal with reflections', () => {
  const base = resolve({ ...DEFAULTS, pads: false, fingerR: false });
  for (const [Np1, Np2] of [[22, 22], [22, 15], [21, 22]]) for (const regen of [true, false]) for (const f of [212e6, 220e6, 226e6]) {
    const a = evalAt(f, { ...base, Np1, Np2 }, undefined, regen), b = evalAt(f, { ...base, Np1, Np2, idtModel: 'com', rs: 0 }, undefined, regen);
    for (const k of ['S11', 'S21', 'S22']) assert.ok(abs(sub(a[k], b[k])) < 1e-12, `${k} Np ${Np1}/${Np2} regen ${regen}`);
  }
  const p = resolve({ ...DEFAULTS, idtModel: 'com', rs: -0.02, Cft: 2e-15, match: 'seriesL', Lm1: 20e-9, Lm2: 20e-9, lossDbPerM: 500 });
  for (const q of simulate(p).pts) {
    assert.ok(abs2(q.S11) + abs2(q.S21) <= 1 + 1e-9 && abs2(q.S22) + abs2(q.S12) <= 1 + 1e-9, `passive at ${q.f}`);
    assert.ok(abs(sub(q.S12, q.S21)) < 1e-12, `reciprocal at ${q.f}`);
  }
});
