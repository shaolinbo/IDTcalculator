// Guided acoustic waves in layered structures: anisotropic piezoelectric or dielectric layers
// on a substrate half-space (e.g. LiNbO3 / SiO2 / Si, LiNbO3 / sapphire), or a free plate
// (suspended LiNbO3 membrane). Device axes as in solver.js: x1 = propagation, x3 = normal
// pointing out of the top surface, where the IDT sits; vacuum above.
//
// Each layer carries the state (a, b), a = (u1, u2, u3, phi), b = (t1, t2, t3, D3) with
// t_j = T3j/(ik C0) (scaling of solver.js), continuous across interfaces; across a slab of
// thickness h, (a, b)(top) = exp(i N kh) (a, b)(bottom) with N the Stroh matrix (strohN).
// For numerical stability the surface impedance Z (b = Z a) is carried up instead of the
// state, through sublayers with kh <= 0.4: with P = exp(i N dkh) in 4x4 blocks,
//   Z' = (Pba + Pbb Z)(Paa + Pab Z)^-1.
// Below the stack: Z of the substrate's four decaying partial waves, or for a plate a
// traction-free bottom face with vacuum below (t = 0, D3 = i phi). At the top: traction-free,
// and electrically open (D3 + i phi = 0, vacuum above) or shorted (phi = 0). A guided mode
// is a velocity where the resulting 4x4 boundary matrix is singular.
import { crystal, prepare, partialWaves, strohN, expmIn, bulkLimit, det4, nullVectors, solveE4, goldenMin } from './solver.js?v=521bac1594';

// Complex 4x4 matrices as [re, im] (Float64Array(16), row-major).
const Z4 = () => [new Float64Array(16), new Float64Array(16)];
function mul4([Ar, Ai], [Br, Bi]) {
  const [Cr, Ci] = Z4();
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
    const ar = Ar[i * 4 + k], ai = Ai[i * 4 + k];
    for (let j = 0; j < 4; j++) {
      Cr[i * 4 + j] += ar * Br[k * 4 + j] - ai * Bi[k * 4 + j];
      Ci[i * 4 + j] += ar * Bi[k * 4 + j] + ai * Br[k * 4 + j];
    }
  }
  return [Cr, Ci];
}
const add4 = ([Ar, Ai], [Br, Bi]) => [Ar.map((x, q) => x + Br[q]), Ai.map((x, q) => x + Bi[q])];
function inv4c([Ar, Ai]) {
  const R = Array.from({ length: 4 }, (_, i) => [...Ar.slice(i * 4, i * 4 + 4), ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  const I = Array.from({ length: 4 }, (_, i) => [...Ai.slice(i * 4, i * 4 + 4), 0, 0, 0, 0]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.hypot(R[r][c], I[r][c]) > Math.hypot(R[p][c], I[p][c])) p = r;
    [R[c], R[p]] = [R[p], R[c]]; [I[c], I[p]] = [I[p], I[c]];
    const dr = R[c][c], di = I[c][c], d2 = dr * dr + di * di;
    if (d2 === 0) return null;
    for (let j = 0; j < 8; j++) { const xr = R[c][j], xi = I[c][j]; R[c][j] = (xr * dr + xi * di) / d2; I[c][j] = (xi * dr - xr * di) / d2; }
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const fr = R[r][c], fi = I[r][c];
      if (fr === 0 && fi === 0) continue;
      for (let j = 0; j < 8; j++) { R[r][j] -= fr * R[c][j] - fi * I[c][j]; I[r][j] -= fr * I[c][j] + fi * R[c][j]; }
    }
  }
  const out = Z4();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { out[0][i * 4 + j] = R[i][4 + j]; out[1][i * 4 + j] = I[i][4 + j]; }
  return out;
}
const block = ([Pr, Pi], r0, c0) => {
  const out = Z4();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { out[0][i * 4 + j] = Pr[(r0 + i) * 8 + c0 + j]; out[1][i * 4 + j] = Pi[(r0 + i) * 8 + c0 + j]; }
  return out;
};
const matVec = ([Mr, Mi], [xr, xi]) => {
  const yr = new Float64Array(4), yi = new Float64Array(4);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { yr[i] += Mr[i * 4 + j] * xr[j] - Mi[i * 4 + j] * xi[j]; yi[i] += Mr[i * 4 + j] * xi[j] + Mi[i * 4 + j] * xr[j]; }
  return [yr, yi];
};

const DKH = 0.4; // largest sublayer thickness k*h in the impedance recursion

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

/** Surface impedance at the top of the stack, and per-sublayer (Paa + Pab Z)^-1 for back substitution. */
function topImpedance(S, v) {
  let Z;
  if (S.sub) {
    const pw = partialWaves(S.sub.ctx, v);
    if (!pw.ok) return null;
    const A = Z4(), B = Z4();
    pw.states.forEach(({ re, im }, c) => {
      for (let k = 0; k < 4; k++) { A[0][k * 4 + c] = re[k]; A[1][k * 4 + c] = im[k]; B[0][k * 4 + c] = re[4 + k]; B[1][k * 4 + c] = im[4 + k]; }
    });
    const Ai = inv4c(A);
    if (!Ai) return null;
    Z = mul4(B, Ai);
  } else {
    Z = Z4(); Z[1][15] = 1; // free plate: t = 0, D3 = i phi at the bottom face
  }
  const backs = [];
  for (const l of S.layers) {
    if (!(l.kh > 0)) continue;
    const n = Math.max(1, Math.ceil(l.kh / DKH));
    const P = expmIn(strohN(l.ctx, v).map((x) => (x * l.kh) / n), 8);
    const Paa = block(P, 0, 0), Pab = block(P, 0, 4), Pba = block(P, 4, 0), Pbb = block(P, 4, 4);
    for (let j = 0; j < n; j++) {
      const Mi = inv4c(add4(Paa, mul4(Pab, Z)));
      if (!Mi) return null;
      Z = mul4(add4(Pba, mul4(Pbb, Z)), Mi);
      backs.push(Mi);
    }
  }
  return { Z, backs };
}

/** 4x4 boundary matrix at the top acting on a = (u, phi): rows t1, t2, t3 (= Z a), and (open) D3 + i phi or (short) phi. */
function boundary(Z, electrical) {
  const [Mr, Mi] = [Z[0].slice(), Z[1].slice()];
  if (electrical === 'short') { Mr.fill(0, 12, 16); Mi.fill(0, 12, 16); Mr[15] = 1; }
  else Mi[15] += 1;
  return [Mr, Mi];
}

/** |det| of the top boundary matrix, or NaN where the structure leaks (above the bulk limit). */
export function boundaryDet(S, v, electrical = 'open') {
  const t = topImpedance(S, v);
  if (!t) return NaN;
  const d = det4(...boundary(t.Z, electrical));
  return Math.hypot(d[0], d[1]);
}

/**
 * Polarization of the mode at a root: surface displacement at the top (and, for a plate,
 * at the bottom). type 'SH' when u2 carries most of the top-surface displacement energy,
 * else 'R' (sagittal, Rayleigh-type); for a plate also sym 'A' (u3 in phase at both faces),
 * 'S' or 'SH'.
 */
function modeShape(S, v, electrical) {
  const t = topImpedance(S, v);
  const [Mr, Mi] = boundary(t.Z, electrical);
  const top = nullVectors(Mr, Mi, 1)[0];
  const u = [0, 1, 2].map((k) => [top[0][k], top[1][k]]);
  const e = u.map(([a, b]) => a * a + b * b), tot = e[0] + e[1] + e[2];
  const shFrac = e[1] / tot;
  const out = { type: shFrac > 0.5 ? 'SH' : 'R', shFrac };
  if (!S.sub) {
    let a = [Float64Array.from(top[0]), Float64Array.from(top[1])];
    for (let j = t.backs.length - 1; j >= 0; j--) a = matVec(t.backs[j], a);
    const ub = [0, 1, 2].map((k) => [a[0][k], a[1][k]]);
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
    const d3 = dot(u[2], ub[2]), d1 = dot(u[0], ub[0]);
    out.sym = out.type === 'SH' ? 'SH' : (Math.abs(d3) >= Math.abs(d1) ? (d3 > 0 ? 'A' : 'S') : (d1 > 0 ? 'S' : 'A'));
  }
  return out;
}

/**
 * All guided modes with velocity in [vmin, vmax) for the given electrical boundary, slowest
 * first: [{ v, type, shFrac, sym? }]. For a substrate, vmax defaults to just below its
 * slowest bulk wave (faster modes leak); for a plate, to 2 vRef.
 */
export function findModes(S, electrical = 'open', { vmin, vmax, vRef = 4000, N = S.sub ? 360 : 520 } = {}) {
  const hi = vmax ?? (S.sub ? S.sub.vlim * (1 - 1e-9) : 2 * vRef);
  const lo = vmin ?? (S.sub ? 0.3 * S.sub.vlim : 0.001 * vRef);
  const vs = [];
  for (let i = 0; i < N; i++) vs.push(lo * Math.pow(hi / lo, i / (N - 1)));
  if (S.sub) for (let i = 1; i <= 40; i++) vs.push(hi * (1 - 0.02 * Math.pow(1e-6 / 0.02, i / 40)));
  vs.sort((a, b) => a - b);
  const f = (v) => { const d = boundaryDet(S, v, electrical); return Number.isFinite(d) ? d : Infinity; };
  const fs = vs.map(f);
  const modes = [];
  for (let i = 1; i < vs.length - 1; i++) {
    if (!(fs[i] <= fs[i - 1] && fs[i] <= fs[i + 1])) continue;
    const m = goldenMin(f, vs[i - 1], vs[i + 1]);
    // A true zero: tiny against its neighbours (|det| can also dip near poles of Z).
    if (m.f < 1e-5 * Math.min(fs[i - 1], fs[i + 1])) {
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
  const t = topImpedance(S, v);
  if (!t) return NaN;
  const a = solveE4(...boundary(t.Z, 'short')); // t = 0 and phi = 1
  const D = matVec(t.Z, a);
  return 1 + D[1][3];
}

/** eps_inf: extrapolate eps_eff(v) linearly in v^2 to v = 0 (as in solver.js). */
export function epsInf(S, vRef) {
  const v1 = 0.03 * vRef, v2 = 0.06 * vRef;
  const e1 = topPermittivity(S, v1), e2 = topPermittivity(S, v2);
  return (e1 * v2 * v2 - e2 * v1 * v1) / (v2 * v2 - v1 * v1);
}
