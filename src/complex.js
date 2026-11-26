// Minimal complex arithmetic. A complex number is {re, im}.

export const cx = (re, im = 0) => ({ re, im });
export const ZERO = cx(0, 0);
export const ONE = cx(1, 0);

export const add = (a, b) => cx(a.re + b.re, a.im + b.im);
export const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
export const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a, s) => cx(a.re * s, a.im * s);
export const conj = (a) => cx(a.re, -a.im);
export const neg = (a) => cx(-a.re, -a.im);
export const abs = (a) => Math.hypot(a.re, a.im);
export const abs2 = (a) => a.re * a.re + a.im * a.im;
export const arg = (a) => Math.atan2(a.im, a.re);

export function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

export const inv = (a) => div(ONE, a);

/** exp(j*theta) */
export const expj = (theta) => cx(Math.cos(theta), Math.sin(theta));

/** 20*log10(|a|) */
export const dB = (a) => 10 * Math.log10(abs2(a));
