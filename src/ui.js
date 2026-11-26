// Page logic: form <-> parameters, URL state, plots, export.
import { resolve, simulate, sweepNp, toTouchstone, toCSV } from './model.js?v=6fac78a005';
import { PRESETS, METALS, orientation, csDatta } from './materials.js?v=6fac78a005';
import { apertureForReZ, apertureForAbsZ } from './impulse.js?v=6fac78a005';
import { solveSubstrate } from './saw/substrate.js?v=6fac78a005';
import { CONSTANT_SETS, DEFAULT_SET } from './saw/constants.js?v=6fac78a005';
import { comsolEuler, toolEuler } from './saw/euler.js?v=6fac78a005';
import { chipFigure } from './view3d.js?v=6fac78a005';
import { dB, abs } from './complex.js?v=6fac78a005';

// ---------------------------------------------------------------------------
// Field definitions. Display value * si = SI value.
const GROUPS = [
  ['sub', 'Substrate'],
  ['idt', 'IDTs and delay line'],
  ['el', 'Electrodes'],
  ['port', 'Probe ports and pads'],
  ['tune', 'Tuning (optional)'],
  ['sim', 'Sweep'],
];

const usesAngle = (key) => (s) => (PRESETS[s.cut]?.angles ?? []).includes(key);
const usesSolver = (s) => s.cut !== 'custom' && s.mode === 'solver' && !!subState?.res?.ok;

const FIELDS = [
  { g: 'sub', key: 'cut', label: 'Cut', type: 'select', def: '128Y',
    options: Object.entries(PRESETS).map(([k, o]) => [k, o.label]) },
  { g: 'sub', key: 'rot', label: 'Y-cut rotation θ', unit: '°', si: 1, def: 128, step: 1, show: usesAngle('rot') },
  { g: 'sub', key: 'psi', label: 'Propagation angle φ', unit: '°', si: 1, def: 0, step: 1, show: usesAngle('psi') },
  { g: 'sub', key: 'e1', label: 'Euler λ', unit: '°', si: 1, def: 0, step: 1, show: usesAngle('e1') },
  { g: 'sub', key: 'e2', label: 'Euler μ', unit: '°', si: 1, def: 38, step: 1, show: usesAngle('e2') },
  { g: 'sub', key: 'e3', label: 'Euler θ', unit: '°', si: 1, def: 0, step: 1, show: usesAngle('e3') },
  { g: 'sub', key: 'mode', label: 'Substrate values', type: 'select', def: 'solver',
    options: [['solver', 'Computed (partial-wave solver)'], ['manual', 'Entered by hand']],
    show: (s) => s.cut !== 'custom' },
  { g: 'sub', key: 'consts', label: 'LiNbO₃ constants', type: 'select', def: DEFAULT_SET,
    options: Object.entries(CONSTANT_SETS).map(([k, o]) => [k, o.label]),
    show: (s) => s.cut !== 'custom' },
  { g: 'sub', key: 'v', label: 'SAW velocity v₀', unit: 'm/s', si: 1, def: 3963.0, step: 1, min: 0, disabled: usesSolver },
  { g: 'sub', key: 'K2', label: 'Coupling K²', unit: '%', si: 0.01, def: 5.368, step: 0.01, min: 0, zeroOk: true, disabled: usesSolver },
  { g: 'sub', key: 'Cs', label: 'Cs per finger pair', unit: 'pF/cm', si: 1e-10, def: 4.844, step: 0.001, min: 0, disabled: usesSolver },

  { g: 'idt', key: 'f0', label: 'Centre frequency f₀', unit: 'MHz', si: 1e6, def: 220, step: 1, min: 0 },
  { g: 'idt', key: 'Np1', label: 'Finger pairs, IDT 1', type: 'int', si: 1, def: 22, step: 1, min: 1, zeroOk: true },
  { g: 'idt', key: 'Np2', label: 'Finger pairs, IDT 2', type: 'int', si: 1, def: 22, step: 1, min: 1, zeroOk: true },
  { g: 'idt', key: 'W', label: 'Aperture W', unit: 'µm', si: 1e-6, def: 500, step: 1, min: 0 },
  { g: 'idt', key: 'dvIdt', label: 'Velocity shift under IDTs Δv/v₀', unit: '%', si: 0.01, def: 0, step: 0.1, min: -30, max: 30, zeroOk: true },
  { g: 'idt', key: 'gap', label: 'Gap between IDTs', unit: 'µm', si: 1e-6, def: 1000, step: 10, min: 0, zeroOk: true },
  { g: 'idt', key: 'loss', label: 'Propagation loss', unit: 'dB/mm', si: 1000, def: 0, step: 0.01, min: 0, zeroOk: true },

  { g: 'el', key: 'fingerR', label: 'Include finger resistance', type: 'check', def: true },
  { g: 'el', key: 'metal', label: 'Metal', type: 'select', def: 'Al',
    options: [...Object.entries(METALS).map(([k, m]) => [k, m.label]), ['other', 'Other']],
    show: (s) => s.fingerR },
  { g: 'el', key: 'rho', label: 'Resistivity ρ', unit: 'µΩ·cm', si: 1e-8, def: 2.65, step: 0.01, min: 0,
    show: (s) => s.fingerR },
  { g: 'el', key: 'h', label: 'Metal thickness h', unit: 'nm', si: 1e-9, def: 100, step: 5, min: 0,
    show: (s) => s.fingerR },

  { g: 'port', key: 'Z0', label: 'Port impedance Z₀', unit: 'Ω', si: 1, def: 50, step: 1, min: 0 },
  { g: 'port', key: 'pads', label: 'Include pads and leads', type: 'check', def: true },
  { g: 'port', key: 'padS', label: 'Signal pad width', unit: 'µm', si: 1e-6, def: 100, step: 5, min: 0, show: (s) => s.pads },
  { g: 'port', key: 'padG', label: 'Gap to ground pads', unit: 'µm', si: 1e-6, def: 50, step: 5, min: 0, show: (s) => s.pads },
  { g: 'port', key: 'padL', label: 'Pad length', unit: 'µm', si: 1e-6, def: 100, step: 5, min: 0, show: (s) => s.pads },
  { g: 'port', key: 'CpadAuto', label: 'Estimate Cpad from pad size', type: 'check', def: true, show: (s) => s.pads },
  { g: 'port', key: 'Cpad', label: 'Pad capacitance', unit: 'fF', si: 1e-15, def: 76, step: 1, min: 0, zeroOk: true,
    show: (s) => s.pads, disabled: (s) => s.CpadAuto },
  { g: 'port', key: 'Rlead', label: 'Lead resistance', unit: 'Ω', si: 1, def: 0, step: 0.1, min: 0, zeroOk: true, show: (s) => s.pads },
  { g: 'port', key: 'Llead', label: 'Lead inductance', unit: 'nH', si: 1e-9, def: 0, step: 0.1, min: 0, zeroOk: true, show: (s) => s.pads },
  { g: 'port', key: 'Cft', label: 'Feedthrough capacitance', unit: 'fF', si: 1e-15, def: 0, step: 0.1, min: 0, zeroOk: true },

  { g: 'tune', key: 'match', label: 'Tuning inductor', type: 'select', def: 'none',
    options: [['none', 'None (probe on pad)'], ['seriesL', 'Series L'], ['shuntL', 'Shunt L']] },
  { g: 'tune', key: 'Lm1', label: 'L at port 1', unit: 'nH', si: 1e-9, def: 0, step: 0.1, min: 0, zeroOk: true,
    show: (s) => s.match !== 'none' },
  { g: 'tune', key: 'Lm2', label: 'L at port 2', unit: 'nH', si: 1e-9, def: 0, step: 0.1, min: 0, zeroOk: true,
    show: (s) => s.match !== 'none' },

  { g: 'sim', key: 'span', label: 'Span, ± of f₀', unit: '%', si: 0.01, def: 15, step: 1, min: 0, max: 95 },
  { g: 'sim', key: 'nPts', label: 'Frequency points', type: 'int', si: 1, def: 2001, step: 100, min: 11, max: 20001 },
  { g: 'sim', key: 'regeneration', label: 'Include triple-transit echo (regeneration)', type: 'check', def: true },
  { g: 'sim', key: 'markers', label: 'Show data points on curves', type: 'check', def: false },
];
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const SUBSTRATE_KEYS = ['v', 'K2', 'Cs'];

// ---------------------------------------------------------------------------
// Form building
const form = document.getElementById('form');
const el = {}; // key -> input/select element
const rows = {}; // key -> row element
const notes = {}; // group -> note element

function buildForm() {
  for (const [g, title] of GROUPS) {
    const fs = document.createElement('fieldset');
    const lg = document.createElement('legend');
    lg.textContent = title;
    fs.append(lg);
    for (const f of FIELDS.filter((x) => x.g === g)) {
      const row = document.createElement('div');
      const id = `f-${f.key}`;
      if (f.type === 'check') {
        row.className = 'row check';
        const inp = Object.assign(document.createElement('input'), { type: 'checkbox', id });
        const lab = Object.assign(document.createElement('label'), { htmlFor: id, textContent: f.label });
        row.append(inp, lab);
        el[f.key] = inp;
      } else {
        row.className = 'row';
        const lab = Object.assign(document.createElement('label'), { htmlFor: id, textContent: f.label });
        const wrap = document.createElement('div');
        wrap.className = 'field';
        let inp;
        if (f.type === 'select') {
          inp = document.createElement('select');
          for (const [v, t] of f.options) inp.append(new Option(t, v));
        } else {
          inp = Object.assign(document.createElement('input'), { type: 'number', inputMode: 'decimal' });
          if (f.step != null) inp.step = f.step;
          if (f.min != null) inp.min = f.min;
          if (f.max != null) inp.max = f.max;
        }
        inp.id = id;
        wrap.append(inp);
        if (f.type !== 'select') wrap.append(Object.assign(document.createElement('span'), { className: 'unit', textContent: f.unit || '' }));
        row.append(lab, wrap);
        el[f.key] = inp;
      }
      rows[f.key] = row;
      fs.append(row);
      if (f.key === 'Cs') fs.append(notes.sub = mk('p', 'note'));
      if (f.key === 'W') fs.append(buttons([
        ['btn-w-re', 'W for Re Z = Z₀'], ['btn-w-abs', 'W for |Z| = Z₀ (lowest loss)'],
      ]));
      if (f.key === 'Cft') fs.append(notes.port = mk('p', 'note'));
      if (f.key === 'Lm2') fs.append(buttons([['btn-l-auto', 'Set L to cancel reactance at f₀']]), notes.tune = mk('p', 'note'));
    }
    form.append(fs);
  }
}
const mk = (tag, cls) => Object.assign(document.createElement(tag), { className: cls });
function buttons(list) {
  const d = mk('div', 'btnrow');
  for (const [id, t] of list) d.append(Object.assign(document.createElement('button'), { type: 'button', id, textContent: t }));
  return d;
}

// ---------------------------------------------------------------------------
// State: display values keyed by field
const defaults = () => Object.fromEntries(FIELDS.map((f) => [f.key, f.def]));

function readForm() {
  const s = {};
  for (const f of FIELDS) {
    const e = el[f.key];
    if (f.type === 'check') s[f.key] = e.checked;
    else if (f.type === 'select') s[f.key] = e.value;
    else s[f.key] = e.value === '' ? NaN : Number(e.value);
  }
  return s;
}

function writeForm(s) {
  for (const f of FIELDS) {
    const e = el[f.key];
    if (f.type === 'check') e.checked = !!s[f.key];
    else e.value = s[f.key];
  }
}

function fromHash() {
  const s = defaults();
  const h = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of h) {
    const f = BY_KEY[k];
    if (!f) continue;
    if (f.type === 'check') s[k] = v === '1';
    else if (f.type === 'select') { if (f.options.some(([o]) => o === v)) s[k] = v; }
    else if (Number.isFinite(Number(v))) s[k] = Number(v);
  }
  return s;
}

function toHash(s) {
  const d = defaults();
  const h = new URLSearchParams();
  for (const f of FIELDS) {
    const v = s[f.key];
    if (rows[f.key].hidden || el[f.key].disabled) continue; // computed, estimated or not in use
    if (f.type === 'check') { if (v !== d[f.key]) h.set(f.key, v ? '1' : '0'); }
    else if (v !== d[f.key] && !(typeof v === 'number' && Number.isNaN(v))) h.set(f.key, String(v));
  }
  const str = h.toString();
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}

// Visibility, disabled states and validation
function refreshForm(s) {
  let ok = true;
  for (const f of FIELDS) {
    const row = rows[f.key];
    row.hidden = f.show ? !f.show(s) : false;
    if (f.disabled) el[f.key].disabled = f.disabled(s);
    if (f.type === 'check' || f.type === 'select' || row.hidden || el[f.key].disabled) { row.classList.remove('invalid'); continue; }
    const v = s[f.key];
    let bad = !Number.isFinite(v);
    if (!bad && f.min != null) bad = f.zeroOk ? v < f.min : v <= f.min;
    if (!bad && f.max != null) bad = v > f.max;
    if (!bad && f.type === 'int') bad = !Number.isInteger(v);
    row.classList.toggle('invalid', bad);
    if (bad) ok = false;
  }
  return ok;
}

const anglesOf = (s) => ({ psi: s.psi, rot: s.rot, e1: s.e1, e2: s.e2, e3: s.e3 });

/** Solver result for the current cut (also in manual mode, for reference). */
let subState = null;
function computeSubstrate(s) {
  const orient = s.cut === 'custom' ? null : orientation(s.cut, anglesOf(s));
  const angles = anglesOf(s);
  const finiteAngles = Object.values(angles).every(Number.isFinite);
  if (!orient || !finiteAngles) return { orient: null, res: null };
  return { orient, res: solveSubstrate(orient, { set: s.consts }) };
}

function toParams(s) {
  const p = {};
  for (const f of FIELDS) {
    if (f.type === 'check' || f.type === 'select') p[f.key] = s[f.key];
    else p[f.key] = s[f.key] * f.si;
  }
  let { v, K2, Cs } = p;
  if (usesSolver(s)) ({ v0: v, K2, Cs } = subState.res);
  return resolve({
    cut: p.cut, ...anglesOf(s), substrate: 'manual', v, K2, Cs,
    f0: p.f0, Np1: p.Np1, Np2: p.Np2, W: p.W, gap: p.gap, lossDbPerM: p.loss, dvIdt: p.dvIdt,
    Z0: p.Z0, fingerR: p.fingerR, rho: p.rho, h: p.h,
    pads: p.pads, padS: p.padS, padG: p.padG, padL: p.padL, Cpad: s.CpadAuto ? null : p.Cpad,
    Rlead: p.Rlead, Llead: p.Llead, Cft: p.Cft,
    match: p.match, Lm1: p.Lm1, Lm2: p.Lm2,
    regeneration: p.regeneration, span: p.span, nPts: p.nPts,
  });
}

// ---------------------------------------------------------------------------
// Formatting
const nf = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const sig = (x, n = 4) => (Number.isFinite(x) ? Number(x.toPrecision(n)).toString() : '–');
const fmtZ = (z, d = 1) => `${nf(z.re, d)} ${z.im < 0 ? '−' : '+'} j${nf(Math.abs(z.im), d)} Ω`;
const minus = (s) => String(s).replace(/^-/, '−');

// ---------------------------------------------------------------------------
// Theme for plots, read from the CSS tokens
function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    surface: v('--surface'), ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'),
    grid: v('--grid'), axis: v('--axis'), s1: v('--s1'), s2: v('--s2'), s3: v('--s3'),
  };
}

function baseLayout(t, xTitle, yTitle) {
  const ax = (title) => ({
    title: { text: title, font: { size: 12, color: t.ink2 } },
    gridcolor: t.grid, linecolor: t.axis, zerolinecolor: t.axis, tickfont: { size: 11, color: t.muted },
    automargin: true,
  });
  return {
    paper_bgcolor: t.surface, plot_bgcolor: t.surface,
    font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 12, color: t.ink2 },
    margin: { l: 56, r: 12, t: 28, b: 42 },
    xaxis: ax(xTitle), yaxis: ax(yTitle),
    legend: { orientation: 'h', x: 0.03, y: 1.02, yanchor: 'bottom', font: { size: 11, color: t.ink2 } }, // clear of the y-axis triangle
    hovermode: 'x unified',
    hoverlabel: { bgcolor: t.surface, bordercolor: t.axis, font: { color: t.ink } },
  };
}

const vline = (x, t, dash = 'dot') => ({
  type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { color: t.muted, width: 1, dash },
});
const CONFIG = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };

function line(x, y, name, color, extra = {}) {
  const { line: lx = {}, ...rest } = extra;
  return { x, y, name, type: 'scatter', mode: 'lines', ...rest, line: { color, width: 2, ...lx } };
}
// Triangles at the far ends of the x and y axes: drag an axis end to stretch the range,
// the middle of an axis to shift it (Plotly axis drag; cursors set in style.css).
const axisEnds = (t) => [
  { xanchor: 1, yanchor: 0, path: 'M 3 -5 L 11 0 L 3 5 Z' },
  { xanchor: 0, yanchor: 1, path: 'M -5 3 L 0 11 L 5 3 Z' },
].map((m) => ({
  type: 'path', xref: 'paper', yref: 'paper', xsizemode: 'pixel', ysizemode: 'pixel', layer: 'above',
  fillcolor: t.muted, line: { width: 0 }, ...m,
}));

let showPoints = false; // "Show data points on curves"
function react(id, data, layout) {
  if (!window.Plotly) return;
  const d = showPoints
    ? data.map((tr) => (tr.mode === 'lines' ? { ...tr, mode: 'lines+markers', marker: { size: 4, color: tr.line?.color } } : tr))
    : data;
  const lay = layout.xaxis ? { ...layout, shapes: [...(layout.shapes ?? []), ...axisEnds(theme())] } : layout;
  window.Plotly.react(id, d, lay, CONFIG);
}

// ---------------------------------------------------------------------------
// Render: device results
let last = null; // { s, p, res }

function render(s, p, res) {
  const t = theme();
  const S = res.summary;
  const fM = Array.from(res.f, (x) => x / 1e6);
  const f0M = p.f0 / 1e6;
  const sub = subState?.res;

  // Cards
  const bw = S.band.bw, bwn = S.nulls.bw;
  const step = (res.f[1] - res.f[0]) / 1e6;
  const cards = [
    ['Insertion loss at f₀', `${nf(-S.s21f0)} dB`, `single transit: ${nf(-S.s21f0single)} dB`,
      'Loss from port 1 to port 2 at f₀, −20·log₁₀|S21|, at the probe tips with pads, leads, finger resistance and tuning. Single transit: the same without the triple-transit echo (acoustic regeneration between the IDTs).'],
    ['Peak S21', `${minus(nf(S.band.ymax))} dB`, `at ${nf(S.band.fmax / 1e6, 3)} MHz`,
      'Highest |S21| in the sweep and its frequency. It can sit off f₀ because of the triple-transit ripple and the electrical loading of the IDTs.'],
    ['Electrode pitch', `${nf(S.pitch * 1e6, 3)} µm`, `λ = ${nf(S.lambda * 1e6, 3)} µm · finger ${nf(S.a * 1e6, 3)} µm`,
      'Finger centre-to-centre distance of the single-electrode IDTs, p = λ/2, where λ = v_IDT/f₀ is the wavelength under the IDTs at f₀. Finger width λ/4 (metallization ratio 0.5). For heavy electrodes, enter the velocity shift under the IDTs (IDTs and delay line); Details lists both wavelengths.'],
    ['3-dB bandwidth', bw ? `${nf(bw / 1e6, 2)} MHz` : 'wider than span', bw ? `${nf(100 * bw / p.f0, 2)} % of f₀` : 'increase the span',
      'Width of the band where |S21| stays within 3 dB of its peak.'],
    ['Zero-to-zero bandwidth', bwn ? `${nf(bwn / 1e6, 2)} MHz` : 'nulls outside span',
      bwn ? `${nf(100 * bwn / p.f0, 2)} % of f₀ · 2f₀/N = ${nf(S.bwNullImpulse / 1e6, 2)} MHz` : 'increase the span',
      `Frequency span between the first transmission nulls on each side of the passband, read from the S21 trace (resolution ${sig(step, 3)} MHz, one frequency step). In the impulse model the first nulls are at f₀(1 ± 1/N), so the width is 2f₀/N, with N the larger finger-pair count of the two IDTs.`],
    ['Z at probe, port 1 (f₀)', fmtZ(S.Zin1), `|Z| = ${nf(abs(S.Zin1), 1)} Ω · S11 = ${minus(nf(S.s11f0))} dB`,
      'Impedance seen from the probe tip into port 1 at f₀, as a calibrated VNA measures it: IDT 1 with its finger resistance, leads, pad capacitance and tuning inductor, and with IDT 2 present and port 2 terminated in Z₀. S11 is its reflection against Z₀.'],
    ['Bare IDT 1 (f₀)', fmtZ(S.Zidt1), `Ct = ${nf(S.Ct1 * 1e12, 3)} pF · Ga₀ = ${nf(S.Ga01 * 1e3, 3)} mS`,
      'Impedance of IDT 1 by itself at f₀, 1/(Ga + jBa + jωCt): radiation conductance Ga, acoustic susceptance Ba and finger capacitance Ct only, without pads, leads, finger resistance or the second IDT. Ga₀ is Ga at f₀.'],
  ];
  document.getElementById('cards').innerHTML = cards.map(([k, v, sb, tip]) =>
    `<div class="card" tabindex="0"><div class="k">${k} <span class="info" aria-hidden="true">ⓘ</span></div>` +
    `<div class="v">${v}</div><div class="s">${sb}</div><div class="tip" role="tooltip">${tip}</div></div>`).join('');

  // Details table
  const m = S.match;
  const L = (x) => (x == null ? '–' : `${nf(x * 1e9, 1)} nH`);
  const walk = sub?.ok && Number.isFinite(sub.pfa) ? S.Lcc * Math.tan(sub.pfa * Math.PI / 180) : null;
  const det = [
    ['Substrate values', usesSolver(s) ? 'computed (solver)' : 'entered by hand'],
    ['v₀ / K² / Cs used', `${nf(p.v, 1)} m/s / ${nf(p.K2 * 100, 3)} % / ${nf(p.Cs * 1e10, 3)} pF/cm`],
    ...(sub?.ok ? [
      ['Solver: vₘ / ε∞', `${nf(sub.vm, 1)} m/s / ${nf(sub.epsInf, 2)} ε₀`],
      ['Solver: power-flow angle', `${minus(nf(sub.pfa, 2))}°`],
      ['Beam walk-off over centre-to-centre distance', walk == null ? '–' : `${minus(nf(walk * 1e6, 1))} µm (W = ${nf(p.W * 1e6, 0)} µm)`],
    ] : []),
    ...(sub ? [['Slowest bulk-wave limit', `${nf(sub.vlim, 1)} m/s`]] : []),
    ['Electrode pitch p = λ/2', `${nf(S.pitch * 1e6, 3)} µm`],
    ['Wavelength under the IDTs λ / finger width λ/4', `${nf(S.lambda * 1e6, 3)} / ${nf(S.a * 1e6, 3)} µm`],
    ['Velocity under the IDTs (Δv/v₀)', `${nf(S.vIdt, 1)} m/s (${minus(nf((p.dvIdt ?? 0) * 100, 2))} %)`],
    ['Free-surface wavelength v₀/f₀', `${nf(S.lambdaFree * 1e6, 3)} µm`],
    ...(sub?.ok ? [['Metallized-surface wavelength vₘ/f₀ (shorting only)', `${nf((sub.vm / p.f0) * 1e6, 3)} µm`]] : []),
    ['IDT lengths (1 / 2)', `${nf(p.Np1 * S.lambda * 1e6, 0)} / ${nf(p.Np2 * S.lambda * 1e6, 0)} µm`],
    ['Centre-to-centre distance', `${nf(S.Lcc * 1e3, 3)} mm`],
    ['Acoustic delay τ', `${nf(S.tau * 1e6, 4)} µs`],
    ['Ct (IDT 1 / IDT 2)', `${nf(S.Ct1 * 1e12, 3)} / ${nf(S.Ct2 * 1e12, 3)} pF`],
    ['Finger resistance (1 / 2)', p.fingerR ? `${nf(S.R1, 3)} / ${nf(S.R2, 3)} Ω` : 'off'],
    ['Pad capacitance', p.pads ? `${nf(p.Cpad * 1e15, 1)} fF` : 'off'],
    ['Np for widest band, √(π/4K²)', nf(S.npOpt, 2)],
    ['W for Re Z = Z₀ (IDT 1)', `${nf(S.wReZ * 1e6, 1)} µm`],
    ['W for |Z| = Z₀ (IDT 1)', `${nf(S.wAbsZ * 1e6, 1)} µm`],
    ['Series L to cancel X (1 / 2)', `${L(m.series1)} / ${L(m.series2)}`],
    ['Shunt L to cancel B (1 / 2)', `${L(m.shunt1)} / ${L(m.shunt2)}`],
  ];
  document.getElementById('details').innerHTML = det.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  if (!window.Plotly) {
    showMsg('Plotting library did not load (offline?). Numbers above are still valid.');
    return;
  }

  // S-parameters
  const s11 = res.pts.map((r) => dB(r.S11)), s22 = res.pts.map((r) => dB(r.S22));
  // Clip the deep sinc nulls so the passband stays readable.
  const floor = Math.max(Math.min(...res.s21dB), S.band.ymax - 70);
  const sLayout = baseLayout(t, 'Frequency (MHz)', 'Magnitude (dB)');
  sLayout.yaxis.range = [floor - 2, 2];
  react('plot-s', [
    line(fM, Array.from(res.s21dB), 'S21', t.s1),
    line(fM, s11, 'S11', t.s2),
    line(fM, s22, 'S22', t.s3),
  ], { ...sLayout, shapes: [vline(f0M, t)] });

  // Impedance at port 1
  react('plot-z', [
    line(fM, res.pts.map((r) => r.Zin1.re), 'Re Z, probe', t.s1),
    line(fM, res.pts.map((r) => r.Zin1.im), 'Im Z, probe', t.s2),
    line(fM, res.pts.map((r) => r.Zidt1.re), 'Re Z, bare IDT', t.s1, { line: { dash: 'dash', width: 1.5 } }),
    line(fM, res.pts.map((r) => r.Zidt1.im), 'Im Z, bare IDT', t.s2, { line: { dash: 'dash', width: 1.5 } }),
  ], { ...baseLayout(t, 'Frequency (MHz)', 'Impedance (Ω)'), shapes: [vline(f0M, t)] });

  // Admittance of IDT 1
  react('plot-y', [
    line(fM, res.pts.map((r) => r.Ga1 * 1e3), 'Ga', t.s1),
    line(fM, res.pts.map((r) => r.Ba1 * 1e3), 'Ba', t.s2),
    line(fM, res.pts.map((r) => r.wCt1 * 1e3), 'ωCt', t.s3),
  ], { ...baseLayout(t, 'Frequency (MHz)', 'Admittance (mS)'), shapes: [vline(f0M, t)] });

  // Smith chart
  const zn = (k) => res.pts.map((r) => r[k].re / p.Z0);
  const zi = (k) => res.pts.map((r) => r[k].im / p.Z0);
  const smithTrace = (k, name, color) => ({
    type: 'scattersmith', mode: 'lines', name, real: zn(k), imag: zi(k), line: { color, width: 2 },
    customdata: fM, hovertemplate: `${name}<br>%{customdata:.3f} MHz<br>z = %{real:.3f} %{imag:+.3f}j<extra></extra>`,
  });
  const smithDot = (k, color) => ({
    type: 'scattersmith', mode: 'markers', showlegend: false, real: [S[k].re / p.Z0], imag: [S[k].im / p.Z0],
    marker: { color, size: 9, line: { color: t.surface, width: 2 } }, hoverinfo: 'skip',
  });
  const gridAx = { gridcolor: t.grid, linecolor: t.axis, tickfont: { size: 10, color: t.muted } };
  react('plot-smith', [
    smithTrace('Zin1', 'S11', t.s1), smithTrace('Zin2', 'S22', t.s2),
    smithDot('Zin1', t.s1), smithDot('Zin2', t.s2),
  ], {
    ...baseLayout(t, '', ''), hovermode: 'closest',
    margin: { l: 24, r: 24, t: 28, b: 24 },
    smith: { bgcolor: t.surface, realaxis: gridAx, imaginaryaxis: gridAx },
  });

  // Group delay
  // Blank (null) where the group delay is undefined: transmission zeros, deep stopband.
  react('plot-gd', [line(fM, Array.from(res.gd, (x) => (Number.isFinite(x) ? x * 1e6 : null)), 'Group delay', t.s1)],
    { ...baseLayout(t, 'Frequency (MHz)', 'Group delay (µs)'), showlegend: false, shapes: [vline(f0M, t)] });
}

function renderNpSweep(p) {
  if (!window.Plotly) return;
  const t = theme();
  const npMax = Math.min(100, Math.max(40, 2 * Math.max(p.Np1, p.Np2)));
  const sw = sweepNp(p, npMax);
  const npOpt = Math.sqrt(Math.PI / (4 * p.K2));
  const shapes = [vline(p.Np1, t, 'dot'), ...(Number.isFinite(npOpt) ? [vline(npOpt, t, 'dash')] : [])];
  const wLabel = `W = ${sig(p.W * 1e6, 4)} µm`;
  const hoverW = { customdata: sw.wAbs.map((w) => w * 1e6), hovertemplate: '%{y:.2f} (W = %{customdata:.0f} µm)' };
  // Axis ranges: very small Np gives huge loss and bandwidth; keep the useful region in view.
  const ilLayout = baseLayout(t, 'Finger pairs Np', 'Insertion loss (dB)');
  ilLayout.yaxis.range = [5, Math.max(20, Math.min(40, sw.ilW[p.Np1 - 1] + 5 || 40))];
  const bwM = (a) => a.map((x) => (x == null ? null : x / 1e6));
  const bwW = bwM(sw.bwW), bwAbs = bwM(sw.bwAbs);
  const bwLayout = baseLayout(t, 'Finger pairs Np', '3-dB bandwidth (MHz)');
  const ref = Math.max(bwW[2] ?? 0, bwAbs[2] ?? 0); // value at Np = 3
  if (ref > 0) bwLayout.yaxis.range = [0, ref * 1.05];
  react('plot-np-il', [
    line(sw.N, sw.ilW, wLabel, t.s1),
    line(sw.N, sw.ilAbs, 'W for |Z| = Z₀', t.s2, hoverW),
  ], { ...ilLayout, shapes });
  react('plot-np-bw', [
    line(sw.N, bwW, wLabel, t.s1),
    line(sw.N, bwAbs, 'W for |Z| = Z₀', t.s2, hoverW),
  ], { ...bwLayout, shapes });
}

// ---------------------------------------------------------------------------
// Substrate angle sweep (Web Worker)
const SWEEP_LIST = Array.from({ length: 181 }, (_, i) => i); // 0..180 deg, 1 deg steps
let worker = null, sweepId = 0, sweepKey = null, sweepRows = null, sweepFam = null;

function sweepStatus(text) { document.getElementById('sweep-status').textContent = text; }

function startWorker() {
  try {
    worker = new Worker(new URL('./saw/worker.js?v=6fac78a005', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.id !== sweepId) return;
      if (d.error) { sweepStatus(`Sweep failed: ${d.error}`); return; }
      if (d.rows) { sweepRows = d.rows; sweepStatus(''); renderSubstrateSweep(); return; }
      sweepStatus(`Computing the angle sweep… ${Math.round(100 * d.progress)} %`);
    };
    worker.onerror = () => { worker = null; sweepStatus('Background thread unavailable; the angle sweep is off.'); };
  } catch {
    worker = null;
  }
}

function updateSubstrateSweep(s) {
  const pr = PRESETS[s.cut];
  const section = document.getElementById('substrate-sweep');
  if (!pr?.sweep || !Object.values(anglesOf(s)).every(Number.isFinite)) { section.hidden = true; return; }
  section.hidden = false;
  const fam = pr.sweep;
  // Only the Euler family has fixed angles besides the swept one.
  const base = fam.cut === 'euler' ? { e1: s.e1, e2: s.e2 } : fam.cut === 'RY' ? { psi: s.psi } : {};
  const key = JSON.stringify([fam.cut, fam.key, base, s.consts]);
  sweepFam = { ...fam, at: fam.at ?? s[fam.key] };
  if (key === sweepKey) { renderSubstrateSweep(); return; }
  sweepKey = key;
  sweepRows = null;
  if (!worker) { sweepStatus('Background thread unavailable; the angle sweep is off.'); return; }
  sweepId += 1;
  sweepStatus('Computing the angle sweep…');
  worker.postMessage({ id: sweepId, fam, base, list: SWEEP_LIST, set: s.consts });
}

function renderSubstrateSweep() {
  if (!window.Plotly || !sweepRows || !sweepFam) return;
  const t = theme();
  const x = sweepRows.map((r) => r.ang);
  const y = (f) => sweepRows.map((r) => (r.ok ? f(r) : null));
  const at = ((sweepFam.at % 180) + 180) % 180;
  const shapes = [vline(at, t)];
  const lay = (yt) => ({ ...baseLayout(t, sweepFam.axis, yt), shapes });
  react('plot-sw-v', [
    line(x, y((r) => r.v0), 'v₀ (free)', t.s1),
    line(x, y((r) => r.vm), 'vₘ (metallized)', t.s2),
  ], lay('Velocity (m/s)'));
  react('plot-sw-k', [line(x, y((r) => r.K2 * 100), 'K²', t.s1)], { ...lay('K² (%)'), showlegend: false });
  // Keep at least ±1° in view so that a symmetry-zero angle does not autoscale into numerical noise.
  const pfa = y((r) => (Math.abs(r.pfa) < 1e-4 ? 0 : r.pfa));
  const pmax = Math.max(1, ...pfa.filter(Number.isFinite).map(Math.abs)) * 1.1;
  const pLay = lay('Power-flow angle (°)');
  pLay.yaxis.range = [-pmax, pmax];
  react('plot-sw-pfa', [line(x, pfa, 'Power-flow angle', t.s1)], { ...pLay, showlegend: false });
  react('plot-sw-cs', [line(x, y((r) => r.Cs * 1e10), 'Cs', t.s1)], { ...lay('Cs (pF/cm)'), showlegend: false });
  for (const id of ['plot-sw-v', 'plot-sw-k', 'plot-sw-pfa', 'plot-sw-cs']) {
    const div = document.getElementById(id);
    if (div.on && !div.dataset.click) { div.on('plotly_click', onSweepClick); div.dataset.click = '1'; }
  }
  const gaps = sweepRows.filter((r) => !r.ok).length;
  document.getElementById('sweep-hint').textContent =
    `Free and metallized velocity, K², power-flow angle and Cs = ε∞ across ${sweepFam.axis.replace(/ \(°\).*/, '')}, 1° steps. ` +
    'Dotted line: current orientation. Click a chart to move to that angle.' +
    (sweepFam.cut === 'RY' ? ' Only the Rayleigh-type wave is computed; on 41° and 64° Y-cuts at φ = 0 the strongly coupled wave is a leaky shear wave, which is not shown.' : '') +
    (gaps ? ` Gaps (${gaps} of ${sweepRows.length} angles): no true SAW below the bulk-wave limit (leaky waves are not modelled).` : '');
}

function onSweepClick(ev) {
  const xv = ev?.points?.[0]?.x;
  if (!Number.isFinite(xv) || !sweepFam) return;
  const s = readForm();
  if (PRESETS[s.cut].sweep.cut !== s.cut) el.cut.value = sweepFam.cut; // 128YX -> RY, YZ -> Ycut
  el[sweepFam.key].value = Math.round(xv);
  update();
}

// ---------------------------------------------------------------------------
// Orientation: 3D chip view and COMSOL Euler angles
const degStr = (x) => String(Math.round(x * 1000) / 1000 || 0); // ASCII, for COMSOL
const degShow = (x) => `${degStr(x).replace('-', '−')}°`;
const vecShow = (v) => `(${v.map((x) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(3).replace('-', '−'))).join(', ')})`;

function updateOrientation() {
  const sec = document.getElementById('orientation');
  const o = subState?.orient;
  sec.hidden = !o;
  if (!o) return;
  if (window.Plotly) {
    const fig = chipFigure(o.A, subState.res?.ok ? subState.res.pfa : null, theme());
    window.Plotly.react('plot-3d', fig.data, fig.layout, { ...CONFIG, modeBarButtonsToRemove: [] });
  }
  const c = comsolEuler(o.A), te = toolEuler(o.A);
  const row = (name, e) => {
    const copy = `alpha ${degStr(e.alpha)}[deg]\nbeta ${degStr(e.beta)}[deg]\ngamma ${degStr(e.gamma)}[deg]`;
    return `<tr><td>${name}</td><td>${degShow(e.alpha)}</td><td>${degShow(e.beta)}</td><td>${degShow(e.gamma)}</td>` +
      `<td><button type="button" data-copy="${copy}">Copy</button></td></tr>`;
  };
  const ax = c.d3.axes;
  document.getElementById('euler').innerHTML =
    '<table class="euler-table"><thead><tr><th>Model</th><th>α</th><th>β</th><th>γ</th><th></th></tr></thead><tbody>' +
    row('3D: x = SAW, z = surface normal', c.d3) + row('2D: x = SAW, y = surface normal', c.d2) +
    '</tbody></table><ul class="euler-notes">' +
    `<li>Crystal axes in the 3D global axes: X = ${vecShow(ax.X)}, Y = ${vecShow(ax.Y)}, Z = ${vecShow(ax.Z)}.</li>` +
    `<li>Surface normal n = ${vecShow(o.A[2])} and SAW direction ${vecShow(o.A[0])}, in crystal axes.</li>` +
    '<li>The normal points out of the chip; the substrate lies below the top surface. In 2D, z = x × y.</li>' +
    '<li>In COMSOL: Definitions › Coordinate Systems › Rotated System (Euler angles, Z-X-Z). Select it as the coordinate system of the piezoelectric material, whose data stay in crystal axes. Copy gives the angles in COMSOL syntax.</li>' +
    '<li>COMSOL\'s 128°Y-X example uses (0, −38°, 0) in 3D and (0, −128°, 0) in 2D. The opposite face gives the same SAW velocity and coupling.</li>' +
    `<li>Euler input on this page (λ, μ, θ): (${degShow(te.lambda)}, ${degShow(te.mu)}, ${degShow(te.theta)}).</li></ul>`;
}

// ---------------------------------------------------------------------------
// Notes
function updateNotes(s) {
  const pr = PRESETS[s.cut];
  const r = subState?.res;
  const parts = [];
  let warn = false;
  if (s.cut === 'custom') {
    parts.push('Enter v, K² and Cs for your substrate.');
  } else if (r && r.ok) {
    parts.push(`Solver (${CONSTANT_SETS[s.consts]?.label ?? ''}): v₀ = ${nf(r.v0, 1)} m/s, vₘ = ${nf(r.vm, 1)} m/s, ` +
      `K² = ${nf(r.K2 * 100, 3)} %, ε∞ = ${nf(r.epsInf, 2)} ε₀ (Cs = ${nf(r.Cs * 1e10, 3)} pF/cm), ` +
      `power-flow angle ${minus(nf(r.pfa, 2))}°.`);
    if (s.mode === 'manual') parts.push('Device model uses the values entered by hand.');
    if (Math.abs(r.pfa) > 0.5) { parts.push('The beam steers off the IDT axis; see the walk-off in Details.'); warn = true; }
  } else if (r) {
    warn = true;
    parts.push(`No true SAW below the slowest bulk-wave limit (${nf(r.vlim, 1)} m/s) for this orientation; it carries leaky waves only, which the solver does not model. The device model uses the values entered by hand.`);
  }
  if (pr?.pub && (!pr.angles?.includes('psi') || s.psi === 0)) parts.push(`Published: v₀ = ${pr.pub.v0}, vₘ = ${pr.pub.vm} m/s, K² = ${nf(pr.pub.K2 * 100, 1)} % (${pr.pub.source}).`);
  notes.sub.textContent = parts.join(' ');
  notes.sub.className = warn ? 'note warn' : 'note';
  notes.port.textContent = 'Reference plane: probe tips after calibration. Turn pads off to compare with de-embedded data.';
  notes.tune.textContent = s.match === 'none' ? ''
    : 'Tuning L sits between the probe and the pad. The auto value cancels the reactance of each IDT on its own; with both ports tuned, the triple-transit echo grows and the port impedance ripples around that value.';
}

function showMsg(text) {
  const m = document.getElementById('msg');
  m.hidden = !text;
  m.textContent = text || '';
}

// ---------------------------------------------------------------------------
// Update cycle
let timer = null, npTimer = null;

function update() {
  const s = readForm();
  subState = computeSubstrate(s);
  showPoints = !!s.markers;
  const ok = refreshForm(s);
  // Show solver values in the (disabled) substrate fields.
  if (usesSolver(s)) {
    const r = subState.res;
    el.v.value = nf(r.v0, 1); el.K2.value = nf(r.K2 * 100, 3); el.Cs.value = nf(r.Cs * 1e10, 3);
    s.v = Number(el.v.value); s.K2 = Number(el.K2.value); s.Cs = Number(el.Cs.value);
  }
  toHash(s);
  updateNotes(s);
  updateOrientation();
  updateSubstrateSweep(s);
  if (!ok) { showMsg('Some inputs are out of range (marked in red). Results show the last valid inputs.'); return; }
  let p, res;
  try {
    p = toParams(s);
    res = simulate(p);
  } catch (err) {
    showMsg(`Calculation failed: ${err.message}`);
    return;
  }
  showMsg('');
  if (s.pads && s.CpadAuto) el.Cpad.value = sig(p.Cpad * 1e15, 3);
  last = { s, p, res };
  render(s, p, res);
  clearTimeout(npTimer);
  npTimer = setTimeout(() => renderNpSweep(p), 60);
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(update, 80);
}

// ---------------------------------------------------------------------------
// Events
function onCutChange() {
  // Moving to a cut that has no solver result keeps the current v, K², Cs as manual values.
  if (el.cut.value === 'custom') el.mode.value = 'manual';
}

function onMetalChange() {
  const m = METALS[el.metal.value];
  if (m) el.rho.value = Number((m.rho * 1e8).toFixed(4));
}

function setW(kind) {
  if (!last) return;
  const { p } = last;
  const q = { f0: p.f0, Np: p.Np1, K2: p.K2, Cs: p.Cs };
  const w = kind === 're' ? apertureForReZ(q, p.Z0) : apertureForAbsZ(q, p.Z0);
  el.W.value = Number((w * 1e6).toFixed(1));
  update();
}

function setL() {
  if (!last) return;
  // The auto values are computed without tuning, so they apply to either topology.
  const m = last.res.summary.match;
  if (el.match.value === 'none') el.match.value = 'seriesL';
  const k = el.match.value === 'shuntL' ? 'shunt' : 'series';
  const L1 = m[`${k}1`], L2 = m[`${k}2`];
  el.Lm1.value = L1 == null ? 0 : Number((L1 * 1e9).toFixed(2));
  el.Lm2.value = L2 == null ? 0 : Number((L2 * 1e9).toFixed(2));
  update();
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function fileStem() {
  const { s } = last;
  return `saw_${s.cut}_${s.f0}MHz_Np${s.Np1}-${s.Np2}_W${s.W}um`;
}

function rerenderAll() {
  if (!last) return;
  render(last.s, last.p, last.res);
  renderNpSweep(last.p);
  renderSubstrateSweep();
  updateOrientation();
}

function init() {
  buildForm();
  writeForm(fromHash());
  startWorker();
  form.addEventListener('input', (e) => {
    if (e.target === el.cut) onCutChange();
    if (e.target === el.metal) onMetalChange();
    if (e.target === el.rho) el.metal.value = 'other';
    schedule();
  });
  form.addEventListener('change', schedule);
  document.getElementById('btn-w-re').addEventListener('click', () => setW('re'));
  document.getElementById('btn-w-abs').addEventListener('click', () => setW('abs'));
  document.getElementById('btn-l-auto').addEventListener('click', setL);
  document.getElementById('btn-s2p').addEventListener('click', () => {
    if (!last) return;
    const { s, p, res } = last;
    const comment = [`page: ${location.href}`, `inputs: ${JSON.stringify(s)}`];
    download(`${fileStem()}.s2p`, toTouchstone(res, p, comment), 'text/plain');
  });
  document.getElementById('btn-csv').addEventListener('click', () => {
    if (last) download(`${fileStem()}.csv`, toCSV(last.res), 'text/csv');
  });
  document.getElementById('btn-link').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(location.href); b.textContent = 'Link copied'; }
    catch { b.textContent = 'Copy failed'; }
    setTimeout(() => { b.textContent = 'Copy link'; }, 1500);
  });
  document.getElementById('euler').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
    catch { b.textContent = 'Copy failed'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    writeForm(defaults());
    update();
  });
  // A pasted link with new inputs (replaceState in toHash does not fire this event).
  window.addEventListener('hashchange', () => { writeForm(fromHash()); update(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerenderAll);
  update();
}

init();

// Exposed for console checks.
window.sawCalc = { get last() { return last; }, get substrate() { return subState; }, get sweep() { return sweepRows; }, csDatta };
