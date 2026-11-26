// Substrate values for a cut, from the partial-wave solver, and angle sweeps.
import { CONSTANT_SETS, DEFAULT_SET } from './constants.js';
import { crystal, solveOrientation } from './solver.js';
import { orientation } from '../materials.js';

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
