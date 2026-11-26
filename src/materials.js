// LiNbO3 substrate data for the IDT models.
//
// Phase 1 scope:
// - Velocity and K^2 come from a published table for Y-Z and 128°Y-X only.
// - The capacitance per finger pair per unit aperture, Cs, is estimated for
//   any orientation from the dielectric tensor (Datta's formula, below).
// - X-, Y- and Z-cut at a free in-plane angle get Cs only; their velocity and
//   K^2 must be entered by the user until the partial-wave solver (Phase 2).

export const EPS0 = 8.8541878128e-12; // F/m

/**
 * LiNbO3 relative permittivity at constant strain (clamped), eps11 = eps22, eps33.
 * Kushibiki et al., IEEE TUFFC 46, 1315 (1999), as tabulated in
 * Kawada et al., arXiv:2504.12752 (2025), Table 4.
 */
export const LN_EPS_S = { e11: 44.9, e33: 26.7 };

const deg = Math.PI / 180;

/**
 * Orientation as two unit vectors in crystal axes (X, Y, Z):
 * n = surface normal, p = propagation direction.
 * psi is the in-plane angle (degrees) for the "cut + angle" families.
 */
export function orientation(cut, psiDeg = 0) {
  const c = Math.cos(psiDeg * deg), s = Math.sin(psiDeg * deg);
  switch (cut) {
    case '128YX': return { n: [0, Math.cos(128 * deg), Math.sin(128 * deg)], p: [1, 0, 0] };
    case 'YZ': return { n: [0, 1, 0], p: [0, 0, 1] };
    case 'Xcut': return { n: [1, 0, 0], p: [0, c, s] }; // psi from +Y toward +Z
    case 'Ycut': return { n: [0, 1, 0], p: [c, 0, s] }; // psi from +X toward +Z
    case 'Zcut': return { n: [0, 0, 1], p: [c, s, 0] }; // psi from +X toward +Y
    default: return null;
  }
}

/** a^T eps b for the uniaxial LN permittivity diag(e11, e11, e33). */
function epsAB(eps, a, b) {
  return eps.e11 * (a[0] * b[0] + a[1] * b[1]) + eps.e33 * a[2] * b[2];
}

/**
 * Capacitance per finger pair per unit aperture length (F/m), metallization 0.5:
 *   Cs = eps0 + sqrt(eps'_11 eps'_33 - eps'_13^2)
 * with x1 = propagation and x3 = surface normal (Datta, Surface Acoustic Wave
 * Devices, 1986; as quoted in Kawada et al. 2025, Eq. 35).
 * This is an estimate; the exact eps_inf needs the partial-wave solution.
 */
export function csDatta(orient, eps = LN_EPS_S) {
  const { n, p } = orient;
  const epp = epsAB(eps, p, p), enn = epsAB(eps, n, n), epn = epsAB(eps, p, n);
  return EPS0 * (1 + Math.sqrt(epp * enn - epn * epn));
}

/**
 * Presets. v0 = open (free) surface velocity, vm = shorted (metallized) velocity,
 * K2 = 2(v0 - vm)/v0. Source: Datta (1986), as tabulated in
 * Kawada et al., arXiv:2504.12752 (2025), Table 5.
 */
export const PRESETS = {
  '128YX': {
    label: '128°Y-X LiNbO₃', v0: 3996, vm: 3884, K2: 0.056,
    source: 'v, K²: Datta (1986) via Kawada et al. (2025), Table 5',
  },
  YZ: {
    label: 'Y-Z LiNbO₃', v0: 3488, vm: 3408, K2: 0.046,
    source: 'v, K²: Datta (1986) via Kawada et al. (2025), Table 5',
  },
  Xcut: { label: 'X-cut LiNbO₃ (angle ψ from Y)', v0: null, vm: null, K2: null, angle: true },
  Ycut: { label: 'Y-cut LiNbO₃ (angle ψ from X)', v0: null, vm: null, K2: null, angle: true },
  Zcut: { label: 'Z-cut LiNbO₃ (angle ψ from X)', v0: null, vm: null, K2: null, angle: true },
  custom: { label: 'Custom (enter v, K², Cs)', v0: null, vm: null, K2: null },
};

/**
 * Electrode metals: typical bulk resistivity in ohm*m at 20 °C.
 * Thin films are usually more resistive; edit the value if you have a measured one.
 */
export const METALS = {
  Al: { label: 'Al', rho: 2.65e-8 },
  Au: { label: 'Au', rho: 2.21e-8 },
  Cu: { label: 'Cu', rho: 1.68e-8 },
  Pt: { label: 'Pt', rho: 10.6e-8 },
};
