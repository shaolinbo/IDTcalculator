import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, resolve, derive, evalAt, simulate, sweepNp, toTouchstone, band3dB } from '../src/model.js';
import { idtAdmittance, apertureForReZ, apertureForAbsZ } from '../src/impulse.js';
import { orientation, csDatta } from '../src/materials.js';
import { ellipK, padCapacitance } from '../src/pads.js';
import { abs, abs2, dB, inv } from '../src/complex.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// The 2024 Mathematica notebook (calculatuonOfImpedance20240819.nb), current inputs:
// Rin = 50, f0 = 0.22 GHz, Np = 22, Cs = 3.61 pF/cm, ksq = 0.055, Wa = 0.05 cm.
// Its outputs: Z0 = 83.19766021326612 - 54.00271862021832 i, IL = 7.899505494267967 dB.
const NB = {
  ...DEFAULTS, K2: 0.055, Cs: 3.61e-10, Cpad: 0, f0: 220e6, Np1: 22, Np2: 22, W: 500e-6,
  fingerR: false, pads: false, Cft: 0, match: 'none', Z0: 50, lossDbPerM: 0,
};

test('reproduces the 2024 notebook: IDT impedance at f0', () => {
  const r = evalAt(NB.f0, NB, derive(NB), false);
  close(r.Zidt1.re, 83.19766021326612, 1e-9, 'Re Z');
  close(r.Zidt1.im, -54.00271862021832, 1e-9, 'Im Z');
  close(r.Zin1.re, 83.19766021326612, 1e-9, 'Re Zin (no parasitics, single transit)');
  close(r.Zin1.im, -54.00271862021832, 1e-9, 'Im Zin');
});

test('reproduces the 2024 notebook: insertion loss of the two-IDT line at f0', () => {
  const r = evalAt(NB.f0, NB, derive(NB), false);
  close(-dB(r.S21), 7.899505494267967, 1e-9, 'IL');
});

test('notebook W(N) formula gives Re Z = Rin; |Z| aperture gives |Z| = Rin and minimum IL', () => {
  const q = { f0: NB.f0, Np: 22, K2: NB.K2, Cs: NB.Cs };
  const w1 = apertureForReZ(q, 50);
  close(inv(idtAdmittance(NB.f0, { ...q, W: w1 }).Y).re, 50, 1e-9, 'Re Z at W_ReZ');
  const w2 = apertureForAbsZ(q, 50);
  close(abs(inv(idtAdmittance(NB.f0, { ...q, W: w2 }).Y)), 50, 1e-9, '|Z| at W_absZ');
  const il = (W) => { const p = { ...NB, W }; return -dB(evalAt(p.f0, p, derive(p), false).S21); };
  assert.ok(il(w2) < il(w2 * 1.05) && il(w2) < il(w2 * 0.95), 'IL is minimum at W_absZ');
  close(w2 * 1e6, 991.9, 0.5, 'W_absZ in um for the notebook design');
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
  const p = { ...NB, fingerR: false, pads: false };
  const s = sweepNp(p, 40);
  for (const il of [...s.ilW, ...s.ilAbs]) assert.ok(il >= 20 * Math.log10(2) - 1e-9, `IL ${il}`);
});

test('Cs estimate (Datta formula, clamped permittivity) for the preset cuts', () => {
  close(csDatta(orientation('128YX')) * 1e10, 3.5275, 2e-4, '128YX Cs in pF/cm');
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
