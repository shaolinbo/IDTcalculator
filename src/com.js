// Coupling-of-modes (COM) model of a uniform single-electrode IDT, and its P-matrix.
//
// Time dependence e^{jωt}. R(x), S(x): slowly varying amplitudes of the waves travelling
// in +x and -x (actual waves R e^{-j k0 x}, S e^{+j k0 x}, k0 = 2π/λ, λ = 2p); acoustic
// power |R|²/2, the same convention as the electrical power Re(V* I)/2. For a voltage V
// on the IDT and the current I(x) collected up to x:
//   dR/dx = -jδ R + jκ S + jα V
//   dS/dx = -jκ R + jδ S - jα V
//   dI/dx = -2jα R - 2jα S + jωC V
// δ = ω/v - k0 - jγ (v: velocity under the IDT, γ: attenuation in Np/m), κ = r_s/p
// (r_s: reflection coefficient of one electrode, p: electrode pitch), α and κ real
// (transduction and reflection centres at the electrode centres), C: capacitance per
// unit length. Energy balance gives the radiation conductance at synchronism
// 2α²L², so α² = 4K²·Cs·W·f0/λ² reproduces the impulse model, Ga0 = 8K²CsWf0Np².
//
// The equations have constant coefficients over a uniform IDT, so the transfer from
// x = 0 to x = L is closed-form in s² = δ² - κ². With L = Np·λ, k0·L = 2π·Np and the
// amplitudes at both ends are the wave amplitudes there.
import { cx, add, sub, mul, div, scale } from './complex.js?v=57f4dfb508';

const J = cx(0, 1);
const ccos = (z) => cx(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
const csin = (z) => cx(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
function csqrt(z) {
  const r = Math.hypot(z.re, z.im);
  const a = Math.sqrt((r + z.re) / 2), b = Math.sign(z.im || 1) * Math.sqrt(Math.max(0, (r - z.re) / 2));
  return cx(a, b);
}
const poly = (z, c) => c.reduceRight((acc, ck) => add(mul(acc, z), cx(ck, 0)), cx(0, 0));

/**
 * Even functions of s needed for the transfer over length L:
 *   c = cos(sL), f1 = sin(sL)/s, f2 = (1 - cos sL)/s², f3 = (L - sin(sL)/s)/s².
 * Power series in z = (sL)² where |sL| is small (avoids cancellation).
 */
function evenFns(s2, L) {
  const z = scale(s2, L * L);
  if (Math.hypot(z.re, z.im) < 0.01) {
    return {
      c: poly(z, [1, -1 / 2, 1 / 24, -1 / 720, 1 / 40320]),
      f1: scale(poly(z, [1, -1 / 6, 1 / 120, -1 / 5040, 1 / 362880]), L),
      f2: scale(poly(z, [1 / 2, -1 / 24, 1 / 720, -1 / 40320, 1 / 3628800]), L * L),
      f3: scale(poly(z, [1 / 6, -1 / 120, 1 / 5040, -1 / 362880, 1 / 39916800]), L * L * L),
    };
  }
  const s = csqrt(s2), sL = scale(s, L);
  const c = ccos(sL), f1 = div(csin(sL), s);
  const f2 = div(sub(cx(1, 0), c), s2);
  const f3 = div(sub(cx(L, 0), f1), s2);
  return { c, f1, f2, f3 };
}

/**
 * P-matrix of a uniform IDT at one frequency: [b1, b2, I] = P [a1, a2, V], with port 1
 * at x = 0 (a1 = R incident from the left, b1 = S leaving to the left) and port 2 at
 * x = L (a2 = S incident from the right, b2 = R leaving to the right).
 * Arguments: delta (complex, 1/m), kappa (1/m), alpha (A/(V·m)·√… per the scaling above),
 * C (F/m), omega (rad/s), L (m).
 */
export function idtPMatrix({ delta, kappa, alpha, C, omega, L }) {
  const s2 = sub(mul(delta, delta), cx(kappa * kappa, 0));
  const { c, f1, f2, f3 } = evenFns(s2, L);
  // K = [[-jδ, jκ], [-jκ, jδ]]; b = jα [1, -1]; current row = -2jα [1, 1].
  const K = [[mul(J, scale(delta, -1)), cx(0, kappa)], [cx(0, -kappa), mul(J, delta)]];
  const lin = (a, bK) => [[add(a, mul(bK, K[0][0])), mul(bK, K[0][1])], [mul(bK, K[1][0]), add(a, mul(bK, K[1][1]))]];
  const Phi = lin(c, f1); // exp(K L)
  const G1 = lin(f1, f2); // ∫0^L exp(K u) du
  const G2 = lin(f2, f3); // ∫0^L (L - u) exp(K u) du
  const b = [cx(0, alpha), cx(0, -alpha)];
  const cr = cx(0, -2 * alpha); // both entries of the current row
  const Mb = (M) => [add(mul(M[0][0], b[0]), mul(M[0][1], b[1])), add(mul(M[1][0], b[0]), mul(M[1][1], b[1]))];
  const cM = (M) => [mul(cr, add(M[0][0], M[1][0])), mul(cr, add(M[0][1], M[1][1]))];
  const [TRV, TSV] = Mb(G1);
  const [TIR, TIS] = cM(G1);
  const G2b = Mb(G2);
  const TIV = add(mul(cr, add(G2b[0], G2b[1])), cx(0, omega * C * L));
  const [[TRR, TRS], [TSR, TSS]] = Phi;
  // Ports: a1 = R(0), a2 = S(L), with I(0) = 0; solve S(0) from the S(L) row.
  const P11 = div(scale(TSR, -1), TSS), P12 = div(cx(1, 0), TSS), P13 = div(scale(TSV, -1), TSS);
  const P21 = sub(TRR, div(mul(TRS, TSR), TSS)), P22 = div(TRS, TSS), P23 = sub(TRV, div(mul(TRS, TSV), TSS));
  const P31 = sub(TIR, div(mul(TIS, TSR), TSS)), P32 = div(TIS, TSS), P33 = sub(TIV, div(mul(TIS, TSV), TSS));
  return { P11, P12, P13, P21, P22, P23, P31, P32, P33 };
}

/** COM coefficients of an IDT from the substrate and device values (SI). */
export function comParams({ K2, Cs, W, f0, lambda, rs }) {
  return {
    alpha: Math.sqrt(4 * K2 * Cs * W * f0) / lambda,
    kappa: rs / (lambda / 2),
    C: (Cs * W) / lambda,
  };
}

/**
 * Two-IDT delay line: 2x2 admittance matrix of the bare IDTs (acoustic coupling only).
 * P, Q: P-matrices of IDT 1 and IDT 2; E: propagation factor across the gap
 * (exp(-jk g)). multi = false keeps a single acoustic transit (no reflections
 * between the IDTs).
 */
export function delayLineY(P, Q, E, multi = true) {
  const E2 = mul(E, E);
  const den = multi ? sub(cx(1, 0), mul(mul(P.P22, Q.P11), E2)) : cx(1, 0);
  const Y12 = div(mul(mul(P.P32, E), Q.P13), den);
  const Y21 = div(mul(mul(Q.P31, E), P.P23), den);
  const Y11 = multi ? add(P.P33, div(mul(mul(mul(P.P32, Q.P11), P.P23), E2), den)) : P.P33;
  const Y22 = multi ? add(Q.P33, div(mul(mul(mul(Q.P31, P.P22), Q.P13), E2), den)) : Q.P33;
  return [[Y11, Y12], [Y21, Y22]];
}
