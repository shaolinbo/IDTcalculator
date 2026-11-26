// Guided acoustic waves in layered structures: anisotropic piezoelectric or dielectric layers
// on a substrate half-space (e.g. LiNbO3 / SiO2 / Si, LiNbO3 / sapphire), or a free plate
// (suspended LiNbO3 membrane). Device axes as in solver.js: x1 = propagation, x3 = normal
// pointing out of the top surface, where the IDT sits; vacuum above.
//
// Each layer carries the state eta = (u1, u2, u3, phi, t1, t2, t3, D3) (t_j = T3j/(ik C0),
// scaling of solver.js), continuous across interfaces, with eta(top) = exp(i N kh) eta(bottom)
// (strohN). Below the stack: the substrate's four decaying partial waves, or for a plate a
// traction-free bottom face with vacuum below (D3 = i phi in these units). At the top:
// traction-free, and electrically open (D3 + i phi = 0, vacuum above) or shorted (phi = 0).
// A guided mode is a velocity where the resulting 4x4 boundary matrix is singular.
import { crystal, prepare, partialWaves, strohN, expmIn, bulkLimit, det4, nullVectors, solveE4, goldenMin } from './solver.js?v=f5cac54763';

/** Complex 8x8 matrix product (flat [re, im] pairs). */
function cmul8([Ar, Ai], [Br, Bi]) {
  const Cr = new Float64Array(64), Ci = new Float64Array(64);
  for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) {
    const ar = Ar[i * 8 + k], ai = Ai[i * 8 + k];
    if (ar === 0 && ai === 0) continue;
    for (let j = 0; j < 8; j++) {
      const br = Br[k * 8 + j], bi = Bi[k * 8 + j];
      Cr[i * 8 + j] += ar * br - ai * bi;
      Ci[i * 8 + j] += ar * bi + ai * br;
    }
  }
  return [Cr, Ci];
}

/**
 * A structure for the solver. layers: [{ material, A, hl }] from bottom to top, with a
 * material record (constants.js format), its rotation A (rows = device axes in its crystal
 * axes) and thickness hl = h / lambda. substrate: { material, A } or null for a free plate.
 */
export function makeStructure({ layers, substrate }) {
  const L = layers.map((l) => ({ ctx: prepare(crystal(l.material), l.A), kh: 2 * Math.PI * l.hl }));
  const sub = substrate ? { ctx: prepare(crystal(substrate.material), substrate.A) } : null;
  if (sub) sub.vlim = bulkLimit(sub.ctx);
  return { layers: L, sub };
}

/** Columns at the bottom of the stack: states (complex 8-vectors) and their normalization. */
function bottomColumns(S, v) {
  if (S.sub) {
    const pw = partialWaves(S.sub.ctx, v);
    if (!pw.ok) return null;
    return { cols: pw.states.map((s) => [s.re, s.im]), norm: pw.dV };
  }
  // Free plate: traction-free bottom face, vacuum below (D3 = i phi): unknowns u1, u2, u3, phi.
  const cols = [0, 1, 2, 3].map((k) => {
    const re = new Float64Array(8), im = new Float64Array(8);
    re[k] = 1;
    if (k === 3) im[7] = 1;
    return [re, im];
  });
  return { cols, norm: 1 };
}

/** States at the top of the stack for each bottom column. */
function topStates(S, v) {
  const bc = bottomColumns(S, v);
  if (!bc) return null;
  let P = null;
  for (const l of S.layers) {
    const X = strohN(l.ctx, v).map((x) => x * l.kh);
    const Pl = expmIn(X, 8);
    P = P ? cmul8(Pl, P) : Pl;
  }
  const tops = bc.cols.map(([re, im]) => {
    if (!P) return [re, im];
    const [Pr, Pi] = P, yr = new Float64Array(8), yi = new Float64Array(8);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      yr[i] += Pr[i * 8 + j] * re[j] - Pi[i * 8 + j] * im[j];
      yi[i] += Pr[i * 8 + j] * im[j] + Pi[i * 8 + j] * re[j];
    }
    return [yr, yi];
  });
  return { tops, bottoms: bc.cols, norm: bc.norm };
}

/** 4x4 boundary matrix at the top: rows t1, t2, t3, and (open) D3 + i phi or (short) phi. */
function boundary(tops, electrical) {
  const Mr = new Float64Array(16), Mi = new Float64Array(16);
  tops.forEach(([yr, yi], c) => {
    for (let r = 0; r < 3; r++) { Mr[r * 4 + c] = yr[4 + r]; Mi[r * 4 + c] = yi[4 + r]; }
    if (electrical === 'short') { Mr[12 + c] = yr[3]; Mi[12 + c] = yi[3]; }
    else { Mr[12 + c] = yr[7] - yi[3]; Mi[12 + c] = yi[7] + yr[3]; }
  });
  return [Mr, Mi];
}

/** |det| of the boundary matrix (normalized), or NaN where the structure leaks. */
export function boundaryDet(S, v, electrical = 'open') {
  const t = topStates(S, v);
  if (!t) return NaN;
  const d = det4(...boundary(t.tops, electrical));
  return Math.hypot(d[0], d[1]) / t.norm;
}

/**
 * Polarization of the mode at a root: surface displacement at the top (and, for a plate,
 * at the bottom). type 'SH' when u2 carries most of the top-surface energy, else 'R'
 * (sagittal, Rayleigh-type); for a plate also sym 'A' (u3 in phase at both faces) or 'S'.
 */
function modeShape(S, v, electrical) {
  const t = topStates(S, v);
  const [Mr, Mi] = boundary(t.tops, electrical);
  const [cr, ci] = nullVectors(Mr, Mi, 1)[0];
  const comb = (states, k) => {
    let a = 0, b = 0;
    states.forEach(([yr, yi], c) => { a += yr[k] * cr[c] - yi[k] * ci[c]; b += yr[k] * ci[c] + yi[k] * cr[c]; });
    return [a, b];
  };
  const u = [0, 1, 2].map((k) => comb(t.tops, k));
  const e = u.map(([a, b]) => a * a + b * b), tot = e[0] + e[1] + e[2];
  const shFrac = e[1] / tot;
  const out = { type: shFrac > 0.5 ? 'SH' : 'R', shFrac, uTop: u };
  if (!S.sub) {
    const ub = [0, 1, 2].map((k) => comb(t.bottoms, k));
    // Antisymmetric (flexural) modes move both faces the same way in x3.
    const dot3 = u[2][0] * ub[2][0] + u[2][1] * ub[2][1], dot1 = u[0][0] * ub[0][0] + u[0][1] * ub[0][1];
    out.sym = out.type === 'SH' ? 'SH' : (Math.abs(dot3) >= Math.abs(dot1) ? (dot3 > 0 ? 'A' : 'S') : (dot1 > 0 ? 'S' : 'A'));
  }
  return out;
}

/**
 * All guided modes with velocity in [vmin, vmax) for the given electrical boundary, slowest
 * first: [{ v, type, shFrac, sym? }]. For a substrate, vmax defaults to just below its
 * slowest bulk wave (faster modes leak); for a plate, to vRef * 2.
 */
export function findModes(S, electrical = 'open', { vmin, vmax, vRef = 4000, N = S.sub ? 360 : 520 } = {}) {
  const hi = vmax ?? (S.sub ? S.sub.vlim * (1 - 1e-9) : 2 * vRef);
  const lo = vmin ?? (S.sub ? 0.3 * S.sub.vlim : 0.001 * vRef);
  // Log-spaced in v (plates: modes from very slow flexural waves up), plus points crowding the bulk limit.
  const vs = [];
  for (let i = 0; i < N; i++) vs.push(lo * Math.pow(hi / lo, i / (N - 1)));
  if (S.sub) for (let i = 1; i <= 40; i++) vs.push(hi * (1 - 0.02 * Math.pow(1e-6 / 0.02, i / 40)));
  vs.sort((a, b) => a - b);
  const f = (v) => { const d = boundaryDet(S, v, electrical); return Number.isFinite(d) ? d : Infinity; };
  const fs = vs.map(f);
  const finite = fs.filter(Number.isFinite).sort((a, b) => a - b);
  const scale = finite[Math.floor(finite.length / 2)] || 1;
  const modes = [];
  for (let i = 1; i < vs.length - 1; i++) {
    if (!(fs[i] <= fs[i - 1] && fs[i] <= fs[i + 1])) continue;
    const m = goldenMin(f, vs[i - 1], vs[i + 1]);
    // A true zero: tiny against the typical size and against its neighbours.
    if (m.f < 1e-6 * scale && m.f < 1e-4 * Math.min(fs[i - 1], fs[i + 1])) {
      if (!modes.length || Math.abs(m.x - modes[modes.length - 1].v) > 1e-6 * m.x) modes.push({ v: m.x, ...modeShape(S, m.x, electrical) });
    }
  }
  return modes;
}

/**
 * Effective permittivity eps_eff/eps0 of the top surface (traction-free, phi = 1 there) at
 * velocity v; at v -> 0 it gives Cs = eps0 * eps_inf for an IDT with this wavelength.
 */
export function topPermittivity(S, v) {
  const t = topStates(S, v);
  if (!t) return NaN;
  const [Sr, Si] = boundary(t.tops, 'short'); // rows t1, t2, t3, phi
  const [xr, xi] = solveE4(Sr, Si);
  let sr = 0, si = 0;
  t.tops.forEach(([yr, yi], c) => { sr += xr[c] * yr[7] - xi[c] * yi[7]; si += xr[c] * yi[7] + xi[c] * yr[7]; });
  return 1 + si;
}

/** eps_inf: extrapolate eps_eff(v) linearly in v^2 to v = 0 (as in solver.js). */
export function epsInf(S, vRef) {
  const v1 = 0.03 * vRef, v2 = 0.06 * vRef;
  const e1 = topPermittivity(S, v1), e2 = topPermittivity(S, v2);
  return (e1 * v2 * v2 - e2 * v1 * v1) / (v2 * v2 - v1 * v1);
}
