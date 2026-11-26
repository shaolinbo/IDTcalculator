// Thin-film stacks against published delay-line data (tests/data/*.json, each with its source
// and whether it is measured or simulated). Default constants: Andrushchak smp-1, rho = 4700.
// Electrodes are not modelled: the gaps of a delay line are bare LN, so group velocities
// compare directly; transducer centre frequencies carry the electrode mass as an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LN_ANDRUSHCHAK } from '../src/saw/constants.js';
import { crystal, solveOrientation } from '../src/saw/solver.js';
import { makeStructure, findModes } from '../src/saw/layered.js';
import { stackSAW, pickMode, pairShort } from '../src/saw/stack.js';
import { orientation } from '../src/materials.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));
const rel = (a, b) => Math.abs(a / b - 1);

/** Group velocity 2 pi df / dk of a stack mode at f (Hz), from phase velocities at f +- 1 %. */
function groupVelocity(orient, opt, f) {
  const df = 0.01 * f;
  const r = [f - df, f + df].map((ff) => stackSAW(orient, { ...opt, f0: ff }));
  assert.ok(r.every((q) => q.v0 > 0), 'mode found');
  return (2 * df) / ((f + df) / r[1].v0 - (f - df) / r[0].v0);
}

// ---------------------------------------------------------------------------
// Lu et al. 2021: A1 delay lines in a 490 nm Z-cut membrane.

const zcut = orientation('Zcut', { psi: 0 }).A;
const memb = (hl) => makeStructure({ layers: [{ material: LN_ANDRUSHCHAK, A: zcut, hl }], substrate: null });
/** A1 frequency (GHz) at wavelength lam (um): the slowest antisymmetric mode between 3.3 and 7.5 GHz. */
function a1(lam, bc) {
  const m = findModes(memb(0.49 / lam), bc, { vmin: 3.3e3 * lam, vmax: 7.5e3 * lam, N: 160 }).find((q) => q.sym === 'A');
  return m ? m.v / lam / 1e3 : NaN;
}
/** A1 curves k (1/um) vs f (GHz), open and shorted, sorted by f. */
const curves = (() => {
  const lams = Array.from({ length: 16 }, (_, i) => 1.5 + 0.2 * i);
  const c = (bc) => lams.map((lam) => ({ k: (2 * Math.PI) / lam, f: a1(lam, bc) })).sort((p, q) => p.f - q.f);
  return { open: c('open'), short: c('short') };
})();
const kAt = (c, f) => {
  for (let i = 1; i < c.length; i++) if (f >= c[i - 1].f && f <= c[i].f) return c[i - 1].k + ((c[i].k - c[i - 1].k) * (f - c[i - 1].f)) / (c[i].f - c[i - 1].f);
  return NaN;
};

test('A1 in a 490 nm Z-cut membrane vs the FEA of Lu et al. 2021 (simulated)', () => {
  const d = load('lu2021_a1_adl.json').simulated;
  // Shorted cutoff: A1 at a long wavelength (50 um) approaches it from above.
  const fcs = a1(50, 'short');
  assert.ok(rel(fcs, d.fc_short_GHz) < 0.01, `fc_short ${fcs.toFixed(3)} vs ${d.fc_short_GHz} GHz`);
  // Open A1 from 6.0 GHz at lambda = 1.5 um to 4.5 GHz at 6 um (rounded in the paper: 3 %).
  for (const [lam, f] of [[1.5, 6.0], [6, 4.5]]) {
    const fo = a1(lam, 'open');
    assert.ok(rel(fo, f) < 0.03, `open A1 at ${lam} um: ${fo.toFixed(3)} vs ${f} GHz`);
  }
});

test('A1 delay lines of Lu et al. 2021: centre frequency vs cell length (measured)', () => {
  const { rows } = load('lu2021_a1_adl.json').measured;
  const fmin = Math.max(curves.open[0].f, curves.short[0].f), fmax = Math.min(curves.open.at(-1).f, curves.short.at(-1).f);
  for (const [g, lam, f] of rows) {
    // Paper eq. 12 with 50 % duty: mean of open and shorted wavenumbers = 2 pi / Lambda.
    const err = (ff) => 0.5 * (kAt(curves.open, ff) + kAt(curves.short, ff)) - (2 * Math.PI) / lam;
    let lo = fmin, hi = fmax;
    assert.ok(err(lo) < 0 && err(hi) > 0, `group ${g}: bracket`);
    for (let i = 0; i < 50; i++) { const m = 0.5 * (lo + hi); if (err(m) > 0) hi = m; else lo = m; }
    const fc = 0.5 * (lo + hi);
    // Model within 1.2 % (bare film; 30 nm Al electrodes not included).
    assert.ok(rel(fc, f) < 0.02, `group ${g}, Lambda ${lam} um: ${fc.toFixed(3)} vs ${f} GHz`);
  }
});

test('A1 delay lines of Lu et al. 2021: group velocity in the gap (measured)', () => {
  const { rows } = load('lu2021_a1_adl.json').measured;
  for (const [g, , f, vg] of rows) {
    const df = 0.02;
    const v = ((2 * Math.PI * 2 * df) / (kAt(curves.open, f + df) - kAt(curves.open, f - df))) * 1e3;
    // Model within 10 % at all five groups; groups A and E (same Lambda) differ by 7 % between themselves.
    assert.ok(rel(v, vg) < 0.12, `group ${g} at ${f} GHz: ${v.toFixed(0)} vs ${vg} m/s`);
  }
});

// ---------------------------------------------------------------------------
// Manzaneque et al. 2019: SH0 in an 800 nm X-cut membrane, lambda0 = 20 um.

test('SH0 in an 800 nm X-cut membrane vs the FEM of Manzaneque et al. 2019 (simulated)', () => {
  const d = load('manzaneque2019_sh0_adl.json').simulated;
  const sh0 = (psi) => {
    const S = makeStructure({ layers: [{ material: LN_ANDRUSHCHAK, A: orientation('Xcut', { psi }).A, hl: 0.8 / 20 }], substrate: null });
    const mo = findModes(S, 'open', { vRef: 4500 }), o = pickMode(mo, 'SH', true);
    const s = pairShort(o, findModes(S, 'short', { vRef: 4500 }), true, mo);
    return { v0: o.v, vm: s.v, K2: (2 * (o.v - s.v)) / o.v };
  };
  const r = { [-20]: sh0(-20), [-10]: sh0(-10), 0: sh0(0), 10: sh0(10) };
  // Shorted velocity within 0.1 %. The open velocity is 3 % below the FEM value (4373 vs 4507
  // m/s here); see the README.
  assert.ok(rel(r[-10].vm, d.v_shorted_m_s) < 0.01, `vm ${r[-10].vm.toFixed(0)} vs ${d.v_shorted_m_s}`);
  // The paper chose -10 deg for the largest k2; of -20, -10, 0, +10 deg it is the largest here.
  const best = Object.entries(r).reduce((a, b) => (b[1].K2 > a[1].K2 ? b : a))[0];
  assert.equal(Number(best), -10, `largest K2 at ${best} deg`);
});

// ---------------------------------------------------------------------------
// Lin et al. 2026 (Mo Li group): group velocities at room temperature.

test('X-cut LNOI and 128°Y-X bulk vs Lin et al. 2026: Rayleigh group velocity (measured)', () => {
  const { rows } = load('lin2026_tfln_loss.json');
  const lnoi = rows.find((q) => q[0] === 'LNOI'), bulk = rows.find((q) => q[0] === 'bulk');
  // 300 nm X-cut LN on 2 um SiO2 on Si, along Y, 1.82-1.87 GHz: model within 0.2 %.
  const f = 0.5 * (lnoi[3][0] + lnoi[3][1]) * 1e9;
  const vg = groupVelocity(orientation('Xcut', { psi: 0 }), { stack: 'lnoi', hLN: 300e-9, hOx: 2e-6, mode: 'R' }, f);
  assert.ok(rel(vg, lnoi[4]) < 0.02, `LNOI vg ${vg.toFixed(0)} vs ${lnoi[4]} m/s`);
  // Bulk 128°Y-X: no dispersion, vg = v0; model within 1.1 %.
  const b = solveOrientation(crystal(LN_ANDRUSHCHAK), orientation('128Y').A, { pfa: false });
  assert.ok(rel(b.v0, bulk[4]) < 0.02, `bulk vg ${b.v0.toFixed(0)} vs ${bulk[4]} m/s`);
});
