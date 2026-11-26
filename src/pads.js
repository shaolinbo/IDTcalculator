// Probe-pad capacitance estimate.
//
// A GSG pad set is treated as a short coplanar-waveguide section on a thick
// substrate (conformal mapping, infinitely wide grounds):
//   C ≈ 2 * eps0 * (eps_r + 1) * K(k) / K(k') * L,   k = s / (s + 2 g)
// With Cs = eps0 * (1 + eps_p) from materials.js this is 2 * Cs * K(k)/K(k') * L.
// It is a first estimate; a measured open-pad dummy is better.

/** Complete elliptic integral of the first kind K(k), modulus k, via the AGM. */
export function ellipK(k) {
  let a = 1, b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return Math.PI / (2 * a);
}

/**
 * Signal-pad capacitance to ground (F).
 * s = signal pad width, g = gap to the ground pads, L = pad length (all in m);
 * Cs = substrate capacitance per unit length (F/m), as used for the IDT.
 */
export function padCapacitance({ s, g, L, Cs }) {
  const k = s / (s + 2 * g);
  const kp = Math.sqrt(1 - k * k);
  return 2 * Cs * (ellipK(k) / ellipK(kp)) * L;
}
