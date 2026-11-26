// Euler angles of an orientation: COMSOL Rotated System and this tool's (lambda, mu, theta).
//
// A (rows x1, x2, x3 = device axes in crystal coordinates) maps crystal components to
// device components; its columns are the crystal axes X, Y, Z in device coordinates.
//
// COMSOL's Rotated System (Euler angles, Z-X-Z, intrinsic) maps components in the local
// (crystal) system to the global system: R = Rz(alpha) Rx(beta) Rz(gamma), active rotations.
// - 3D model: global x = SAW propagation, z = surface normal out of the chip, so R = A.
// - 2D model: global x = SAW propagation, y = surface normal out of the chip,
//   z = x × y (= -x2), so R = M A.
// COMSOL's own 128°Y-X example uses (0, -38°, 0) in 3D and (0, -128°, 0) in 2D.

const D = 180 / Math.PI;
const mul = (P, Q) => P.map((row) => [0, 1, 2].map((j) => row[0] * Q[0][j] + row[1] * Q[1][j] + row[2] * Q[2][j]));

/** Device axes (x1, x2, x3) -> COMSOL 2D axes (x, y, z) = (x1, x3, -x2). */
const M2D = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];

/** Angle in degrees wrapped to (-180, 180], with round-off snapped away. */
function wrap(a) {
  let x = ((((a + 180) % 360) + 360) % 360) - 180;
  if (x <= -180 + 1e-9) x = 180;
  x = Math.round(x * 1e9) / 1e9;
  return Object.is(x, -0) ? 0 : x;
}

/** Active rotation matrix Rz(alpha) Rx(beta) Rz(gamma), angles in degrees. */
export function rotZXZ(alpha, beta, gamma) {
  const Rz = (a) => { const c = Math.cos(a / D), s = Math.sin(a / D); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  const Rx = (a) => { const c = Math.cos(a / D), s = Math.sin(a / D); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  return mul(Rz(alpha), mul(Rx(beta), Rz(gamma)));
}

/**
 * Z-X-Z angles (deg) with R = Rz(alpha) Rx(beta) Rz(gamma). Of the two equivalent sets
 * (beta and -beta), the one with the smaller |alpha| + |gamma| is returned. When beta is
 * 0 or 180°, only alpha ± gamma is defined, and gamma is set to 0.
 */
export function zxzAngles(R) {
  const cb = Math.max(-1, Math.min(1, R[2][2]));
  const sb = Math.hypot(R[2][0], R[2][1]);
  let cands;
  if (sb < 1e-9) {
    cands = [[Math.atan2(R[1][0], R[0][0]) * D, cb > 0 ? 0 : 180, 0]];
  } else {
    const b = Math.atan2(sb, cb) * D;
    const a = Math.atan2(R[0][2], -R[1][2]) * D, g = Math.atan2(R[2][0], R[2][1]) * D;
    cands = [[a, b, g], [a + 180, -b, g + 180]];
  }
  const [alpha, beta, gamma] = cands.map((c) => c.map(wrap))
    .reduce((best, c) => (Math.abs(c[0]) + Math.abs(c[2]) < Math.abs(best[0]) + Math.abs(best[2]) - 1e-9 ? c : best));
  return { alpha, beta, gamma };
}

/** COMSOL Rotated System angles for a 3D and a 2D model, and the crystal axes in each global frame. */
export function comsolEuler(A) {
  const R2 = mul(M2D, A);
  const axes = (R) => ({ X: R.map((r) => r[0]), Y: R.map((r) => r[1]), Z: R.map((r) => r[2]) });
  return { d3: { ...zxzAngles(A), axes: axes(A) }, d2: { ...zxzAngles(R2), axes: axes(R2) } };
}

/** This tool's Euler angles (lambda, mu, theta), deg: axesFromEuler(lambda, mu, theta) = A. */
export function toolEuler(A) {
  const { alpha, beta, gamma } = zxzAngles(A); // A = Rz(-theta) Rx(-mu) Rz(-lambda) as active rotations
  return { lambda: wrap(-gamma), mu: wrap(-beta), theta: wrap(-alpha) };
}
