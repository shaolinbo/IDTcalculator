// Material constants.

export const EPS0 = 8.8541878128e-12; // F/m

/**
 * LiNbO3 (point group 3m), IEEE standard axes.
 * Kushibiki, Takanaga, Arakawa, Sannomiya, IEEE TUFFC 46, 1315 (1999),
 * as tabulated in Kawada et al., arXiv:2504.12752 (2025), Tables 1-4.
 * c in N/m^2 (constant E), e in C/m^2, eps relative at constant strain.
 */
export const LN_KUSHIBIKI = {
  name: 'LiNbO₃, Kushibiki et al. (1999)',
  rho: 4642.8,
  c11: 1.9886e11, c12: 0.5467e11, c13: 0.6799e11, c14: 0.0783e11,
  c33: 2.3418e11, c44: 0.5985e11, // c66 = (c11 - c12)/2 (tabulated as 0.7209e11, rounded)
  e15: 3.655, e22: 2.407, e31: 0.328, e33: 1.894,
  eps11: 44.9, eps33: 26.7,
};

/**
 * Voigt matrices for class 3m: C (6x6, N/m^2), E (3x6, C/m^2), EPS (3x3, F/m).
 * Trigonal symmetry requires c66 = (c11 - c12)/2; that value is used unless
 * c66 is given explicitly (only for test materials).
 */
export function voigt3m(m) {
  const { c11, c12, c13, c14, c33, c44, e15, e22, e31, e33, eps11, eps33 } = m;
  const c66 = m.c66 ?? (c11 - c12) / 2;
  const C = [
    [c11, c12, c13, c14, 0, 0],
    [c12, c11, c13, -c14, 0, 0],
    [c13, c13, c33, 0, 0, 0],
    [c14, -c14, 0, c44, 0, 0],
    [0, 0, 0, 0, c44, c14],
    [0, 0, 0, 0, c14, c66],
  ];
  const E = [
    [0, 0, 0, 0, e15, -e22],
    [-e22, e22, 0, e15, 0, 0],
    [e31, e31, e33, 0, 0, 0],
  ];
  const EPS = [
    [eps11 * EPS0, 0, 0],
    [0, eps11 * EPS0, 0],
    [0, 0, eps33 * EPS0],
  ];
  return { C, E, EPS };
}
