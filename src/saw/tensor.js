// Full tensors from Voigt matrices, and their rotation to device axes.
//
// Device axes: x1 = propagation direction, x3 = surface normal (pointing out of
// the substrate into vacuum), x2 = x3 × x1. A rotation matrix A has these axes
// as rows, written in crystal coordinates (X, Y, Z).

const vg = (i, j) => (i === j ? i : 6 - i - j); // Voigt index, 0-based

/** Full tensors c[i][j][k][l], e[k][i][j] (k electric), eps[i][j] as flat arrays. */
export function fullTensors({ C, E, EPS }) {
  const c = new Float64Array(81), e = new Float64Array(27), eps = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    eps[i * 3 + j] = EPS[i][j];
    for (let k = 0; k < 3; k++) {
      e[(i * 3 + j) * 3 + k] = E[i][vg(j, k)];
      for (let l = 0; l < 3; l++) c[((i * 3 + j) * 3 + k) * 3 + l] = C[vg(i, j)][vg(k, l)];
    }
  }
  return { c, e, eps };
}

/** Rotate a tensor of the given rank (flat array, 3^rank entries): T'_ij.. = A_ip A_jq .. T_pq.. */
export function rotateTensor(T, A, rank) {
  const n = T.length;
  let a = T;
  for (let pos = 0; pos < rank; pos++) {
    const b = new Float64Array(n);
    const stride = 3 ** (rank - 1 - pos);
    for (let idx = 0; idx < n; idx++) {
      const ip = Math.floor(idx / stride) % 3; // index at this position
      const base = idx - ip * stride;
      b[idx] = A[ip][0] * a[base] + A[ip][1] * a[base + stride] + A[ip][2] * a[base + 2 * stride];
    }
    a = b;
  }
  return a;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const r = Math.hypot(...a); return a.map((x) => x / r); };

/** Rotation from a surface normal n and a propagation direction p (crystal axes). */
export function axesFromNP(n, p) {
  const x3 = unit(n), x1 = unit(p);
  return [x1, cross(x3, x1), x3];
}

/**
 * Rotation from Euler angles (deg), ZXZ convention as used for SAW cuts:
 * rotate by lambda about Z, then mu about the new X, then theta about the new Z.
 * Example: 128°Y-X LiNbO3 = (0, 38, 0); Y-Z = (0, -90, -90) on the +Y face, or (0, 90, 90)
 * on the -Y face (x3 points out of the substrate; both faces give the same SAW values).
 */
export function axesFromEuler(lambda, mu, theta) {
  const r = Math.PI / 180;
  const Rz = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
  const mul = (P, Q) => P.map((row) => [0, 1, 2].map((j) => row[0] * Q[0][j] + row[1] * Q[1][j] + row[2] * Q[2][j]));
  return mul(Rz(theta * r), mul(Rx(mu * r), Rz(lambda * r)));
}

/** Rotate the device axes by angle (rad) about the surface normal x3 (in-plane propagation change). */
export function rotateAboutNormal(A, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x1 = A[0].map((v, i) => c * v + s * A[1][i]);
  const x2 = A[1].map((v, i) => -s * A[0][i] + c * v);
  return [x1, x2, A[2]];
}
