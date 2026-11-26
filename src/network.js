// Two-port network helpers. A 2x2 complex matrix is [[m11, m12], [m21, m22]].
import { cx, add, sub, mul, div, scale, ONE } from './complex.js?v=f5cac54763';

export function inv2([[a, b], [c, d]]) {
  const det = sub(mul(a, d), mul(b, c));
  return [
    [div(d, det), div(scale(b, -1), det)],
    [div(scale(c, -1), det), div(a, det)],
  ];
}

/** M + diag(d1, d2) */
export const addDiag = ([[a, b], [c, d]], d1, d2) => [[add(a, d1), b], [c, add(d, d2)]];

/** Series impedances z1, z2 at ports 1 and 2 of a Y-matrix network; returns the new Y. */
export function seriesZ(Y, z1, z2) {
  if (z1.re === 0 && z1.im === 0 && z2.re === 0 && z2.im === 0) return Y;
  return inv2(addDiag(inv2(Y), z1, z2));
}

/** Shunt admittances y1, y2 to ground at ports 1 and 2. */
export const shuntY = (Y, y1, y2) => addDiag(Y, y1, y2);

/** Admittance y connected directly between port 1 and port 2 (e.g. feedthrough). */
export function bridgeY([[a, b], [c, d]], y) {
  return [[add(a, y), sub(b, y)], [sub(c, y), add(d, y)]];
}

/**
 * Y-parameters to S-parameters, both ports referenced to the real impedance Z0.
 * If `regeneration` is false, the y12*y21 term is dropped from the denominator,
 * which keeps only the single acoustic transit (no triple-transit echo).
 */
export function yToS([[Y11, Y12], [Y21, Y22]], Z0, regeneration = true) {
  const y11 = scale(Y11, Z0), y12 = scale(Y12, Z0), y21 = scale(Y21, Z0), y22 = scale(Y22, Z0);
  const p1 = add(ONE, y11), p2 = add(ONE, y22), m1 = sub(ONE, y11), m2 = sub(ONE, y22);
  const yy = regeneration ? mul(y12, y21) : cx(0, 0);
  const den = sub(mul(p1, p2), yy);
  return {
    S11: div(add(mul(m1, p2), yy), den),
    S12: div(scale(y12, -2), den),
    S21: div(scale(y21, -2), den),
    S22: div(add(mul(p1, m2), yy), den),
  };
}

/** Input impedance from a reflection coefficient referenced to Z0. */
export const zFromGamma = (G, Z0) => scale(div(add(ONE, G), sub(ONE, G)), Z0);
