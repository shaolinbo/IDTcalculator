// Top-level delay-line model: two IDTs, 50-ohm probe ports, pad parasitics,
// optional tuning inductors. All quantities in SI units.
//
// Signal path at each port:  probe (Z0) -> tuning L -> pad (shunt Cpad)
//   -> lead (series R + jwL) -> finger resistance -> IDT.
// A feedthrough capacitance Cft connects the two pad nodes directly.
import { cx, mul, div, sub, add, scale, inv, expj, abs, dB, arg } from './complex.js?v=d11e120981';
import { idtAdmittance, apertureForReZ, apertureForAbsZ, npOptimum, fingerResistance } from './impulse.js?v=d11e120981';
import { seriesZ, shuntY, bridgeY, yToS, zFromGamma } from './network.js?v=d11e120981';
import { orientation, csDatta } from './materials.js?v=d11e120981';
import { padCapacitance } from './pads.js?v=d11e120981';
import { solveSubstrate } from './saw/substrate.js?v=d11e120981';
import { DEFAULT_SET } from './saw/constants.js?v=d11e120981';

/**
 * Fill in substrate and pad values.
 * - substrate = 'solver': v, K2 and Cs from the partial-wave solver for the cut
 *   (q.sub holds the full solver result; if no SAW is found, the given values stay).
 * - Cs still null: clamped-permittivity estimate for the cut.
 * - Cpad null: estimate from the pad geometry.
 */
export function resolve(p) {
  const q = { ...p };
  const o = orientation(q.cut, q);
  if (q.substrate === 'solver' && o) {
    q.sub = solveSubstrate(o, { set: q.consts });
    if (q.sub.ok) { q.v = q.sub.v0; q.K2 = q.sub.K2; q.Cs = q.sub.Cs; }
  }
  if (q.Cs == null) {
    if (!o) throw new Error('Cs must be given for a custom substrate');
    q.Cs = csDatta(o);
  }
  if (q.Cpad == null) q.Cpad = padCapacitance({ s: q.padS, g: q.padG, L: q.padL, Cs: q.Cs });
  return q;
}

/**
 * Default parameters (SI). The device is a 128°Y-X reference design
 * (220 MHz, Np = 22, W = 500 um); the rest are neutral starting values.
 */
export const DEFAULTS = {
  cut: '128Y', psi: 0, rot: 128, e1: 0, e2: 38, e3: 0,
  substrate: 'solver', // 'solver' or 'manual' (use v, K2, Cs below)
  consts: DEFAULT_SET, // LiNbO3 constant set for the solver (see CONSTANT_SETS)
  v: 3996, K2: 0.056, Cs: null, // Cs null -> clamped-permittivity estimate for the cut
  f0: 220e6, Np1: 22, Np2: 22, W: 500e-6, gap: 1000e-6,
  dvIdt: 0, // fractional SAW velocity shift under the IDTs (mass loading, shorting); -0.01 = 1 % slower
  lossDbPerM: 0,
  Z0: 50,
  fingerR: true, metal: 'Al', rho: 2.65e-8, h: 100e-9,
  pads: true, padS: 100e-6, padG: 50e-6, padL: 100e-6, Cpad: null, // Cpad null -> estimate
  Rlead: 0, Llead: 0, Cft: 0,
  match: 'none', Lm1: 0, Lm2: 0,
  regeneration: true,
  span: 0.15, nPts: 2001,
};

/**
 * Quantities that do not depend on frequency. The IDT period follows the velocity under
 * the IDTs, vIdt = v (1 + dvIdt), so that the IDTs are synchronous at f0; the gap uses v.
 */
export function derive(p) {
  const vIdt = p.v * (1 + (p.dvIdt ?? 0));
  const lambda = vIdt / p.f0; // IDT period (wavelength under the IDTs)
  const lambdaFree = p.v / p.f0; // free-surface wavelength at f0
  const pitch = lambda / 2; // electrode pitch, single-electrode IDT
  const a = lambda / 4; // finger width at metallization ratio 0.5
  const Lcc = p.gap + (p.Np1 + p.Np2) * lambda / 2; // IDT centre-to-centre distance
  const tau = p.gap / p.v + (p.Np1 + p.Np2) / (2 * p.f0); // half of each IDT at vIdt, gap at v
  const R1 = p.fingerR ? fingerResistance({ rho: p.rho, W: p.W, a, h: p.h, Np: p.Np1 }) : 0;
  const R2 = p.fingerR ? fingerResistance({ rho: p.rho, W: p.W, a, h: p.h, Np: p.Np2 }) : 0;
  const amp = Math.pow(10, -p.lossDbPerM * Lcc / 20);
  return { vIdt, lambda, lambdaFree, pitch, a, Lcc, tau, R1, R2, amp };
}

const idt = (p, Np) => ({ f0: p.f0, Np, K2: p.K2, Cs: p.Cs, W: p.W });

/**
 * Port Y-matrix before the tuning inductors, at frequency f.
 * acoustic = false drops the acoustic coupling between the IDTs (each IDT alone).
 */
function yBeforeMatch(f, p, d, acoustic = true) {
  const w = 2 * Math.PI * f;
  const t1 = idtAdmittance(f, idt(p, p.Np1));
  const t2 = idtAdmittance(f, idt(p, p.Np2));
  // Acoustic transfer admittance (no electrode reflections in this model).
  const y21 = acoustic
    ? scale(expj(-w * d.tau), -Math.sqrt(t1.Ga0 * t2.Ga0) * t1.sinc * t2.sinc * d.amp)
    : cx(0, 0);
  let Y = [[t1.Y, y21], [y21, t2.Y]];
  const zl = p.pads ? cx(p.Rlead, w * p.Llead) : cx(0, 0);
  Y = seriesZ(Y, add(cx(d.R1, 0), zl), add(cx(d.R2, 0), zl));
  if (p.pads) Y = shuntY(Y, cx(0, w * p.Cpad), cx(0, w * p.Cpad));
  if (p.Cft > 0) Y = bridgeY(Y, cx(0, w * p.Cft));
  return { Y, t1, t2 };
}

function applyMatch(Y, f, p) {
  const w = 2 * Math.PI * f;
  if (p.match === 'seriesL') return seriesZ(Y, cx(0, w * p.Lm1), cx(0, w * p.Lm2));
  if (p.match === 'shuntL') {
    const y = (L) => (L > 0 ? cx(0, -1 / (w * L)) : cx(0, 0));
    return shuntY(Y, y(p.Lm1), y(p.Lm2));
  }
  return Y;
}

/** Full response at one frequency. */
export function evalAt(f, p, d = derive(p), regeneration = p.regeneration) {
  const { Y: Y0, t1, t2 } = yBeforeMatch(f, p, d);
  const Y = applyMatch(Y0, f, p);
  const S = yToS(Y, p.Z0, regeneration);
  return {
    f, ...S,
    Zin1: zFromGamma(S.S11, p.Z0),
    Zin2: zFromGamma(S.S22, p.Z0),
    Zidt1: inv(t1.Y), Zidt2: inv(t2.Y),
    Ga1: t1.Ga, Ba1: t1.Ba, wCt1: t1.wCt, Ct1: t1.Ct, Ct2: t2.Ct, Ga01: t1.Ga0, Ga02: t2.Ga0,
    Y0,
  };
}

/** Impedance looking into port i before tuning, other port terminated in Z0. */
function portZ(Y, i, Z0) {
  const [[Y11, Y12], [Y21, Y22]] = Y;
  const yl = cx(1 / Z0, 0);
  const Yin = i === 1 ? sub(Y11, div(mul(Y12, Y21), add(Y22, yl))) : sub(Y22, div(mul(Y12, Y21), add(Y11, yl)));
  return { Yin, Zin: inv(Yin) };
}

/**
 * Tuning inductances that cancel the port reactance at f0 (null if not possible).
 * Computed for each IDT on its own (no acoustic coupling to the other IDT):
 * once both ports are tuned, regeneration by the other IDT shifts the port
 * impedance, and with the triple-transit echo it ripples around this value.
 */
export function autoMatch(p) {
  const d = derive(p);
  const w0 = 2 * Math.PI * p.f0;
  const { Y } = yBeforeMatch(p.f0, p, d, false);
  const out = {};
  for (const i of [1, 2]) {
    const { Yin, Zin } = portZ(Y, i, p.Z0);
    out[`series${i}`] = Zin.im < 0 ? -Zin.im / w0 : null;
    out[`shunt${i}`] = Yin.im > 0 ? 1 / (w0 * Yin.im) : null;
  }
  return out;
}

/** 3-dB band around the maximum of a dB trace. Returns null edges if the band hits the span. */
export function band3dB(f, y) {
  let im = 0;
  for (let i = 1; i < y.length; i++) if (y[i] > y[im]) im = i;
  const lvl = y[im] - 3;
  let lo = null, hi = null;
  for (let i = im; i > 0; i--) if (y[i - 1] < lvl) { lo = f[i - 1] + (lvl - y[i - 1]) * (f[i] - f[i - 1]) / (y[i] - y[i - 1]); break; }
  for (let i = im; i < y.length - 1; i++) if (y[i + 1] < lvl) { hi = f[i] + (y[i] - lvl) * (f[i + 1] - f[i]) / (y[i] - y[i + 1]); break; }
  return { fmax: f[im], ymax: y[im], lo, hi, bw: lo !== null && hi !== null ? hi - lo : null };
}

/**
 * Group delay -d(phase)/d(omega) from an unwrapped phase trace (central differences).
 * NaN where it is not meaningful: across a transmission zero (the phase steps by more
 * than 90° between neighbouring points) or where |S| is more than floorDb below its peak.
 */
export function groupDelay(f, S, floorDb = 40) {
  const n = f.length, ph = new Float64Array(n), gd = new Float64Array(n);
  const mag = Float64Array.from(S, (z) => dB(z));
  const lvl = Math.max(...mag) - floorDb;
  const jump = new Uint8Array(n); // jump[i]: phase step between i - 1 and i exceeds 90°
  let off = 0;
  for (let i = 0; i < n; i++) {
    const a = arg(S[i]);
    if (i > 0) {
      const dlt = a + off - ph[i - 1];
      if (dlt > Math.PI) off -= 2 * Math.PI; else if (dlt < -Math.PI) off += 2 * Math.PI;
      if (Math.abs(a + off - ph[i - 1]) > Math.PI / 2) jump[i] = 1;
    }
    ph[i] = a + off;
  }
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const bad = jump[i] || (i1 > i && jump[i1]) || mag[i0] < lvl || mag[i] < lvl || mag[i1] < lvl;
    gd[i] = bad ? NaN : -(ph[i1] - ph[i0]) / (2 * Math.PI * (f[i1] - f[i0]));
  }
  return gd;
}

/**
 * First transmission nulls on each side of the S21 peak: the nearest local minima at
 * least `depth` dB below the peak (shallower dips are passband ripple). Resolution:
 * one frequency step. lo or hi is null when that null lies outside the sweep.
 */
export function nullBand(f, y, depth = 20) {
  let im = 0;
  for (let i = 1; i < y.length; i++) if (y[i] > y[im]) im = i;
  const lvl = y[im] - depth;
  const isMin = (i) => y[i] <= y[i - 1] && y[i] <= y[i + 1];
  let lo = null, hi = null;
  for (let i = im - 1; i > 0; i--) if (y[i] < lvl && isMin(i)) { lo = f[i]; break; }
  for (let i = im + 1; i < y.length - 1; i++) if (y[i] < lvl && isMin(i)) { hi = f[i]; break; }
  return { lo, hi, bw: lo !== null && hi !== null ? hi - lo : null };
}

/** Frequency sweep and summary numbers. */
export function simulate(p) {
  const d = derive(p);
  const n = Math.max(3, Math.round(p.nPts));
  const fmin = p.f0 * (1 - p.span), fmax = p.f0 * (1 + p.span);
  const f = new Float64Array(n);
  const pts = [];
  for (let i = 0; i < n; i++) {
    f[i] = fmin + (fmax - fmin) * i / (n - 1);
    pts.push(evalAt(f[i], p, d));
  }
  const s21dB = Float64Array.from(pts, (r) => dB(r.S21));
  const band = band3dB(f, s21dB);
  const gd = groupDelay(f, pts.map((r) => r.S21));

  const at0 = evalAt(p.f0, p, d);
  const at0single = evalAt(p.f0, p, d, false);
  const idt1 = idt(p, p.Np1);
  const summary = {
    ...d,
    Ct1: at0.Ct1, Ct2: at0.Ct2, Ga01: at0.Ga01, Ga02: at0.Ga02,
    Zidt1: at0.Zidt1, Zin1: at0.Zin1, Zin2: at0.Zin2,
    s21f0: dB(at0.S21), s21f0single: dB(at0single.S21), s11f0: dB(at0.S11),
    band,
    nulls: nullBand(f, s21dB),
    bwNullImpulse: (2 * p.f0) / Math.max(p.Np1, p.Np2), // first nulls of the narrower sinc
    npOpt: npOptimum(p.K2),
    wReZ: apertureForReZ(idt1, p.Z0),
    wAbsZ: apertureForAbsZ(idt1, p.Z0),
    match: autoMatch(p),
  };
  return { f, pts, s21dB, gd, summary };
}

/**
 * IL at f0 and 3-dB bandwidth versus Np (both IDTs set to the same Np),
 * single acoustic transit. Two apertures: the current W, and W for |Z| = Z0.
 */
export function sweepNp(p, npMax = 80) {
  const out = { N: [], ilW: [], bwW: [], wAbs: [], ilAbs: [], bwAbs: [] };
  const m = 601;
  for (let N = 1; N <= npMax; N++) {
    const base = { ...p, Np1: N, Np2: N, match: 'none' };
    const wAbs = apertureForAbsZ(idt(base, N), p.Z0);
    const half = Math.min(0.9, 2.5 / N);
    const runs = [base, { ...base, W: wAbs }].map((q) => {
      const d = derive(q);
      const f = new Float64Array(m), y = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        f[i] = q.f0 * (1 - half + 2 * half * i / (m - 1));
        y[i] = dB(evalAt(f[i], q, d, false).S21);
      }
      return { il: -dB(evalAt(q.f0, q, d, false).S21), bw: band3dB(f, y).bw };
    });
    out.N.push(N); out.wAbs.push(wAbs);
    out.ilW.push(runs[0].il); out.bwW.push(runs[0].bw);
    out.ilAbs.push(runs[1].il); out.bwAbs.push(runs[1].bw);
  }
  return out;
}

/** Touchstone v1 .s2p text (Hz, real/imag, Z0). */
export function toTouchstone(res, p, comment = []) {
  const lines = ['! SAW delay line, impulse model (SAW IDT calculator)', ...comment.map((c) => `! ${c}`), `# HZ S RI R ${p.Z0}`];
  res.pts.forEach((r) => {
    const v = [r.S11, r.S21, r.S12, r.S22].flatMap((s) => [s.re, s.im]);
    lines.push([r.f.toFixed(0), ...v.map((x) => x.toExponential(9))].join(' '));
  });
  return lines.join('\n') + '\n';
}

/** CSV with S-parameters (dB, deg), port impedances and IDT admittance. */
export function toCSV(res) {
  const deg = 180 / Math.PI;
  const head = 'f_Hz,S11_dB,S11_deg,S21_dB,S21_deg,S22_dB,S22_deg,Zin1_re,Zin1_im,Zin2_re,Zin2_im,Zidt1_re,Zidt1_im,Ga1_S,Ba1_S,wCt1_S,group_delay_s';
  const rows = res.pts.map((r, i) => [
    r.f, dB(r.S11), arg(r.S11) * deg, dB(r.S21), arg(r.S21) * deg, dB(r.S22), arg(r.S22) * deg,
    r.Zin1.re, r.Zin1.im, r.Zin2.re, r.Zin2.im, r.Zidt1.re, r.Zidt1.im, r.Ga1, r.Ba1, r.wCt1, res.gd[i],
  ].map((x) => (Number.isFinite(x) ? +x.toPrecision(10) : '')).join(','));
  return [head, ...rows].join('\n') + '\n';
}

export { abs, dB };
