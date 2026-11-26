// Thin-film LiNbO3 stacks: presets, substrate orientation, and the chosen guided mode.
//
// The LN film takes the cut and direction of the page (orientation()); the substrate is
// Si(100) or c-plane sapphire, with the SAW direction at an in-plane angle from Si [110] or
// from the sapphire a-axis (X); SiO2 is isotropic. Thicknesses are physical; h/lambda is
// solved together with lambda = v / f0, since the guided velocity depends on h/lambda.
import { CONSTANT_SETS, DEFAULT_SET, EPS0, LAYER_MATERIALS } from './constants.js?v=57f4dfb508';
import { makeStructure, findModes, epsInf } from './layered.js?v=57f4dfb508';
import { axesFromNP } from './tensor.js?v=57f4dfb508';

export const STACKS = {
  bulk: { label: 'Bulk LiNbO₃' },
  lnoi: { label: 'LN / SiO₂ / Si (LNOI)', oxide: true, substrate: 'Si' },
  lnos: { label: 'LN on sapphire (c-plane)', substrate: 'sapphire' },
  membrane: { label: 'Suspended LN membrane', substrate: null },
};

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const deg = Math.PI / 180;

/** Device axes in substrate crystal axes: Si(100) with the SAW at th (deg) from [110]; c-plane sapphire from the a-axis. */
export function substrateAxes(kind, th = 0) {
  const a = (kind === 'Si' ? 45 + th : th) * deg;
  return axesFromNP([0, 0, 1], [Math.cos(a), Math.sin(a), 0]);
}

function structure(stack, { lnMat, lnA, hl, hOxl, subAngle }) {
  const st = STACKS[stack];
  const layers = [];
  if (st.oxide && hOxl > 0) layers.push({ material: LAYER_MATERIALS.SiO2, A: I3, hl: hOxl });
  layers.push({ material: lnMat, A: lnA, hl });
  const substrate = st.substrate ? { material: LAYER_MATERIALS[st.substrate], A: substrateAxes(st.substrate, subAngle) } : null;
  return makeStructure({ layers, substrate });
}

/**
 * The requested mode among those found: 'R' = slowest sagittal (Rayleigh-type; A0 in a
 * membrane), 'S0' = slowest symmetric plate mode (membranes), 'SH' = slowest shear-horizontal.
 */
export function pickMode(modes, want, plate) {
  if (plate) {
    const sym = want === 'SH' ? 'SH' : want === 'S0' ? 'S' : 'A';
    return modes.find((m) => m.sym === sym) ?? null;
  }
  return modes.find((m) => m.type === (want === 'SH' ? 'SH' : 'R')) ?? null;
}

/**
 * The shorted-surface partner of an open-surface mode: same family (type, or symmetry in a
 * plate), at or just below the open velocity (shorting slows a mode by about K^2/2, here at
 * most 30 %: strongly coupled SH waves on X-cut LN shift by more than 10 %), and nearest to it. In thick films several branches of one family crowd
 * together, so the pairing must be mutual: the partner's nearest open mode of that family
 * must be this one. Otherwise null (no K^2 rather than a mis-paired one).
 */
export function pairShort(open, modesShort, plate, modesOpen = [open]) {
  if (!open) return null;
  const fam = (m) => (plate ? m.sym : m.type);
  let best = null;
  for (const m of modesShort) {
    if (fam(m) !== fam(open) || m.v > open.v * (1 + 1e-6) || m.v < open.v * 0.7) continue;
    if (!best || open.v - m.v < open.v - best.v) best = m;
  }
  if (!best) return null;
  const nearestOpen = modesOpen.filter((m) => fam(m) === fam(open))
    .reduce((q, m) => (Math.abs(m.v - best.v) < Math.abs(q.v - best.v) ? m : q), open);
  return nearestOpen === open || Math.abs(nearestOpen.v - open.v) < 1e-9 * open.v ? best : null;
}

const cache = new Map();

/**
 * Guided-mode values for a stack: { ok, v0 (open top), vm (shorted top), K2, epsInf, Cs,
 * hl, modesOpen, modesShort, vlim }. orientLN: orientation() of the LN film; set: constant
 * set; hLN, hOx (m); f0 (Hz); subAngle (deg, at the current SAW direction); mode 'R'|'S0'|'SH'.
 */
export function stackSAW(orientLN, { set = DEFAULT_SET, stack, hLN, hOx = 0, f0, subAngle = 0, mode = 'R' }) {
  const key = JSON.stringify([set, orientLN.A, stack, hLN, hOx, f0, subAngle, mode]);
  if (cache.has(key)) return cache.get(key);
  const lnMat = CONSTANT_SETS[CONSTANT_SETS[set] ? set : DEFAULT_SET].m;
  const plate = STACKS[stack].substrate === null;
  const vRef = 4500;
  const at = (v) => {
    const lambda = v / f0;
    const S = structure(stack, { lnMat, lnA: orientLN.A, hl: hLN / lambda, hOxl: hOx / lambda, subAngle });
    const modes = findModes(S, 'open', { vRef });
    return { S, modes, m: pickMode(modes, mode, plate), lambda };
  };
  // Solve v = v_mode(h f0 / v) by secant steps (a plain fixed point oscillates for strongly
  // dispersive modes such as A0, whose velocity is nearly proportional to h / lambda).
  let va = 3800, ra = at(va);
  if (!ra.m) return remember(key, { ok: false, reason: 'mode not found', modesOpen: ra.modes, vlim: ra.S.sub?.vlim ?? null });
  let ga = ra.m.v - va, vb = ra.m.v, rb = at(vb);
  for (let it = 0; it < 30 && rb.m; it++) {
    const gb = rb.m.v - vb;
    if (Math.abs(gb) < 1e-9 * vb) break;
    let vn = Math.abs(gb - ga) > 1e-300 ? vb - (gb * (vb - va)) / (gb - ga) : rb.m.v;
    if (!(vn > 0)) vn = 0.5 * (vb + rb.m.v);
    va = vb; ga = gb; vb = vn; rb = at(vb);
  }
  if (!rb.m) return remember(key, { ok: false, reason: 'mode not found', modesOpen: rb.modes, vlim: rb.S.sub?.vlim ?? null });
  const S = rb.S, v0 = rb.m.v;
  const modesShort = findModes(S, 'short', { vRef });
  const ms = pairShort(rb.m, modesShort, plate, rb.modes);
  const eps = epsInf(S, S.sub ? S.sub.vlim : vRef);
  return remember(key, {
    ok: !!ms, v0, vm: ms?.v ?? null, K2: ms ? (2 * (v0 - ms.v)) / v0 : null, epsInf: eps, Cs: eps * EPS0,
    hl: hLN / rb.lambda, lambda: rb.lambda, type: rb.m.type, sym: rb.m.sym ?? null,
    modesOpen: rb.modes, modesShort, vlim: S.sub?.vlim ?? null,
  });
}

function remember(key, val) {
  if (cache.size > 200) cache.clear();
  cache.set(key, val);
  return val;
}

/**
 * Dispersion: all guided modes (open and shorted top) at each h/lambda in hlList, for a fixed
 * film and stack (the oxide thickness scales with the LN thickness at the current ratio).
 */
export function stackDispersion(orientLN, { set = DEFAULT_SET, stack, oxRatio = 0, subAngle = 0, hlList, onProgress = () => {} }) {
  const lnMat = CONSTANT_SETS[CONSTANT_SETS[set] ? set : DEFAULT_SET].m;
  const vRef = 4500;
  return hlList.map((hl, i) => {
    const S = structure(stack, { lnMat, lnA: orientLN.A, hl, hOxl: hl * oxRatio, subAngle });
    const open = findModes(S, 'open', { vRef }), short = findModes(S, 'short', { vRef });
    onProgress((i + 1) / hlList.length);
    return { hl, open, short };
  });
}
