// LiNbO3 orientations, presets and substrate values for the IDT models.
//
// Velocity, K^2 and Cs come from the partial-wave solver (src/saw/) for any
// orientation. Published values for Y-Z and 128°Y-X are kept for comparison,
// and the clamped-permittivity Cs estimate is kept as a quick reference.
import { EPS0 } from './saw/constants.js?v=f5cac54763';
import { axesFromNP, axesFromEuler } from './saw/tensor.js?v=f5cac54763';

export { EPS0 };

/**
 * LiNbO3 relative permittivity at constant strain (clamped), eps11 = eps22, eps33.
 * Kushibiki et al., IEEE TUFFC 46, 1315 (1999), as tabulated in
 * Kawada et al., arXiv:2504.12752 (2025), Table 4.
 */
export const LN_EPS_S = { e11: 44.9, e33: 26.7 };

const deg = Math.PI / 180;

/**
 * Orientation of a cut: { n, p, A } with n = surface normal, p = propagation
 * direction (crystal axes) and A the rotation to device axes (rows x1 = p, x2, x3 = n).
 * a holds the angles in degrees: psi (in-plane propagation angle, shown as φ on the page),
 * rot (Y-cut rotation), e1, e2, e3 (Euler angles, ZXZ). Returns null for the "custom" substrate.
 */
export function orientation(cut, a = {}) {
  if (typeof a === 'number') a = { psi: a };
  const psi = (a.psi ?? 0) * deg, rot = (a.rot ?? 0) * deg;
  const c = Math.cos(psi), s = Math.sin(psi);
  let n, p;
  switch (cut) {
    case '128Y': case 'RY': {
      // Rotated Y-cut: normal = Y rotated about X toward Z. phi from X, counter-clockwise
      // about the outward normal (toward n × X); equals Euler (0, rot - 90°, phi).
      const th = cut === '128Y' ? 128 * deg : rot;
      n = [0, Math.cos(th), Math.sin(th)];
      p = [c, s * Math.sin(th), -s * Math.cos(th)];
      break;
    }
    case 'YZ': n = [0, 1, 0]; p = [0, 0, 1]; break;
    case 'Xcut': n = [1, 0, 0]; p = [0, c, s]; break; // psi from +Y toward +Z
    case 'Ycut': n = [0, 1, 0]; p = [c, 0, s]; break; // psi from +X toward +Z
    case 'Zcut': n = [0, 0, 1]; p = [c, s, 0]; break; // psi from +X toward +Y
    case 'euler': {
      const A = axesFromEuler(a.e1 ?? 0, a.e2 ?? 0, a.e3 ?? 0);
      return { n: A[2], p: A[0], A };
    }
    default: return null;
  }
  return { n, p, A: axesFromNP(n, p) };
}

/** a^T eps b for the uniaxial LN permittivity diag(e11, e11, e33). */
function epsAB(eps, a, b) {
  return eps.e11 * (a[0] * b[0] + a[1] * b[1]) + eps.e33 * a[2] * b[2];
}

/**
 * Quick estimate of Cs (F/m), ignoring piezoelectric stiffening:
 *   Cs = eps0 + sqrt(eps'_11 eps'_33 - eps'_13^2), x1 = propagation, x3 = normal
 * (Datta 1986, as quoted in Kawada et al. 2025, Eq. 35), with clamped permittivity.
 * The solver's eps_inf replaces it; it is kept for reference.
 */
export function csDatta(orient, eps = LN_EPS_S) {
  const { n, p } = orient;
  const epp = epsAB(eps, p, p), enn = epsAB(eps, n, n), epn = epsAB(eps, p, n);
  return EPS0 * (1 + Math.sqrt(epp * enn - epn * epn));
}

/**
 * Cut presets. `pub` holds published values for comparison: v0 = free-surface
 * velocity, vm = metallized, K2 = 2(v0 - vm)/v0; Datta (1986) as tabulated in
 * Kawada et al., arXiv:2504.12752 (2025), Table 5.
 * `angles` lists the angle fields the cut uses (psi is the propagation angle φ);
 * `sweep` is the family scanned in the angle sweep (cut, angle key, value of this cut,
 * sense of rotation about the normal). `pub` applies at psi = 0 when the cut has psi.
 */
const DATTA = 'Datta (1986) via Kawada et al. (2025), Table 5';
export const PRESETS = {
  '128Y': { label: '128°Y LiNbO₃ (φ from X)', angles: ['psi'], pub: { v0: 3996, vm: 3884, K2: 0.056, source: DATTA },
    sweep: { cut: '128Y', key: 'psi', sense: 1, axis: '128°Y cut, propagation angle φ from X (°)' } },
  YZ: { label: 'Y-Z LiNbO₃ (Y-cut, Z propagation)', angles: [], pub: { v0: 3488, vm: 3408, K2: 0.046, source: DATTA },
    sweep: { cut: 'Ycut', key: 'psi', at: 90, sense: -1, axis: 'Y-cut, propagation angle φ from X toward Z (°)' } },
  RY: { label: 'Rotated Y-cut (θ, φ from X)', angles: ['rot', 'psi'],
    sweep: { cut: 'RY', key: 'rot', axis: 'Y-cut rotation θ (°) at the current φ' } },
  Xcut: { label: 'X-cut LiNbO₃ (φ from Y)', angles: ['psi'],
    sweep: { cut: 'Xcut', key: 'psi', sense: 1, axis: 'X-cut, propagation angle φ from Y toward Z (°)' } },
  Ycut: { label: 'Y-cut LiNbO₃ (φ from X)', angles: ['psi'],
    sweep: { cut: 'Ycut', key: 'psi', sense: -1, axis: 'Y-cut, propagation angle φ from X toward Z (°)' } },
  Zcut: { label: 'Z-cut LiNbO₃ (φ from X)', angles: ['psi'],
    sweep: { cut: 'Zcut', key: 'psi', sense: 1, axis: 'Z-cut, propagation angle φ from X toward Y (°)' } },
  euler: { label: 'Euler angles (λ, μ, θ)', angles: ['e1', 'e2', 'e3'],
    sweep: { cut: 'euler', key: 'e3', sense: 1, axis: 'Euler angle θ (°), in-plane propagation' } },
  custom: { label: 'Custom (enter v, K², Cs)' },
};

/**
 * Electrode metals: typical bulk resistivity rho (ohm*m, 20 °C), and for mass loading the
 * density (kg/m^3), Young's modulus E (Pa) and Poisson ratio nu of an isotropic film.
 * Density, E and nu: bulk values from the elements' Wikipedia infoboxes (Nov 2026);
 * Cu E = 128 GPa (listed range 110–128 GPa) matches its listed shear modulus 48 GPa and nu = 0.34.
 * Thin films are usually more resistive and can be softer; edit the values if you have measured ones.
 */
export const METALS = {
  Al: { label: 'Al', rho: 2.65e-8, density: 2699, E: 70e9, nu: 0.35 },
  Au: { label: 'Au', rho: 2.21e-8, density: 19283, E: 79e9, nu: 0.44 },
  Cu: { label: 'Cu', rho: 1.68e-8, density: 8935, E: 128e9, nu: 0.34 },
  Pt: { label: 'Pt', rho: 10.6e-8, density: 21452, E: 168e9, nu: 0.38 },
  Ni: { label: 'Ni', rho: 6.93e-8, density: 8907, E: 200e9, nu: 0.31 }, // all from the Wikipedia infobox, 20 °C
};
