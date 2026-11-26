# SAW IDT calculator

A browser tool for surface-acoustic-wave interdigital transducers (IDTs) on lithium niobate. It computes the IDT impedance and the S-parameters of a two-IDT delay line between 50 Ω probe ports, including pads, leads, finger resistance and optional tuning inductors. Everything runs in the browser; there is no server.

**Status: Phase 1 (v0.1).** Impulse model, Y-Z and 128°Y-X presets, Cs estimate for any cut. See [Roadmap](#roadmap).

## Use

- **Online:** enable GitHub Pages for this repository (Settings → Pages → Deploy from branch, `main`, `/ (root)`), then open the Pages URL.
- **Locally:** ES modules need an HTTP server, so `index.html` cannot be opened as a file.

  ```
  python -m http.server 8765
  ```

  then open <http://localhost:8765>.

Inputs live in the left panel. Every change updates the plots and the page URL, so **Copy link** shares the exact design. **Download .s2p** writes a Touchstone file referenced to Z₀ at the probe tips, for direct comparison with calibrated VNA data. **Download CSV** writes S-parameters, port impedances and IDT admittance.

## What is computed

| Output | Meaning |
|---|---|
| S11, S21, S22 | At the probe tips, both ports referenced to Z₀ |
| Insertion loss at f₀ | −S21 at f₀; also the single-transit value (no triple-transit echo) |
| Peak S21, 3-dB bandwidth | From the S21 trace |
| Z at probe, port 1 | Includes pads, leads, finger resistance and loading by IDT 2 |
| Bare IDT 1 | 1/(Ga + jBa + jωCt) of IDT 1 alone |
| Group delay | −dφ/dω of S21 |
| Finger-pair sweep | IL at f₀ and 3-dB bandwidth vs Np, for the current W and for the W that gives \|Z\| = Z₀ |
| Design aids | W for Re Z = Z₀, W for \|Z\| = Z₀, Np for widest band √(π/4K²), tuning L that cancels the reactance at f₀ |

## Model

**IDT (impulse model).** Uniform single-electrode IDT, metallization ratio 0.5:

- x = Np π (f − f₀)/f₀
- Ga = Ga₀ (sin x / x)², with Ga₀ = 8 K² Cs W f₀ Np²
- Ba = Ga₀ (sin 2x − 2x)/(2x²)
- Ct = Np Cs W

Here Cs is the capacitance per finger pair per unit aperture length. The tool expects pF/cm.

**Delay line.** The two IDTs share the aperture and period. Their acoustic transfer admittance is −√(Ga₀₁Ga₀₂)·sinc(x₁)·sinc(x₂)·e^(−jωτ), where τ is the centre-to-centre delay; an optional propagation loss is applied over the same distance. The exact Y→S conversion includes regeneration, and with it the triple-transit echo; a switch turns it off.

**Ports.** At each port the chain is: probe (Z₀) → tuning L (optional) → pad (shunt Cpad) → lead (R, L) → finger resistance → IDT. A feedthrough capacitance Cft joins the two pad nodes.

- **Finger resistance:** (2/3)ρW/(a h Np), with finger width a = λ/4.
- **Pad capacitance:** a coplanar-waveguide estimate, 2·Cs·K(k)/K(k′)·L with k = s/(s + 2g).

**Optimum aperture without tuning.** For a fixed Np, the conversion loss from a source of resistance R is lowest when |Z_IDT| = R. The 2024 notebook's W(N) formula gives Re Z = R instead. For the notebook design (Np = 22), the two apertures are 832 µm and 992 µm and give 6.89 dB and 6.82 dB (bare IDTs, single transit).

## Substrate data

| Cut | v₀ (m/s) | vₘ (m/s) | K² (%) | Source |
|---|---|---|---|---|
| Y-Z LiNbO₃ | 3488 | 3408 | 4.6 | Datta (1986), via Kawada et al. (2025), Table 5 |
| 128°Y-X LiNbO₃ | 3996 | 3884 | 5.6 | Same |

Here v₀ is the free-surface velocity, vₘ the metallized velocity, and K² = 2(v₀ − vₘ)/v₀.

**Cs estimate.** Cs = ε₀ + √(ε′₁₁ε′₃₃ − ε′₁₃²), in axes where x₁ is the propagation direction and x₃ the surface normal (Datta's formula, as given in Kawada et al. 2025, Eq. 35). The tool uses the clamped LiNbO₃ permittivity ε₁₁ = 44.9 ε₀, ε₃₃ = 26.7 ε₀ (Kushibiki et al. 1999), which gives:

| Orientation | Cs (pF/cm) |
|---|---|
| 128°Y-X | 3.528 |
| Y-Z | 3.154 |

The 2024 notebook used 3.61 pF/cm for 128°Y-X. The exact effective permittivity ε∞ needs the partial-wave solution (Phase 2). Until then, treat Cs as an estimate and enter your own value if you have one.

X-, Y- and Z-cut at a free in-plane angle ψ get the Cs estimate only. Enter v and K² for these until the Phase 2 solver computes them.

References:

- S. Datta, *Surface Acoustic Wave Devices*, Prentice-Hall, 1986.
- T. Kawada, M. Kawaguchi, H. Matsumoto, M. Hayashi, "Model calculations of the strains associated with surface acoustic waves," arXiv:2504.12752 (2025).
- J. Kushibiki, I. Takanaga, M. Arakawa, T. Sannomiya, "Accurate measurements of the acoustical physical constants of LiNbO₃ and LiTaO₃ single crystals," *IEEE Trans. Ultrason. Ferroelectr. Freq. Control* 46, 1315–1323 (1999).
- D. Morgan, *Surface Acoustic Wave Devices*, 2nd ed., Academic Press, 2007 (impulse model).

## Limits of Phase 1

- No electrode reflections, mass loading, velocity shift under the IDT, or dispersion with metal thickness.
- No diffraction or beam steering, and no bulk-wave or leaky-wave loss.
- Both IDTs share one aperture and one period. The metallization ratio is fixed at 0.5.
- Rayleigh waves only. Leaky-wave cuts (e.g. 41°, 64° Y-X) are not modelled.

## Validation

Run `npm test` (or `node --test`); the tests use only Node's built-in runner.

- Reproduces the 2024 Mathematica notebook (`calculatuonOfImpedance20240819.nb`) to 1e-9: Z = 83.198 − j54.003 Ω and IL = 7.900 dB, for 128°Y-X, f₀ = 220 MHz, Np = 22, W = 500 µm, Cs = 3.61 pF/cm, K² = 5.5 %, 50 Ω.
- The aperture formulas give Re Z = Z₀ and |Z| = Z₀ respectively, and the |Z| = Z₀ aperture is a loss minimum.
- Passivity (|S11|² + |S21|² ≤ 1) and reciprocity (S12 = S21) hold with all parasitics, tuning and the triple-transit echo on.
- Two bidirectional IDTs never beat 6.02 dB single-transit loss.
- The auto tuning L cancels the reactance of each IDT.
- Elliptic integral, Cs estimates, 3-dB band finder and Touchstone format are checked.

## Roadmap

| Phase | Content |
|---|---|
| 2 | Partial-wave (Stroh) solver: v₀, vₘ, K², ε∞ and power-flow angle for any cut and direction; angle sweep |
| 3 | Coupling-of-modes (P-matrix) model: electrode reflection, mass loading, metal thickness, metallization ratio |
| 4 | Optimizer: Np, W, metallization ratio and tuning L for lowest loss or widest band, with constraints |
| 5 (optional) | Thin-film LiNbO₃ on SiO₂/Si or sapphire |

## Files

| Path | Content |
|---|---|
| `index.html`, `css/style.css` | Page |
| `src/ui.js` | Form, URL state, plots (Plotly), export |
| `src/model.js` | Delay-line model, sweeps, Touchstone and CSV export |
| `src/impulse.js` | IDT impulse model, aperture formulas, finger resistance |
| `src/network.js` | Two-port Y/Z/S helpers |
| `src/materials.js` | LiNbO₃ presets, orientation vectors, Cs estimate |
| `src/pads.js` | Pad-capacitance estimate |
| `src/complex.js` | Complex arithmetic |
| `tests/` | Node tests |
