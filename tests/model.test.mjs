import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, resolve, derive, evalAt, simulate, sweepNp, toTouchstone, band3dB, nullBand } from '../src/model.js';
import { idtAdmittance, apertureForReZ, apertureForAbsZ } from '../src/impulse.js';
import { orientation, csDatta } from '../src/materials.js';
import { ellipK, padCapacitance } from '../src/pads.js';
import { abs, abs2, dB, inv } from '../src/complex.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// Regression case (impulse model, bare IDTs, single transit):
// Rin = 50, f0 = 0.22 GHz, Np = 22, Cs = 3.61 pF/cm, K2 = 0.055, W = 0.05 cm.
// Expected: Z = 83.19766021326612 - 54.00271862021832 i, IL = 7.899505494267967 dB.
const REF = {
  ...DEFAULTS, K2: 0.055, Cs: 3.61e-10, Cpad: 0, f0: 220e6, Np1: 22, Np2: 22, W: 500e-6,
  fingerR: false, pads: false, Cft: 0, match: 'none', Z0: 50, lossDbPerM: 0,
};

test('regression case: IDT impedance at f0', () => {
  const r = evalAt(REF.f0, REF, derive(REF), false);
  close(r.Zidt1.re, 83.19766021326612, 1e-9, 'Re Z');
  close(r.Zidt1.im, -54.00271862021832, 1e-9, 'Im Z');
  close(r.Zin1.re, 83.19766021326612, 1e-9, 'Re Zin (no parasitics, single transit)');
  close(r.Zin1.im, -54.00271862021832, 1e-9, 'Im Zin');
});

test('regression case: insertion loss of the two-IDT line at f0', () => {
  const r = evalAt(REF.f0, REF, derive(REF), false);
  close(-dB(r.S21), 7.899505494267967, 1e-9, 'IL');
});

test('W(N) formula gives Re Z = Rin; |Z| aperture gives |Z| = Rin and minimum IL', () => {
  const q = { f0: REF.f0, Np: 22, K2: REF.K2, Cs: REF.Cs };
  const w1 = apertureForReZ(q, 50);
  close(inv(idtAdmittance(REF.f0, { ...q, W: w1 }).Y).re, 50, 1e-9, 'Re Z at W_ReZ');
  const w2 = apertureForAbsZ(q, 50);
  close(abs(inv(idtAdmittance(REF.f0, { ...q, W: w2 }).Y)), 50, 1e-9, '|Z| at W_absZ');
  const il = (W) => { const p = { ...REF, W }; return -dB(evalAt(p.f0, p, derive(p), false).S21); };
  assert.ok(il(w2) < il(w2 * 1.05) && il(w2) < il(w2 * 0.95), 'IL is minimum at W_absZ');
  close(w2 * 1e6, 991.9, 0.5, 'W_absZ in um for the regression case');
  close(il(w2), 6.818, 0.002, 'IL at W_absZ');
});

test('Ba is zero at f0 and odd about f0', () => {
  const q = { f0: 1e9, Np: 10, K2: 0.05, Cs: 4e-10, W: 100e-6 };
  close(idtAdmittance(1e9, q).Ba, 0, 1e-15, 'Ba(f0)');
  const a = idtAdmittance(1.013e9, q).Ba, b = idtAdmittance(0.987e9, q).Ba;
  close(a, -b, 1e-12 * Math.abs(a), 'odd symmetry');
});

test('passive and reciprocal with all parasitics and regeneration on', () => {
  const p = resolve({ ...DEFAULTS, Cft: 5e-15, Rlead: 1, Llead: 0.2e-9, match: 'seriesL', Lm1: 100e-9, Lm2: 120e-9, lossDbPerM: 300 });
  const res = simulate({ ...p, nPts: 401 });
  for (const r of res.pts) {
    assert.ok(abs2(r.S11) + abs2(r.S21) <= 1 + 1e-12, `port 1 power at ${r.f}`);
    assert.ok(abs2(r.S22) + abs2(r.S12) <= 1 + 1e-12, `port 2 power at ${r.f}`);
    close(r.S12.re, r.S21.re, 1e-12, 'S12 = S21 (re)');
    close(r.S12.im, r.S21.im, 1e-12, 'S12 = S21 (im)');
  }
});

test('auto tuning L cancels the reactance of each IDT on its own', async () => {
  const { autoMatch } = await import('../src/model.js');
  // Huge propagation loss decouples the IDTs, so each port sees its own IDT only.
  const p = resolve({ ...DEFAULTS, f0: 1e9, Np1: 10, Np2: 14, W: 60e-6, lossDbPerM: 1e6 });
  const m = autoMatch(p);
  const ser = { ...p, match: 'seriesL', Lm1: m.series1, Lm2: m.series2 };
  const r1 = evalAt(p.f0, ser);
  close(r1.Zin1.im, 0, 1e-6, 'Im Zin1 with series L');
  close(r1.Zin2.im, 0, 1e-6, 'Im Zin2 with series L');
  const sh = { ...p, match: 'shuntL', Lm1: m.shunt1, Lm2: m.shunt2 };
  const r2 = evalAt(p.f0, sh);
  close(inv(r2.Zin1).im, 0, 1e-9, 'Im Yin1 with shunt L');
});

test('two bidirectional IDTs cannot beat 6.02 dB single-transit loss', () => {
  const p = { ...REF, fingerR: false, pads: false };
  const s = sweepNp(p, 40);
  for (const il of [...s.ilW, ...s.ilAbs]) assert.ok(il >= 20 * Math.log10(2) - 1e-9, `IL ${il}`);
});

test('Cs estimate (Datta formula, clamped permittivity) for the preset cuts', () => {
  close(csDatta(orientation('128Y')) * 1e10, 3.5275, 2e-4, '128YX Cs in pF/cm');
  close(csDatta(orientation('YZ')) * 1e10, 3.1542, 2e-4, 'YZ Cs in pF/cm');
  // Y-cut at psi = 90 deg is Y-Z.
  close(csDatta(orientation('Ycut', 90)), csDatta(orientation('YZ')), 1e-20, 'Ycut 90 = YZ');
});

test('elliptic integral and pad capacitance', () => {
  close(ellipK(0), Math.PI / 2, 1e-15, 'K(0)');
  close(ellipK(Math.SQRT1_2), 1.8540746773013719, 1e-12, 'K(1/sqrt2)');
  const C = padCapacitance({ s: 100e-6, g: 50e-6, L: 100e-6, Cs: 3.5275e-10 });
  assert.ok(C > 40e-15 && C < 70e-15, `pad C ${C}`);
});

test('3-dB band finder on a known curve', () => {
  const f = Float64Array.from({ length: 2001 }, (_, i) => -1 + i / 1000);
  const y = Float64Array.from(f, (x) => 10 * Math.log10(Math.exp(-x * x / 0.02)));
  const b = band3dB(f, y);
  const half = Math.sqrt(0.02 * Math.log(10 ** 0.3));
  close(b.bw, 2 * half, 1e-4, 'bandwidth');
});

test('Touchstone export has header and one line per point', () => {
  const p = resolve({ ...DEFAULTS, nPts: 11 });
  const txt = toTouchstone(simulate(p), p);
  const lines = txt.trim().split('\n');
  assert.ok(lines.includes('# HZ S RI R 50'));
  assert.equal(lines.filter((l) => !l.startsWith('!') && !l.startsWith('#')).length, 11);
});

test('group delay is blank (NaN) at transmission zeros and finite in the passband', () => {
  // Unequal Np: single zeros of sinc(x1) sinc(x2) make the S21 phase jump by pi.
  const p = { ...REF, Np2: 15 };
  const r = simulate(p);
  const tau = derive(p).tau;
  const finite = Array.from(r.gd).filter(Number.isFinite);
  assert.ok(finite.every((g) => g > 0 && g < 2 * tau), `finite group delay within (0, 2 tau): ${Math.min(...finite)}, ${Math.max(...finite)}`);
  const i0 = r.f.findIndex((f) => f >= p.f0);
  close(r.gd[i0], tau, 0.02 * tau, 'group delay at f0 = tau (single transit, no parasitics)');
  // Every deep null has a blank group delay next to it.
  for (let i = 1; i < r.f.length - 1; i++) {
    if (r.s21dB[i] < r.summary.band.ymax - 60 && r.s21dB[i] <= r.s21dB[i - 1] && r.s21dB[i] <= r.s21dB[i + 1]) {
      assert.ok(Number.isNaN(r.gd[i]) || Number.isNaN(r.gd[i + 1]), `blank near null at ${r.f[i]}`);
    }
  }
});

test('first-null (zero-to-zero) bandwidth = 2 f0 / max(Np) in the impulse model', () => {
  for (const [Np1, Np2] of [[22, 22], [22, 15], [10, 30]]) {
    const p = { ...REF, Np1, Np2, span: 0.4, nPts: 4001 };
    const r = simulate(p);
    const step = r.f[1] - r.f[0];
    close(r.summary.nulls.bw, (2 * p.f0) / Math.max(Np1, Np2), 2 * step, `null-to-null for Np ${Np1}/${Np2}`);
    close(r.summary.bwNullImpulse, (2 * p.f0) / Math.max(Np1, Np2), 1e-6, 'impulse value');
  }
  // Ripple dips shallower than 20 dB are not nulls; nulls outside the span give null.
  const none = nullBand(Float64Array.from([0, 1, 2, 3, 4]), Float64Array.from([-30, -10, -5, -10, -30]));
  assert.equal(none.bw, null);
});

test('velocity shift under the IDTs sets the pitch and the transit time inside the IDTs', () => {
  const p = { ...REF, v: 4000, dvIdt: -0.02 };
  const d = derive(p);
  close(d.vIdt, 3920, 1e-9, 'v under IDT');
  close(d.pitch, 3920 / p.f0 / 2, 1e-15, 'pitch = v_IDT / (2 f0)');
  close(d.lambdaFree, 4000 / p.f0, 1e-15, 'free-surface wavelength');
  close(d.tau, p.gap / 4000 + (p.Np1 + p.Np2) / (2 * p.f0), 1e-15, 'tau');
  const d0 = derive({ ...p, dvIdt: 0 });
  close(d0.tau, d0.Lcc / 4000, 1e-15, 'no shift: tau = Lcc / v');
});
