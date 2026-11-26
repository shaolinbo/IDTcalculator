// Impulse (delta-function / crossed-field) model of a uniform, single-electrode
// IDT with metallization ratio 0.5. See e.g. Morgan, "Surface Acoustic Wave
// Devices" (2007), and Datta (1986).
//
//   x     = Np * pi * (f - f0) / f0
//   Ga(f) = Ga0 * (sin x / x)^2,          Ga0 = 8 K^2 Cs W f0 Np^2
//   Ba(f) = Ga0 * (sin 2x - 2x) / (2 x^2)   (Hilbert transform of Ga)
//   Ct    = Np Cs W
//   Y     = Ga + j (Ba + 2 pi f Ct)
//
// Cs is per finger pair per unit aperture (F/m); W is the aperture (m).
import { cx } from './complex.js?v=a74496df0a';

export function idtAdmittance(f, { f0, Np, K2, Cs, W }) {
  const x = Np * Math.PI * (f - f0) / f0;
  const Ga0 = 8 * K2 * Cs * W * f0 * Np * Np;
  const sinc = Math.abs(x) < 1e-6 ? 1 - x * x / 6 : Math.sin(x) / x;
  const Ga = Ga0 * sinc * sinc;
  const Ba = Math.abs(x) < 1e-4 ? Ga0 * (-2 * x / 3) : Ga0 * (Math.sin(2 * x) - 2 * x) / (2 * x * x);
  const Ct = Np * Cs * W;
  const wCt = 2 * Math.PI * f * Ct;
  return { Ga, Ba, Ct, wCt, Ga0, sinc, Y: cx(Ga, Ba + wCt) };
}

/** Optimum Np for widest band with a tuning inductor: sqrt(pi / (4 K^2)). */
export const npOptimum = (K2) => Math.sqrt(Math.PI / (4 * K2));

/**
 * Aperture W (m) that gives Re(Z) = R at f0 for the bare IDT (no tuning).
 */
export function apertureForReZ({ f0, Np, K2, Cs }, R) {
  const a = 4 * K2 * Np;
  return (1 / R) * (1 / (2 * f0 * Cs * Np)) * a / (a * a + Math.PI * Math.PI);
}

/**
 * Aperture W (m) that gives |Z| = R at f0 for the bare IDT. With no matching
 * network, this W gives the lowest conversion loss from a source of resistance R.
 */
export function apertureForAbsZ({ f0, Np, K2, Cs }, R) {
  const g = 8 * K2 * Cs * f0 * Np * Np; // Ga0 per unit W
  const c = 2 * Math.PI * f0 * Np * Cs; // w Ct per unit W
  return 1 / (R * Math.hypot(g, c));
}

/**
 * Effective series resistance of the fingers of one IDT (ohm):
 *   R = (2/3) * rho * W / (a * h * Np)
 * Each finger carries a current that falls linearly along its length (factor 1/3);
 * Np fingers in parallel on each bus bar, two bus-bar sides in series.
 * a = finger width (m), h = metal thickness (m).
 */
export const fingerResistance = ({ rho, W, a, h, Np }) => (2 / 3) * rho * W / (a * h * Np);
