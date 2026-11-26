// Partial-wave (Farnell-Jones) solver for Rayleigh-type SAW on a piezoelectric half-space.
//
// Device axes: x1 = propagation, x3 = surface normal; substrate at x3 < 0, vacuum above.
// Partial waves ~ exp(i k (x1 + beta x3 - v t)), unknowns a = (u1, u2, u3, phi).
// For a phase velocity v the Christoffel matrix Gamma(beta) is a 4x4 matrix of
// quadratics in beta; det Gamma(beta) = 0 is a real polynomial of degree 8. Below the
// slowest bulk-wave limit all 8 roots are complex; the 4 with Im(beta) < 0 decay into
// the substrate. The SAW velocity is where the 4x4 boundary-condition matrix is singular:
//   free (open) surface:  T3j = 0 and D3 continuous with the vacuum field    -> v0
//   metallized surface:   T3j = 0 and phi = 0                                -> vm
// K^2 = 2 (v0 - vm) / v0. The effective permittivity eps_eff(v) of the traction-free
// surface gives eps_inf = eps_eff(v -> 0), the capacitance per finger pair per unit
// length of an IDT with metallization ratio 0.5 (Cs = eps_inf).
//
// Units are scaled to keep all numbers O(1): c / 1e11, e / sqrt(1e11 eps0), eps / eps0.
import { EPS0, voigt3m } from './constants.js?v=f4a790d683';
import { fullTensors, rotateTensor, rotateAboutNormal } from './tensor.js?v=f4a790d683';

const C0 = 1e11;
const SE = Math.sqrt(C0 * EPS0);

// ---------------------------------------------------------------------------
// Set-up for one orientation

/** Crystal-frame tensors (SI) for a material record (see constants.js). */
export function crystal(m) {
  return { ...fullTensors(voigt3m(m)), rho: m.rho };
}

/** Rotated, scaled tensors and the polynomial coefficients used at every velocity. */
export function prepare(cr, A) {
  const c = rotateTensor(cr.c, A, 4).map((x) => x / C0);
  const e = rotateTensor(cr.e, A, 3).map((x) => x / SE);
  const eps = rotateTensor(cr.eps, A, 2).map((x) => x / EPS0);
  const C = (i, j, k, l) => c[((i * 3 + j) * 3 + k) * 3 + l];
  const E = (k, i, j) => e[(k * 3 + i) * 3 + j];
  const P = (i, j) => eps[i * 3 + j];

  // Gamma(beta)[r][s] = g0 + g1 beta + g2 beta^2 (without the -rho v^2 term); n = (1, 0, beta).
  const G = new Float64Array(48);
  const setG = (r, s, M) => {
    const o = (r * 4 + s) * 3;
    G[o] = M(0, 0); G[o + 1] = M(0, 2) + M(2, 0); G[o + 2] = M(2, 2);
  };
  for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) {
    if (r < 3 && s < 3) setG(r, s, (i, l) => C(i, r, s, l));
    else if (r < 3) setG(r, s, (i, k) => E(k, i, r));
    else if (s < 3) setG(r, s, (i, l) => E(i, s, l));
    else setG(r, s, (i, k) => -P(i, k));
  }
  // Boundary rows, linear in beta: traction t_j (j = 0..2) and D3, per unknown k = 0..3.
  const B = new Float64Array(32); // [row 0..3][k 0..3][2]
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j < 3; j++) {
      const o = (j * 4 + k) * 2;
      if (k < 3) { B[o] = C(2, j, k, 0); B[o + 1] = C(2, j, k, 2); }
      else { B[o] = E(0, 2, j); B[o + 1] = E(2, 2, j); }
    }
    const o = (3 * 4 + k) * 2;
    if (k < 3) { B[o] = E(2, k, 0); B[o + 1] = E(2, k, 2); }
    else { B[o] = -P(2, 0); B[o + 1] = -P(2, 2); }
  }
  return { G, B, rho: cr.rho / C0, A };
}

// ---------------------------------------------------------------------------
// Polynomial determinant and roots

const PERMS = (() => {
  const out = [];
  const rec = (arr, used, sign) => {
    if (arr.length === 4) { out.push([arr.slice(), sign]); return; }
    for (let i = 0; i < 4; i++) if (!used[i]) {
      // sign flips with the number of used indices greater than i (inversions)
      let inv = 0;
      for (let j = 0; j < 4; j++) if (used[j] && j > i) inv++;
      used[i] = true; arr.push(i);
      rec(arr, used, inv % 2 ? -sign : sign);
      arr.pop(); used[i] = false;
    }
  };
  rec([], [false, false, false, false], 1);
  return out;
})();

/** Coefficients (ascending powers) of det Gamma(beta) at velocity v. */
function detPoly(ctx, v) {
  const g = ctx.G.slice();
  const rv2 = ctx.rho * v * v;
  for (let j = 0; j < 3; j++) g[(j * 4 + j) * 3] -= rv2;
  const out = new Float64Array(9);
  const t = new Float64Array(9);
  for (const [p, sign] of PERMS) {
    t.fill(0); t[0] = sign;
    let deg = 0;
    for (let r = 0; r < 4; r++) {
      const o = (r * 4 + p[r]) * 3;
      const a0 = g[o], a1 = g[o + 1], a2 = g[o + 2];
      for (let d = deg; d >= 0; d--) {
        const x = t[d];
        t[d] = x * a0;
        t[d + 1] += x * a1;
        t[d + 2] += x * a2;
      }
      deg += 2;
    }
    for (let d = 0; d < 9; d++) out[d] += t[d];
  }
  return { coef: out, g };
}

/** All roots of a real polynomial (ascending coefficients) by the Aberth-Ehrlich method. */
export function polyRoots(c) {
  const n = c.length - 1;
  const a = Array.from(c, (x) => x / c[n]);
  let R = Math.pow(Math.abs(a[0]), 1 / n);
  if (!(R > 0) || !Number.isFinite(R)) R = 1;
  const zr = new Float64Array(n), zi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const ang = (2 * Math.PI * k) / n + 0.4;
    zr[k] = R * Math.cos(ang); zi[k] = R * Math.sin(ang);
  }
  for (let it = 0; it < 120; it++) {
    let maxRel = 0;
    for (let k = 0; k < n; k++) {
      const xr = zr[k], xi = zi[k];
      let pr = 1, pi = 0, dr = 0, di = 0;
      for (let j = n - 1; j >= 0; j--) {
        const ndr = dr * xr - di * xi + pr, ndi = dr * xi + di * xr + pi;
        dr = ndr; di = ndi;
        const npr = pr * xr - pi * xi + a[j], npi = pr * xi + pi * xr;
        pr = npr; pi = npi;
      }
      const dd = dr * dr + di * di;
      if (dd === 0) continue;
      const wr = (pr * dr + pi * di) / dd, wi = (pi * dr - pr * di) / dd;
      let sr = 0, si = 0;
      for (let j = 0; j < n; j++) if (j !== k) {
        const ur = xr - zr[j], ui = xi - zi[j], q = ur * ur + ui * ui;
        sr += ur / q; si -= ui / q;
      }
      const er = 1 - (wr * sr - wi * si), ei = -(wr * si + wi * sr), eq = er * er + ei * ei;
      const cr = (wr * er + wi * ei) / eq, ci = (wi * er - wr * ei) / eq;
      zr[k] = xr - cr; zi[k] = xi - ci;
      const rel = Math.hypot(cr, ci) / (1 + Math.hypot(zr[k], zi[k]));
      if (rel > maxRel) maxRel = rel;
    }
    if (maxRel < 1e-14) break;
  }
  return { zr, zi };
}

// ---------------------------------------------------------------------------
// Small complex linear algebra (4x4, separate re/im arrays, row-major)

/** k null vectors of a (nearly) rank-(4-k) complex 4x4 matrix, by complete pivoting. */
function nullVectors(Mr, Mi, k) {
  const ar = Mr.slice(), ai = Mi.slice();
  const perm = [0, 1, 2, 3];
  const r = 4 - k;
  for (let s = 0; s < r; s++) {
    let bi = s, bj = s, bm = -1;
    for (let i = s; i < 4; i++) for (let j = s; j < 4; j++) {
      const m = ar[i * 4 + j] ** 2 + ai[i * 4 + j] ** 2;
      if (m > bm) { bm = m; bi = i; bj = j; }
    }
    if (bi !== s) for (let j = 0; j < 4; j++) {
      let t = ar[s * 4 + j]; ar[s * 4 + j] = ar[bi * 4 + j]; ar[bi * 4 + j] = t;
      t = ai[s * 4 + j]; ai[s * 4 + j] = ai[bi * 4 + j]; ai[bi * 4 + j] = t;
    }
    if (bj !== s) {
      for (let i = 0; i < 4; i++) {
        let t = ar[i * 4 + s]; ar[i * 4 + s] = ar[i * 4 + bj]; ar[i * 4 + bj] = t;
        t = ai[i * 4 + s]; ai[i * 4 + s] = ai[i * 4 + bj]; ai[i * 4 + bj] = t;
      }
      const t = perm[s]; perm[s] = perm[bj]; perm[bj] = t;
    }
    const pr = ar[s * 4 + s], pi = ai[s * 4 + s], pq = pr * pr + pi * pi;
    for (let i = s + 1; i < 4; i++) {
      const xr = ar[i * 4 + s], xi = ai[i * 4 + s];
      const fr = (xr * pr + xi * pi) / pq, fi = (xi * pr - xr * pi) / pq;
      for (let j = s; j < 4; j++) {
        const ur = ar[s * 4 + j], ui = ai[s * 4 + j];
        ar[i * 4 + j] -= fr * ur - fi * ui;
        ai[i * 4 + j] -= fr * ui + fi * ur;
      }
    }
  }
  const out = [];
  for (let f = 0; f < k; f++) {
    const xr = new Float64Array(4), xi = new Float64Array(4);
    xr[r + f] = 1;
    for (let i = r - 1; i >= 0; i--) {
      let sr = 0, si = 0;
      for (let j = i + 1; j < 4; j++) {
        sr += ar[i * 4 + j] * xr[j] - ai[i * 4 + j] * xi[j];
        si += ar[i * 4 + j] * xi[j] + ai[i * 4 + j] * xr[j];
      }
      const dr = ar[i * 4 + i], di = ai[i * 4 + i], dq = dr * dr + di * di;
      xr[i] = -(sr * dr + si * di) / dq;
      xi[i] = -(si * dr - sr * di) / dq;
    }
    const vr = new Float64Array(4), vi = new Float64Array(4);
    let nrm = 0;
    for (let j = 0; j < 4; j++) { vr[perm[j]] = xr[j]; vi[perm[j]] = xi[j]; nrm += xr[j] ** 2 + xi[j] ** 2; }
    nrm = Math.sqrt(nrm);
    for (let j = 0; j < 4; j++) { vr[j] /= nrm; vi[j] /= nrm; }
    out.push([vr, vi]);
  }
  return out;
}

/** Determinant of a complex 4x4 (partial pivoting). Returns [re, im]. */
function det4(Mr, Mi) {
  const ar = Mr.slice(), ai = Mi.slice();
  let dr = 1, di = 0;
  for (let s = 0; s < 4; s++) {
    let p = s, bm = -1;
    for (let i = s; i < 4; i++) { const m = ar[i * 4 + s] ** 2 + ai[i * 4 + s] ** 2; if (m > bm) { bm = m; p = i; } }
    if (bm === 0) return [0, 0];
    if (p !== s) {
      for (let j = 0; j < 4; j++) {
        let t = ar[s * 4 + j]; ar[s * 4 + j] = ar[p * 4 + j]; ar[p * 4 + j] = t;
        t = ai[s * 4 + j]; ai[s * 4 + j] = ai[p * 4 + j]; ai[p * 4 + j] = t;
      }
      dr = -dr; di = -di;
    }
    const pr = ar[s * 4 + s], pi = ai[s * 4 + s];
    const nr = dr * pr - di * pi; di = dr * pi + di * pr; dr = nr;
    const pq = pr * pr + pi * pi;
    for (let i = s + 1; i < 4; i++) {
      const xr = ar[i * 4 + s], xi = ai[i * 4 + s];
      const fr = (xr * pr + xi * pi) / pq, fi = (xi * pr - xr * pi) / pq;
      for (let j = s; j < 4; j++) {
        const ur = ar[s * 4 + j], ui = ai[s * 4 + j];
        ar[i * 4 + j] -= fr * ur - fi * ui;
        ai[i * 4 + j] -= fr * ui + fi * ur;
      }
    }
  }
  return [dr, di];
}

/** Solve the complex 4x4 system M x = (0, 0, 0, 1). Returns [xr, xi]. */
function solveE4(Mr, Mi) {
  const ar = Mr.slice(), ai = Mi.slice();
  const br = new Float64Array([0, 0, 0, 1]), bi = new Float64Array(4);
  for (let s = 0; s < 4; s++) {
    let p = s, bm = -1;
    for (let i = s; i < 4; i++) { const m = ar[i * 4 + s] ** 2 + ai[i * 4 + s] ** 2; if (m > bm) { bm = m; p = i; } }
    if (p !== s) {
      for (let j = 0; j < 4; j++) {
        let t = ar[s * 4 + j]; ar[s * 4 + j] = ar[p * 4 + j]; ar[p * 4 + j] = t;
        t = ai[s * 4 + j]; ai[s * 4 + j] = ai[p * 4 + j]; ai[p * 4 + j] = t;
      }
      let t = br[s]; br[s] = br[p]; br[p] = t;
      t = bi[s]; bi[s] = bi[p]; bi[p] = t;
    }
    const pr = ar[s * 4 + s], pi = ai[s * 4 + s], pq = pr * pr + pi * pi;
    for (let i = s + 1; i < 4; i++) {
      const xr = ar[i * 4 + s], xi = ai[i * 4 + s];
      const fr = (xr * pr + xi * pi) / pq, fi = (xi * pr - xr * pi) / pq;
      for (let j = s; j < 4; j++) {
        const ur = ar[s * 4 + j], ui = ai[s * 4 + j];
        ar[i * 4 + j] -= fr * ur - fi * ui;
        ai[i * 4 + j] -= fr * ui + fi * ur;
      }
      br[i] -= fr * br[s] - fi * bi[s];
      bi[i] -= fr * bi[s] + fi * br[s];
    }
  }
  const xr = new Float64Array(4), xi = new Float64Array(4);
  for (let i = 3; i >= 0; i--) {
    let sr = br[i], si = bi[i];
    for (let j = i + 1; j < 4; j++) {
      sr -= ar[i * 4 + j] * xr[j] - ai[i * 4 + j] * xi[j];
      si -= ar[i * 4 + j] * xi[j] + ai[i * 4 + j] * xr[j];
    }
    const dr = ar[i * 4 + i], di = ai[i * 4 + i], dq = dr * dr + di * di;
    xr[i] = (sr * dr + si * di) / dq;
    xi[i] = (si * dr - sr * di) / dq;
  }
  return [xr, xi];
}

// ---------------------------------------------------------------------------
// Evaluation at one velocity

const REAL_TOL = 1e-9;

/** True if det Gamma has a real root at velocity v (v is at or above the bulk-wave limit). */
function hasRealRoot(ctx, v) {
  const { zr, zi } = polyRoots(detPoly(ctx, v).coef);
  for (let k = 0; k < zr.length; k++) if (Math.abs(zi[k]) < REAL_TOL * (1 + Math.hypot(zr[k], zi[k]))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Isotropic metal film on the surface (electrode mass loading)
//
// Film at 0 < x3 < h on the substrate, vacuum above; it conducts, so phi = 0 at x3 = 0.
// State xi = (u1, u2, u3, t1, t2, t3) with t_j = T3j / (i k C0), as in the boundary rows,
// so u and t are continuous at x3 = 0. In the film d(xi)/d(k x3) = i R xi with R real, and
// xi(h) = exp(i R kh) xi(0). The top is traction-free: rows 3..5 of exp(i R kh) applied to
// the substrate's surface state vanish. kh = 0 gives back the metallized surface.

/** Scaled isotropic film from density (kg/m^3), Young's modulus (Pa) and Poisson ratio. */
export function isoFilm({ rho, E, nu }) {
  return { rho: rho / C0, lam: (E * nu) / ((1 + nu) * (1 - 2 * nu)) / C0, mu: E / (2 * (1 + nu)) / C0 };
}

const mul6 = (P, Q) => {
  const out = new Float64Array(36);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) {
    const p = P[i * 6 + k];
    if (p !== 0) for (let j = 0; j < 6; j++) out[i * 6 + j] += p * Q[k * 6 + j];
  }
  return out;
};

/** exp(i X) for a real 6x6 X (flat), as [re, im]; scaling and squaring with a Taylor series. */
export function expmI(X) {
  let nrm = 0;
  for (let i = 0; i < 6; i++) { let r = 0; for (let j = 0; j < 6; j++) r += Math.abs(X[i * 6 + j]); nrm = Math.max(nrm, r); }
  const s = Math.max(0, Math.ceil(Math.log2(nrm / 0.25)));
  const Y = X.map((x) => x / 2 ** s);
  let Er = new Float64Array(36), Ei = new Float64Array(36);
  for (let i = 0; i < 6; i++) Er[i * 7] = 1;
  let T = new Float64Array(36);
  for (let i = 0; i < 6; i++) T[i * 7] = 1;
  for (let n = 1; n <= 30; n++) {
    T = mul6(T, Y).map((x) => x / n); // Y^n / n!
    const sgn = n % 4 < 2 ? 1 : -1; // i^n = 1, i, -1, -i
    const tgt = n % 2 === 0 ? Er : Ei;
    let big = 0;
    for (let q = 0; q < 36; q++) { tgt[q] += sgn * T[q]; big = Math.max(big, Math.abs(T[q])); }
    if (big < 1e-18) break;
  }
  for (let k = 0; k < s; k++) {
    const rr = mul6(Er, Er), ii = mul6(Ei, Ei), ri = mul6(Er, Ei), ir = mul6(Ei, Er);
    Er = rr.map((x, q) => x - ii[q]);
    Ei = ri.map((x, q) => x + ir[q]);
  }
  return [Er, Ei];
}

/** Transfer matrix exp(i R kh) of the film at phase velocity v (m/s). */
function filmTransfer(film, v, kh) {
  const { lam, mu, rho } = film;
  const L2 = lam + 2 * mu, rv2 = rho * v * v, M = (4 * mu * (lam + mu)) / L2;
  const R = new Float64Array(36);
  const set = (r, c, x) => { R[r * 6 + c] = x * kh; };
  set(0, 2, -1); set(0, 3, 1 / mu); //          du1 = i (t1/mu - u3)
  set(1, 4, 1 / mu); //                         du2 = i t2/mu
  set(2, 0, -lam / L2); set(2, 5, 1 / L2); //   du3 = i (t3 - lam u1)/(lam + 2mu)
  set(3, 0, rv2 - M); set(3, 5, -lam / L2); //  dt1 = i ((rho v^2 - M) u1 - lam/(lam + 2mu) t3)
  set(4, 1, rv2 - mu); //                       dt2 = i (rho v^2 - mu) u2
  set(5, 2, rv2); set(5, 3, -1); //             dt3 = i (rho v^2 u3 - t1)
  return expmI(R);
}

/**
 * Boundary determinants (columns normalized, so |det| is independent of phase choices)
 * and, optionally, eps_eff(v)/eps0 of the traction-free surface. With a film
 * ({ rho, lam, mu } scaled, and kh), also dFilm for the film-covered surface.
 */
export function evalAt(ctx, v, wantEps = false, film = null) {
  const { coef, g } = detPoly(ctx, v);
  const { zr, zi } = polyRoots(coef);
  const sel = [];
  for (let k = 0; k < 8; k++) {
    if (Math.abs(zi[k]) < REAL_TOL * (1 + Math.hypot(zr[k], zi[k]))) return { ok: false };
    if (zi[k] < 0) sel.push(k);
  }
  if (sel.length !== 4) return { ok: false };

  // Partial-wave eigenvectors; near-equal roots share a null space.
  const betas = sel.map((k) => [zr[k], zi[k]]);
  const vecs = new Array(4);
  const done = [false, false, false, false];
  const gammaAt = (br, bi) => {
    const Mr = new Float64Array(16), Mi = new Float64Array(16);
    const b2r = br * br - bi * bi, b2i = 2 * br * bi;
    for (let q = 0; q < 16; q++) {
      const o = q * 3;
      Mr[q] = g[o] + g[o + 1] * br + g[o + 2] * b2r;
      Mi[q] = g[o + 1] * bi + g[o + 2] * b2i;
    }
    return [Mr, Mi];
  };
  for (let a = 0; a < 4; a++) {
    if (done[a]) continue;
    const grp = [a];
    for (let b = a + 1; b < 4; b++) {
      if (!done[b] && Math.hypot(betas[a][0] - betas[b][0], betas[a][1] - betas[b][1]) < 1e-6 * (1 + Math.hypot(...betas[a]))) grp.push(b);
    }
    const mr = grp.reduce((s, q) => s + betas[q][0], 0) / grp.length;
    const mi = grp.reduce((s, q) => s + betas[q][1], 0) / grp.length;
    const [Mr, Mi] = gammaAt(mr, mi);
    const nv = nullVectors(Mr, Mi, grp.length);
    grp.forEach((q, i) => { vecs[q] = nv[i]; done[q] = true; });
  }

  // Boundary matrices: rows t1, t2, t3, then (open) D3 + i phi or (short) phi.
  const B = ctx.B;
  const Or = new Float64Array(16), Oi = new Float64Array(16);
  const Sr = new Float64Array(16), Si = new Float64Array(16);
  const Dr = new Float64Array(4), Di = new Float64Array(4);
  for (let col = 0; col < 4; col++) {
    const [br, bi] = betas[col];
    const [ur, ui] = vecs[col];
    for (let row = 0; row < 4; row++) {
      let sr = 0, si = 0;
      for (let k = 0; k < 4; k++) {
        const o = (row * 4 + k) * 2;
        const cr = B[o] + B[o + 1] * br, ci = B[o + 1] * bi;
        sr += cr * ur[k] - ci * ui[k];
        si += cr * ui[k] + ci * ur[k];
      }
      if (row < 3) {
        Or[row * 4 + col] = sr; Oi[row * 4 + col] = si;
        Sr[row * 4 + col] = sr; Si[row * 4 + col] = si;
      } else {
        Dr[col] = sr; Di[col] = si;
        Or[12 + col] = sr - ui[3]; Oi[12 + col] = si + ur[3]; // D3 + i*phi
        Sr[12 + col] = ur[3]; Si[12 + col] = ui[3]; // phi
      }
    }
  }
  // Normalize by the determinant of the eigenvector matrix: when two partial waves
  // coalesce, two columns of the boundary matrix become parallel and |det B| -> 0
  // without a SAW; |det V| vanishes at the same rate, so the ratio stays finite.
  const Vr = new Float64Array(16), Vi = new Float64Array(16);
  for (let col = 0; col < 4; col++) for (let k = 0; k < 4; k++) {
    Vr[k * 4 + col] = vecs[col][0][k]; Vi[k * 4 + col] = vecs[col][1][k];
  }
  const dV = Math.hypot(...det4(Vr, Vi));
  const dO = det4(Or, Oi), dS = det4(Sr, Si);
  const out = { ok: true, dOpen: Math.hypot(dO[0], dO[1]) / dV, dShort: Math.hypot(dS[0], dS[1]) / dV };
  if (film) {
    const [Pr, Pi] = filmTransfer(film, v, film.kh);
    const Fr = new Float64Array(16), Fi = new Float64Array(16);
    for (let col = 0; col < 4; col++) {
      const [ur, ui] = vecs[col];
      const xr = [ur[0], ur[1], ur[2], Sr[col], Sr[4 + col], Sr[8 + col]];
      const xi = [ui[0], ui[1], ui[2], Si[col], Si[4 + col], Si[8 + col]];
      for (let r = 0; r < 3; r++) { // traction at the film top
        let a = 0, b = 0;
        for (let j = 0; j < 6; j++) {
          const pr = Pr[(3 + r) * 6 + j], pi = Pi[(3 + r) * 6 + j];
          a += pr * xr[j] - pi * xi[j]; b += pr * xi[j] + pi * xr[j];
        }
        Fr[r * 4 + col] = a; Fi[r * 4 + col] = b;
      }
      Fr[12 + col] = ur[3]; Fi[12 + col] = ui[3]; // phi = 0 under the metal
    }
    const dF = det4(Fr, Fi);
    out.dFilm = Math.hypot(dF[0], dF[1]) / dV;
  }
  if (wantEps) {
    // phi(0) = 1 on a traction-free surface: eps_eff/eps0 = 1 - i * sum(C_r D_r)
    const [xr, xi] = solveE4(Sr, Si);
    let sr = 0, si = 0;
    for (let col = 0; col < 4; col++) { sr += xr[col] * Dr[col] - xi[col] * Di[col]; si += xr[col] * Di[col] + xi[col] * Dr[col]; }
    out.eps = 1 + si; // 1 - i*(sr + i si) = 1 + si - i sr
    out.epsImag = -sr;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Velocity search

/** Slowest bulk-wave limit along x1: the lowest v at which det Gamma has a real root. */
export function bulkLimit(ctx, lo = 1, hi = 2e4) {
  for (let it = 0; it < 48; it++) {
    const mid = 0.5 * (lo + hi);
    if (hasRealRoot(ctx, mid)) hi = mid; else lo = mid;
  }
  return lo;
}

/** Golden-section minimum of f on [a, b]. */
function goldenMin(f, a, b, relTol = 1e-12) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let x1 = b - gr * (b - a), x2 = a + gr * (b - a);
  let f1 = f(x1), f2 = f(x2);
  for (let it = 0; it < 200 && b - a > relTol * Math.abs(b); it++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - gr * (b - a); f1 = f(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + gr * (b - a); f2 = f(x2); }
  }
  return f1 < f2 ? { x: x1, f: f1 } : { x: x2, f: f2 };
}

/**
 * Slowest root of a boundary determinant from a grid scanned in increasing v: refine the
 * local minima in order of velocity and return the first that is a true zero. Some
 * orientations have a second surface wave just below the bulk limit (for example a
 * shear-horizontal wave bound only by metallization); the Rayleigh-type wave is the slowest.
 */
function rootFromGrid(vs, fs, f) {
  const n = vs.length;
  const scale = [...fs].filter(Number.isFinite).sort((a, b) => a - b)[Math.floor(n / 2)];
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(fs[i])) continue;
    const l = i > 0 ? fs[i - 1] : Infinity, r = i < n - 1 ? fs[i + 1] : Infinity;
    if (!(fs[i] <= l && fs[i] <= r)) continue;
    const m = goldenMin(f, vs[Math.max(0, i - 1)], vs[Math.min(n - 1, i + 1)]);
    if (m.f < 1e-6 * scale) return m.x;
  }
  return null;
}

const finite = (f) => (v) => { const r = f(v); return Number.isFinite(r) ? r : Infinity; };

/**
 * Free and metallized SAW velocities for one orientation.
 * Returns { ok, v0, vm, K2, epsInf, vlim } (velocities in m/s, epsInf relative to eps0).
 */
export function solveContext(ctx) {
  const vlim = bulkLimit(ctx);
  const N = 72;
  const vs = new Float64Array(N), fo = new Float64Array(N), fs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const u = 0.6 * Math.pow(1e-7 / 0.6, i / (N - 1));
    vs[i] = vlim * (1 - u);
    const r = evalAt(ctx, vs[i]);
    fo[i] = r.ok ? r.dOpen : NaN;
    fs[i] = r.ok ? r.dShort : NaN;
  }
  const open = finite((v) => { const r = evalAt(ctx, v); return r.ok ? r.dOpen : NaN; });
  const short = finite((v) => { const r = evalAt(ctx, v); return r.ok ? r.dShort : NaN; });
  const v0 = rootFromGrid(vs, fo, open);
  const vm = rootFromGrid(vs, fs, short);
  // eps_inf = eps_eff(v -> 0). eps_eff is even in v, so extrapolate linearly in v^2
  // from two small velocities (avoids the degenerate static limit of isotropic media).
  const v1 = 0.03 * vlim, v2 = 0.06 * vlim;
  const e1 = evalAt(ctx, v1, true), e2 = evalAt(ctx, v2, true);
  const epsInf = e1.ok && e2.ok ? (e1.eps * v2 * v2 - e2.eps * v1 * v1) / (v2 * v2 - v1 * v1) : NaN;
  if (v0 == null || vm == null) return { ok: false, v0, vm, K2: null, epsInf, vlim };
  return { ok: true, v0, vm, K2: (2 * (v0 - vm)) / v0, epsInf, vlim };
}

/**
 * SAW velocity (m/s) under a continuous isotropic metal film of thickness h, kh = 2 pi h / lambda,
 * film = isoFilm(...). The slowest root below the bulk limit (the Rayleigh-type mode).
 */
export function filmVelocity(ctx, film, kh, vlim = bulkLimit(ctx)) {
  const f = { ...film, kh };
  const N = 72;
  const vs = new Float64Array(N), fs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    vs[i] = vlim * (1 - 0.6 * Math.pow(1e-7 / 0.6, i / (N - 1)));
    const r = evalAt(ctx, vs[i], false, f);
    fs[i] = r.ok ? r.dFilm : NaN;
  }
  return rootFromGrid(vs, fs, finite((v) => { const r = evalAt(ctx, v, false, f); return r.ok ? r.dFilm : NaN; }));
}

/** Free-surface velocity near a known value (warm start), for the power-flow angle. */
function v0Near(ctx, vGuess, w = 5e-3) {
  const vlim = bulkLimit(ctx);
  const hi = Math.min(vGuess * (1 + w), vlim * (1 - 1e-9));
  const f = finite((v) => { const r = evalAt(ctx, v); return r.ok ? r.dOpen : NaN; });
  return goldenMin(f, vGuess * (1 - w), hi).x;
}

/**
 * Full result for an orientation (rotation matrix A, rows = x1, x2, x3 in crystal axes).
 * pfa: power-flow angle (deg), positive for energy flow rotated counter-clockwise about
 * the surface normal from the propagation direction; from tan(pfa) = (1/v) dv/dpsi.
 */
export function solveOrientation(cr, A, { pfa = true } = {}) {
  const res = solveContext(prepare(cr, A));
  res.Cs = res.epsInf * EPS0; // F/m per finger pair, metallization ratio 0.5
  res.pfa = null;
  if (pfa && res.ok) {
    const d = 0.25 * Math.PI / 180;
    const vp = v0Near(prepare(cr, rotateAboutNormal(A, d)), res.v0);
    const vn = v0Near(prepare(cr, rotateAboutNormal(A, -d)), res.v0);
    res.pfa = Math.atan((vp - vn) / (2 * d * res.v0)) * 180 / Math.PI;
  }
  return res;
}
