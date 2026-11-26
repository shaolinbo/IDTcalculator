// Periodic grating of electrodes on a piezoelectric substrate: finite elements on one
// period (a unit cell, as in a COMSOL periodic study) at the Bragg condition.
//
// Cell: x1 in [0, p] (p = electrode pitch), x3 vertical. Substrate (rotated, piezoelectric)
// for -D < x3 < 0, clamped and grounded at -D; one rectangular metal strip of width eta*p and
// thickness h centred on the cell; vacuum above, up to H, with phi = 0 there. Fields do not
// depend on x2 (infinite aperture), so each node carries u1, u2, u3 and phi. The sides are
// anti-periodic, f(x + p) = -f(x): the wavenumber is pi/p, where the two Rayleigh modes of
// the grating are the stopband edges. The strip is an isotropic elastic conductor: its
// potential is 0 (shorted grating) or a floating value with zero net charge (open grating).
//
// Lengths are in units of p and the material constants scaled as in solver.js, so the
// eigenvalue is (omega p)^2 in (m/s)^2 and f p = sqrt(lambda) / (2 pi).
// With the shorted edges f1 < f2: velocity under the IDT v = p (f1 + f2), reflection per
// electrode |r_s| = pi (f2 - f1)/(f1 + f2) (COM: edges at f0 (1 ± |r_s|/pi)). The edge that
// moves when the grating is opened couples to the IDT; with the COM sign convention of
// com.js, r_s < 0 when that is the lower edge.
import { EPS0, voigt3m } from './constants.js?v=e80927370c';
import { fullTensors, rotateTensor } from './tensor.js?v=e80927370c';

const C0 = 1e11;
const SE = Math.sqrt(C0 * EPS0);
const VG = [[0, 5, 4], [5, 1, 3], [4, 3, 2]]; // Voigt index of (i, j)

/** Rotated, scaled Voigt matrices (device axes) and density of the substrate. */
function substrateVoigt(m, A) {
  const T = fullTensors(voigt3m(m));
  const c = rotateTensor(T.c, A, 4), e = rotateTensor(T.e, A, 3), eps = rotateTensor(T.eps, A, 2);
  const C = Array.from({ length: 6 }, () => new Float64Array(6));
  const E = Array.from({ length: 3 }, () => new Float64Array(6));
  const P = Array.from({ length: 3 }, () => new Float64Array(3));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    for (let k = 0; k < 3; k++) {
      E[k][VG[i][j]] = e[(k * 3 + i) * 3 + j] / SE;
      for (let l = 0; l < 3; l++) C[VG[i][j]][VG[k][l]] = c[((i * 3 + j) * 3 + k) * 3 + l] / C0;
    }
    P[i][j] = eps[i * 3 + j] / EPS0;
  }
  return { C, E, P, rho: m.rho / C0 };
}

function isoVoigt({ density, E, nu }) {
  const mu = E / (2 * (1 + nu)) / C0, lam = (E * nu) / ((1 + nu) * (1 - 2 * nu)) / C0;
  const C = Array.from({ length: 6 }, () => new Float64Array(6));
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) C[i][j] = lam; C[i][i] = lam + 2 * mu; C[i + 3][i + 3] = mu; }
  return { C, rho: density / C0 };
}

/** Graded 1D spacing: first step d0, growth g, total length Ltot (last step trimmed). */
function graded(d0, g, Ltot, dmax = Infinity) {
  const out = [];
  let s = 0, d = Math.min(d0, dmax);
  while (s + d < Ltot - 1e-12) { out.push(d); s += d; d = Math.min(d * g, dmax); }
  const rest = Ltot - s;
  if (out.length && rest < 0.5 * out[out.length - 1]) out[out.length - 1] += rest; else out.push(rest);
  return out;
}

/** Element edges -> Q9 node coordinates (with mid-side nodes). */
function nodesOf(edges) {
  const out = [edges[0]];
  for (let i = 1; i < edges.length; i++) out.push((edges[i - 1] + edges[i]) / 2, edges[i]);
  return out;
}

/**
 * Build the unit-cell model. Options: eta (metallization ratio, 0..1), hp (h/p),
 * res (mesh refinement, 1 = default), D and H (substrate and vacuum depths in p).
 */
export function buildCell(substrate, A, metal, { eta = 0.5, hp = 0, res = 1, D = 8, H = 4 } = {}) {
  const sub = substrateVoigt(substrate, A);
  const met = metal ? isoVoigt(metal) : null;
  const hasStrip = eta > 0 && !!met;
  const dx = 1 / (8 * res);
  // x edges: gap | strip | gap, with the strip edges on element edges and the elements
  // graded down toward the strip edges, where the charge density is singular.
  const xs = [0];
  const fine = dx / 4, grow = 1.6;
  const push = (sizes, a) => { let x = a; for (const s of sizes) { x += s; xs.push(x); } };
  const toward = (len) => graded(fine, grow, len, dx).reverse(); // coarse to fine, finest last
  const x0s = (1 - eta) / 2, x1s = (1 + eta) / 2;
  if (!hasStrip || eta >= 1) { const n = Math.max(1, Math.round(1 / dx)); for (let i = 1; i <= n; i++) xs.push(i / n); }
  else {
    const gap = toward(x0s), half = toward(eta / 2);
    push(gap, 0); // fine at the left strip edge
    push(half.slice().reverse(), x0s); push(half, 0.5); // strip: fine at both edges
    push(gap.slice().reverse(), x1s);
    xs[xs.length - 1] = 1;
  }
  // z edges (bottom to top): substrate, strip layer, vacuum; fine near the surface.
  const subSteps = graded(dx / 3, 1.35, D, 1).reverse();
  const zs = [-D];
  for (const d of subSteps) zs.push(zs[zs.length - 1] + d);
  zs[zs.length - 1] = 0;
  const thick = hasStrip && hp > 0;
  const nh = thick ? Math.max(1, Math.ceil(hp / (0.6 * dx))) : 0;
  for (let i = 1; i <= nh; i++) zs.push((hp * i) / nh);
  const top = thick ? hp : 0;
  for (const d of graded(dx / 3, 1.35, H, 1)) zs.push(zs[zs.length - 1] + d);
  zs[zs.length - 1] = top + H;
  const X = nodesOf(xs), Z = nodesOf(zs);
  const nxN = X.length, nzN = Z.length, ex = xs.length - 1, ez = zs.length - 1;
  const kSub = 2 * subSteps.length; // node row index of x3 = 0
  const kTop = kSub + 2 * nh; // node row index of the strip top

  // Element kinds: 0 substrate, 1 metal, 2 vacuum.
  const inStrip = (xc) => hasStrip && xc > x0s - 1e-12 && xc < x1s + 1e-12;
  const kind = new Uint8Array(ex * ez);
  for (let j = 0; j < ez; j++) for (let i = 0; i < ex; i++) {
    const zc = (zs[j] + zs[j + 1]) / 2, xc = (xs[i] + xs[i + 1]) / 2;
    kind[j * ex + i] = zc < 0 ? 0 : (thick && zc < hp && inStrip(xc) ? 1 : 2);
  }
  // Node flags.
  const SUB = 1, MET = 2, VAC = 4;
  const flag = new Uint8Array(nxN * nzN);
  for (let j = 0; j < ez; j++) for (let i = 0; i < ex; i++) {
    const f = [SUB, MET, VAC][kind[j * ex + i]];
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) flag[(2 * j + b) * nxN + 2 * i + a] |= f;
  }
  // Zero-thickness strips: surface nodes under the strip are electrode nodes.
  const isElectrode = (ix, iz) => (thick ? (flag[iz * nxN + ix] & MET) !== 0
    : hasStrip && iz === kSub && X[ix] > x0s - 1e-12 && X[ix] < x1s + 1e-12);
  return { sub, met, X, Z, xs, zs, ex, ez, nxN, nzN, kind, flag, kSub, kTop, isElectrode, SUB, MET, VAC, eta, hp };
}

/**
 * Number the degrees of freedom. mode: 'short' (strip potential 0) or 'open' (one
 * floating potential). Returns per node and component { idx, sgn } maps (idx -1 = fixed)
 * and the number of unknowns. Right-edge nodes are the left-edge nodes with sign -1.
 */
function numberDofs(cell, mode) {
  const { nxN, nzN, flag, SUB, MET, VAC, kTop, isElectrode } = cell;
  const idx = new Int32Array(nxN * nzN * 4).fill(-1);
  const sgn = new Float64Array(nxN * nzN * 4).fill(1);
  let n = 0, vDof = -1;
  const needV = mode === 'open';
  const PENDING = -2; // electrode potential of an open grating, numbered after the strip rows
  let anyElectrode = false;
  for (let iz = 0; iz < nzN; iz++) {
    for (let ix = 0; ix < nxN - 1; ix++) {
      const k = iz * nxN + ix, f = flag[k];
      const hasU = (f & (SUB | MET)) && iz > 0;
      const hasPhi = (f & (SUB | VAC)) && iz > 0 && iz < nzN - 1;
      if (hasU) for (let c = 0; c < 3; c++) idx[k * 4 + c] = n++;
      if (isElectrode(ix, iz)) {
        anyElectrode = true;
        if (needV) idx[k * 4 + 3] = PENDING; // shorted: stays fixed at 0
      } else if (hasPhi) idx[k * 4 + 3] = n++;
    }
    if (needV && anyElectrode && vDof < 0 && iz >= kTop) vDof = n++;
  }
  for (let k = 0; k < nxN * nzN; k++) if (idx[k * 4 + 3] === PENDING) idx[k * 4 + 3] = vDof;
  // Anti-periodic right edge.
  for (let iz = 0; iz < nzN; iz++) {
    const r = iz * nxN + nxN - 1, l = iz * nxN;
    for (let c = 0; c < 4; c++) { idx[r * 4 + c] = idx[l * 4 + c]; sgn[r * 4 + c] = -sgn[l * 4 + c]; }
  }
  return { idx, sgn, n, vDof };
}

// Q9 shape functions on [-1, 1]^2: node (a, b), a along x, b along z.
const L1 = [(t) => (t * (t - 1)) / 2, (t) => 1 - t * t, (t) => (t * (t + 1)) / 2];
const D1 = [(t) => t - 0.5, (t) => -2 * t, (t) => t + 0.5];
const GP = [-Math.sqrt(0.6), 0, Math.sqrt(0.6)], GW = [5 / 9, 8 / 9, 5 / 9];

/**
 * Assemble K and M in band storage (column-major, ld = kl + ku + 1, entry (i, j) at
 * j*ld + ku + i - j). K holds [[Kuu, Kuphi], [Kphiu, -Kphiphi]].
 */
function assemble(cell, dofs) {
  const { X, Z, ex, ez, nxN, kind, sub, met } = cell;
  const { idx, sgn, n } = dofs;
  const elDofs = (i, j) => {
    const list = [];
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
      const k = (2 * j + b) * nxN + 2 * i + a;
      for (let c = 0; c < 4; c++) list.push([idx[k * 4 + c], sgn[k * 4 + c]]);
    }
    return list; // 9 nodes x 4 components, node-major
  };
  let bw = 0;
  for (let j = 0; j < ez; j++) for (let i = 0; i < ex; i++) {
    const d = elDofs(i, j).map((q) => q[0]).filter((q) => q >= 0);
    bw = Math.max(bw, Math.max(...d) - Math.min(...d));
  }
  const kl = bw, ku = bw, ld = kl + ku + 1;
  const K = new Float64Array(ld * n), M = new Float64Array(ld * n);
  const add = (Arr, i, j, v) => { Arr[j * ld + ku + i - j] += v; };
  const Ke = new Float64Array(36 * 36), Me = new Float64Array(36 * 36);
  const B = new Float64Array(6 * 3 * 9), G = new Float64Array(3 * 9), N = new Float64Array(9);
  for (let j = 0; j < ez; j++) for (let i = 0; i < ex; i++) {
    const kd = kind[j * ex + i];
    const xa = X[2 * i], xb = X[2 * i + 2], za = Z[2 * j], zb = Z[2 * j + 2];
    const hx = xb - xa, hz = zb - za, detJ = (hx * hz) / 4;
    Ke.fill(0); Me.fill(0);
    const mat = kd === 0 ? sub : kd === 1 ? met : null;
    for (let gx = 0; gx < 3; gx++) for (let gz = 0; gz < 3; gz++) {
      const xi = GP[gx], et = GP[gz], w = GW[gx] * GW[gz] * detJ;
      for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
        const q = b * 3 + a;
        N[q] = L1[a](xi) * L1[b](et);
        const nx = (D1[a](xi) * L1[b](et) * 2) / hx, nz = (L1[a](xi) * D1[b](et) * 2) / hz;
        G[q * 3] = nx; G[q * 3 + 1] = 0; G[q * 3 + 2] = nz;
        // B (6x3) for node q: S1 = nx u1, S3 = nz u3, S4 = nz u2, S5 = nz u1 + nx u3, S6 = nx u2.
        const o = q * 18;
        B.fill(0, o, o + 18);
        B[o + 0 * 3 + 0] = nx; B[o + 2 * 3 + 2] = nz; B[o + 3 * 3 + 1] = nz;
        B[o + 4 * 3 + 0] = nz; B[o + 4 * 3 + 2] = nx; B[o + 5 * 3 + 1] = nx;
      }
      for (let p = 0; p < 9; p++) for (let q = 0; q < 9; q++) {
        if (mat) {
          // Kuu = B_p^T C B_q; mass.
          for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) {
            let v = 0;
            for (let I = 0; I < 6; I++) {
              const bpi = B[p * 18 + I * 3 + r];
              if (bpi === 0) continue;
              for (let Jv = 0; Jv < 6; Jv++) v += bpi * mat.C[I][Jv] * B[q * 18 + Jv * 3 + s];
            }
            Ke[(p * 4 + r) * 36 + q * 4 + s] += w * v;
          }
          const mm = w * mat.rho * N[p] * N[q];
          for (let r = 0; r < 3; r++) Me[(p * 4 + r) * 36 + q * 4 + r] += mm;
        }
        if (kd === 0) {
          // Kuphi = B_p^T E^T g_q, and its transpose; -Kphiphi = -g_p^T eps g_q.
          for (let r = 0; r < 3; r++) {
            let v = 0;
            for (let I = 0; I < 6; I++) {
              const bpi = B[p * 18 + I * 3 + r];
              if (bpi === 0) continue;
              for (let k = 0; k < 3; k++) v += bpi * sub.E[k][I] * G[q * 3 + k];
            }
            Ke[(p * 4 + r) * 36 + q * 4 + 3] += w * v;
            Ke[(q * 4 + 3) * 36 + p * 4 + r] += w * v;
          }
        }
        if (kd === 0 || kd === 2) {
          let v = 0;
          for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) v += G[p * 3 + k] * (kd === 0 ? sub.P[k][l] : k === l ? 1 : 0) * G[q * 3 + l];
          Ke[(p * 4 + 3) * 36 + q * 4 + 3] -= w * v;
        }
      }
    }
    const d = elDofs(i, j);
    for (let r = 0; r < 36; r++) {
      const [gi, si] = d[r];
      if (gi < 0) continue;
      for (let c = 0; c < 36; c++) {
        const [gj, sj] = d[c];
        if (gj < 0) continue;
        const kv = Ke[r * 36 + c], mv = Me[r * 36 + c];
        if (kv !== 0) add(K, gi, gj, si * sj * kv);
        if (mv !== 0) add(M, gi, gj, si * sj * mv);
      }
    }
  }
  return { K, M, n, kl, ku, ld };
}

// ---------------------------------------------------------------------------
// Band LU with partial pivoting (LAPACK dgbtf2/dgbtrs), and the shift-invert eigensolver

function bandLU(sys, sigma) {
  const { K, M, n, kl, ku, ld } = sys;
  const kv = kl + ku, ldab = 2 * kl + ku + 1;
  const AB = new Float64Array(ldab * n);
  for (let j = 0; j < n; j++) {
    for (let i = Math.max(0, j - ku); i <= Math.min(n - 1, j + kl); i++) {
      const v = K[j * ld + ku + i - j] - sigma * M[j * ld + ku + i - j];
      AB[j * ldab + kv + i - j] = v;
    }
  }
  const ipiv = new Int32Array(n);
  let ju = 0;
  for (let j = 0; j < n; j++) {
    const km = Math.min(kl, n - 1 - j);
    let jp = 0, big = -1;
    for (let i = 0; i <= km; i++) { const a = Math.abs(AB[j * ldab + kv + i]); if (a > big) { big = a; jp = i; } }
    ipiv[j] = j + jp;
    if (AB[j * ldab + kv + jp] === 0) throw new Error('grating: singular matrix');
    ju = Math.max(ju, Math.min(j + ku + jp, n - 1));
    if (jp !== 0) {
      for (let c = j; c <= ju; c++) {
        const a = c * ldab + kv + j + jp - c, b = c * ldab + kv + j - c;
        const t = AB[a]; AB[a] = AB[b]; AB[b] = t;
      }
    }
    if (km > 0) {
      const col = j * ldab + kv, piv = AB[col];
      for (let i = 1; i <= km; i++) AB[col + i] /= piv;
      for (let c = j + 1; c <= ju; c++) {
        const base = c * ldab + kv + j - c, u = AB[base];
        if (u !== 0) for (let i = 1; i <= km; i++) AB[base + i] -= AB[col + i] * u;
      }
    }
  }
  return { AB, ipiv, n, kl, ku, kv, ldab };
}

function bandSolve(F, b) {
  const { AB, ipiv, n, kl, kv, ldab } = F;
  for (let j = 0; j < n - 1; j++) {
    const l = ipiv[j];
    if (l !== j) { const t = b[l]; b[l] = b[j]; b[j] = t; }
    const km = Math.min(kl, n - 1 - j), col = j * ldab + kv, bj = b[j];
    if (bj !== 0) for (let i = 1; i <= km; i++) b[j + i] -= AB[col + i] * bj;
  }
  for (let j = n - 1; j >= 0; j--) {
    const col = j * ldab + kv;
    b[j] /= AB[col];
    const bj = b[j], lm = Math.min(j, kv);
    if (bj !== 0) for (let i = 1; i <= lm; i++) b[j - i] -= AB[col - i] * bj;
  }
  return b;
}

function bandMul(A, sys, x) {
  const { n, kl, ku, ld } = sys;
  const y = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const xj = x[j];
    if (xj === 0) continue;
    const i0 = Math.max(0, j - ku), i1 = Math.min(n - 1, j + kl), o = j * ld + ku - j;
    for (let i = i0; i <= i1; i++) y[i] += A[o + i] * xj;
  }
  return y;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Symmetric m x m eigenproblem (Jacobi): returns { w, V } with V columns as eigenvectors. */
function jacobiEig(Ain) {
  const m = Ain.length, A = Ain.map((r) => r.slice()), V = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += A[p][q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < m; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < m; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < m; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { w: A.map((r, i) => r[i]), V };
}

/**
 * Lowest eigenvalues of K x = lambda M x near the shift sigma (shift-invert subspace
 * iteration with Rayleigh-Ritz). Returns the m Ritz values in increasing order.
 */
function eigNear(sys, sigma, m = 4, tol = 1e-11, maxIt = 80) {
  const F = bandLU(sys, sigma);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  let Xv = Array.from({ length: m }, () => Float64Array.from({ length: sys.n }, rnd));
  let prev = null, theta = null;
  for (let it = 0; it < maxIt; it++) {
    const Y = Xv.map((x) => bandSolve(F, bandMul(sys.M, sys, x)));
    const KY = Y.map((y) => bandMul(sys.K, sys, y)), MY = Y.map((y) => bandMul(sys.M, sys, y));
    const Kr = Y.map((a) => KY.map((kb) => dot(a, kb))), Mr = Y.map((a) => MY.map((mb) => dot(a, mb)));
    for (let a = 0; a < m; a++) for (let b = 0; b < a; b++) { const k = (Kr[a][b] + Kr[b][a]) / 2, mm = (Mr[a][b] + Mr[b][a]) / 2; Kr[a][b] = Kr[b][a] = k; Mr[a][b] = Mr[b][a] = mm; }
    // Cholesky of Mr, then the standard eigenproblem L^-1 Kr L^-T.
    const Lc = Array.from({ length: m }, () => new Float64Array(m));
    for (let a = 0; a < m; a++) for (let b = 0; b <= a; b++) {
      let s = Mr[a][b];
      for (let k = 0; k < b; k++) s -= Lc[a][k] * Lc[b][k];
      Lc[a][b] = a === b ? Math.sqrt(Math.max(s, 1e-300)) : s / Lc[b][b];
    }
    const fwd = (v) => { const y = new Float64Array(m); for (let a = 0; a < m; a++) { let s = v[a]; for (let k = 0; k < a; k++) s -= Lc[a][k] * y[k]; y[a] = s / Lc[a][a]; } return y; };
    const Wt = Kr.map((row) => fwd(row)); // rows of Kr L^-T transposed
    const Cm = Array.from({ length: m }, (_, a) => fwd(Array.from({ length: m }, (_, b) => Wt[b][a])));
    for (let a = 0; a < m; a++) for (let b = 0; b < a; b++) { const v = (Cm[a][b] + Cm[b][a]) / 2; Cm[a][b] = Cm[b][a] = v; }
    const { w, V } = jacobiEig(Cm.map((r) => Array.from(r)));
    const order = w.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    theta = order.map((o) => o[0]);
    // Z = L^-T V
    const Zc = order.map(([, i]) => {
      const v = V.map((r) => r[i]), z = new Float64Array(m);
      for (let a = m - 1; a >= 0; a--) { let s = v[a]; for (let k = a + 1; k < m; k++) s -= Lc[k][a] * z[k]; z[a] = s / Lc[a][a]; }
      return z;
    });
    Xv = Zc.map((z) => { const x = new Float64Array(sys.n); for (let a = 0; a < m; a++) { const za = z[a]; const y = Y[a]; for (let i = 0; i < sys.n; i++) x[i] += za * y[i]; } return x; });
    if (prev && Math.abs(theta[0] - prev[0]) <= tol * Math.abs(theta[0]) && Math.abs(theta[1] - prev[1]) <= tol * Math.abs(theta[1])) break;
    prev = theta;
  }
  return theta;
}

/**
 * Stopband edges of the grating (f·p in m/s, lower and upper) for a substrate record
 * (constants.js), orientation A, metal { density, E, nu } and geometry. vGuess (m/s) sets
 * the shift; mode 'short' or 'open'.
 */
export function gratingEdges(substrate, A, metal, { eta = 0.5, hp = 0, res = 0.75, mode = 'short', vGuess }) {
  const cell = buildCell(substrate, A, metal, { eta, hp, res });
  const sys = assemble(cell, numberDofs(cell, mode));
  const sigma = (Math.PI * 0.95 * vGuess) ** 2; // (omega p)^2 a little below the expected edges
  const th = eigNear(sys, sigma);
  const fp = th.slice(0, 2).map((t) => Math.sqrt(t) / (2 * Math.PI));
  return { fp, n: sys.n };
}

/**
 * COM parameters from the grating: shorted and open stopband edges, velocity under the
 * IDT v = p (f1 + f2) (shorted), and the signed reflection coefficient per electrode.
 */
export function gratingCOM(substrate, A, metal, { eta = 0.5, hOverLambda = 0, res = 0.75, vGuess }) {
  const hp = 2 * hOverLambda;
  const sh = gratingEdges(substrate, A, metal, { eta, hp, res, mode: 'short', vGuess });
  const op = gratingEdges(substrate, A, metal, { eta, hp, res, mode: 'open', vGuess });
  const [s1, s2] = sh.fp, [o1, o2] = op.fp;
  const v = s1 + s2; // p (f1 + f2) with f p = s
  const mag = (Math.PI * (s2 - s1)) / (s1 + s2);
  // The uncoupled edge is the same for the open and shorted gratings; the coupled one
  // moves (and can pass the other edge), so match edges rather than compare by order.
  const dist = (x) => Math.min(Math.abs(x - o1), Math.abs(x - o2));
  const lowerCoupled = dist(s1) > dist(s2);
  return {
    v, rs: lowerCoupled ? -mag : mag, coupled: lowerCoupled ? 'lower' : 'upper',
    edgesShort: [2 * s1, 2 * s2], edgesOpen: [2 * o1, 2 * o2], // as velocities 2 f p = f λ
    dofs: sh.n,
  };
}
