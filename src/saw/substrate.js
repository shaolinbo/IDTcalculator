// Substrate values for a cut, from the partial-wave solver, and angle sweeps.
import { CONSTANT_SETS, DEFAULT_SET } from './constants.js?v=521bac1594';
import { crystal, solveOrientation, prepare, bulkLimit, isoFilm, filmVelocity } from './solver.js?v=521bac1594';
import { gratingCOM } from './grating.js?v=521bac1594';
import { orientation } from '../materials.js?v=521bac1594';

const crystals = new Map();
const cache = new Map();

/** Prepared crystal for a constant-set key (see CONSTANT_SETS). */
function crystalFor(set) {
  const key = CONSTANT_SETS[set] ? set : DEFAULT_SET;
  if (!crystals.has(key)) crystals.set(key, crystal(CONSTANT_SETS[key].m));
  return crystals.get(key);
}

/** Solver result for an orientation ({A} from materials.orientation); cached. */
export function solveSubstrate(orient, { pfa = true, set = DEFAULT_SET } = {}) {
  const key = `${set}|${orient.A.flat().map((x) => x.toFixed(12)).join(',')}|${pfa}`;
  if (!cache.has(key)) {
    if (cache.size > 500) cache.clear();
    cache.set(key, solveOrientation(crystalFor(set), orient.A, { pfa }));
  }
  return cache.get(key);
}

/**
 * Sweep one angle of a cut family. fam = { cut, key, sense } (see PRESETS[..].sweep);
 * base = the other angles; list = angle values (deg, evenly spaced); set = constant set.
 * For in-plane angles (sense = ±1) the power-flow angle comes from the slope of v0;
 * otherwise each point is solved with its own power-flow angle.
 */
export function sweep(fam, base, list, onProgress = () => {}, set = DEFAULT_SET) {
  const inPlane = fam.sense === 1 || fam.sense === -1;
  const rows = list.map((ang, i) => {
    const r = solveSubstrate(orientation(fam.cut, { ...base, [fam.key]: ang }), { pfa: !inPlane, set });
    if (i % 10 === 0) onProgress(i / list.length);
    return { ang, ok: r.ok, v0: r.v0, vm: r.vm, K2: r.K2, epsInf: r.epsInf, Cs: r.Cs, vlim: r.vlim, pfa: r.pfa };
  });
  if (inPlane && rows.length > 2) {
    const h = (list[1] - list[0]) * Math.PI / 180;
    rows.forEach((r, i) => {
      const a = rows[i - 1], b = rows[i + 1];
      r.pfa = r.ok && a?.ok && b?.ok
        ? fam.sense * Math.atan((b.v0 - a.v0) / (2 * h * r.v0)) * 180 / Math.PI
        : null;
    });
  }
  onProgress(1);
  return rows;
}

// ---------------------------------------------------------------------------
// Electrode mass loading

const ctxCache = new Map();
const keyA = (orient, set) => `${set}|${orient.A.flat().map((x) => x.toFixed(12)).join(',')}`;
function ctxFor(orient, set) {
  const k = keyA(orient, set);
  if (!ctxCache.has(k)) {
    if (ctxCache.size > 50) ctxCache.clear();
    const ctx = prepare(crystalFor(set), orient.A);
    ctxCache.set(k, { ctx, vlim: bulkLimit(ctx) });
  }
  return ctxCache.get(k);
}

/**
 * SAW velocity (m/s) under a continuous metal film of thickness h/lambda on this cut:
 * metallized surface plus the film's mass and stiffness. metal = { density, E, nu } (SI).
 * Null if no Rayleigh-type root is found.
 */
export function filmSAW(orient, set, metal, hOverLambda) {
  const k = `${keyA(orient, set)}|${metal.density},${metal.E},${metal.nu}|${hOverLambda.toPrecision(12)}`;
  if (!cache.has(k)) {
    if (cache.size > 500) cache.clear();
    const { ctx, vlim } = ctxFor(orient, set);
    cache.set(k, filmVelocity(ctx, isoFilm({ rho: metal.density, E: metal.E, nu: metal.nu }), 2 * Math.PI * hOverLambda, vlim));
  }
  return cache.get(k);
}

/**
 * First-order estimate of the SAW velocity under the IDTs: the metallization ratio eta
 * weights the free surface (v0) and the metal-covered surface (filmSAW):
 *   vIdt = v0 + eta (vFilm(h/lambda) - v0),  with lambda = vIdt / f0 (solved by iteration).
 * Grating reflections and second-order (stored-energy) terms are not included.
 */
export function electrodeLoading(orient, { set, metal, h, f0, v0, eta = 0.5 }) {
  let vIdt = v0, vFilm = null, hl = 0;
  for (let it = 0; it < 20; it++) {
    hl = (h * f0) / vIdt;
    vFilm = filmSAW(orient, set, metal, hl);
    if (vFilm == null) return null;
    const next = v0 + eta * (vFilm - v0);
    const done = Math.abs(next - vIdt) < 1e-7 * v0;
    vIdt = next;
    if (done) break;
  }
  hl = (h * f0) / vIdt;
  return { vIdt, vFilm: filmSAW(orient, set, metal, hl), hOverLambda: hl, dv: vIdt / v0 - 1, eta };
}

// ---------------------------------------------------------------------------
// COM parameters from a periodic-grating finite-element unit cell

const gratingCache = new Map();

/**
 * Velocity under the IDT and reflection per electrode from the shorted and open grating
 * (grating.js) for metal { density, E, nu }, thickness h (m), design frequency f0 and
 * metallization ratio eta. h/lambda is solved together with lambda = v / f0, starting from
 * the electrodeLoading estimate. Returns gratingCOM's result plus hOverLambda, v0, dv.
 */
export function gratingParams(orient, { set, metal, h, f0, eta = 0.5 }) {
  const key = `${keyA(orient, set)}|${metal.density},${metal.E},${metal.nu}|${h},${f0},${eta}`;
  if (gratingCache.has(key)) return gratingCache.get(key);
  const m = CONSTANT_SETS[CONSTANT_SETS[set] ? set : DEFAULT_SET].m;
  const v0 = solveSubstrate(orient, { set, pfa: false }).v0;
  const est = electrodeLoading(orient, { set, metal, h, f0, v0, eta });
  let vGuess = est ? est.vIdt : v0, hl = (h * f0) / vGuess, g = null;
  for (let it = 0; it < 4; it++) {
    g = gratingCOM(m, orient.A, metal, { eta, hOverLambda: hl, vGuess });
    const next = (h * f0) / g.v;
    if (Math.abs(next - hl) <= 0.02 * Math.max(hl, 1e-9)) break; // r_s, v change little with h/lambda
    hl = next; vGuess = g.v;
  }
  const out = { ...g, hOverLambda: hl, v0, dv: g.v / v0 - 1, estimate: est?.vIdt ?? null };
  if (gratingCache.size > 50) gratingCache.clear();
  gratingCache.set(key, out);
  return out;
}
