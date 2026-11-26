# SAW IDT calculator

A browser tool for surface-acoustic-wave interdigital transducers (IDTs) on lithium niobate. For any crystal cut and propagation direction it computes the SAW velocity, the coupling K², the IDT capacitance and the power-flow angle, then gives the IDT impedance and the S-parameters of a two-IDT delay line between 50 Ω probe ports. Pads, leads, finger resistance and optional tuning inductors are included. Everything runs in the browser; there is no server.

**Live: <https://shaolinbo.github.io/IDTcalculator/>**

**Status: v0.2.** Partial-wave substrate solver (Rayleigh-type SAW only; no leaky or pseudo-SAW) and impulse IDT model. See [Roadmap](#roadmap).

## Use

- **Online:** open <https://shaolinbo.github.io/IDTcalculator/>. It is served by GitHub Pages from the `main` branch, so each push updates it.
- **Locally:** ES modules need an HTTP server, so `index.html` cannot be opened as a file.

  ```
  python -m http.server 8765
  ```

  then open <http://localhost:8765>.

Inputs live in the left panel. Every change updates the plots and the page URL, so **Copy link** shares the exact design.

- **Download .s2p** writes a Touchstone file referenced to Z₀ at the probe tips, for direct comparison with calibrated VNA data.
- **Download CSV** writes S-parameters, port impedances and IDT admittance.
- **Angle-sweep charts:** click a point to move to that orientation.

## What is computed

| Output | Meaning |
|---|---|
| v₀, vₘ, K², ε∞, power-flow angle | Substrate values for the chosen cut and direction (partial-wave solver) |
| Angle sweep | v₀, vₘ, K², power-flow angle and Cs over 0–180° of the cut's angle family |
| S11, S21, S22 | At the probe tips, both ports referenced to Z₀ |
| Insertion loss at f₀ | −S21 at f₀; also the single-transit value (no triple-transit echo) |
| Peak S21, 3-dB bandwidth | From the S21 trace |
| Z at probe, port 1 | Includes pads, leads, finger resistance and loading by IDT 2 |
| Bare IDT 1 | 1/(Ga + jBa + jωCt) of IDT 1 alone |
| Group delay | −dφ/dω of S21 |
| Finger-pair sweep | IL at f₀ and 3-dB bandwidth vs Np, for the current W and for the W that gives \|Z\| = Z₀ |
| Design aids | W for Re Z = Z₀, W for \|Z\| = Z₀, Np for widest band √(π/4K²), tuning L that cancels the reactance at f₀, beam walk-off over the delay path |

## Substrate: partial-wave solver

**Orientations.**

| Choice | Definition |
|---|---|
| 128°Y-X, Y-Z | Presets |
| Rotated Y-cut, X-propagating | Rotation θ |
| X-cut | ψ measured from Y toward Z |
| Y-cut | ψ measured from X toward Z |
| Z-cut | ψ measured from X toward Y |
| Euler angles (λ, μ, θ) | ZXZ convention; 128°Y-X = (0°, 38°, 0°) |

**Method.** The substrate is a piezoelectric half-space; the device axes have x₁ along propagation and x₃ normal to the surface.

1. **Partial waves.** For a trial velocity v, the partial waves vary as exp(ik(x₁ + βx₃ − vt)). The Christoffel determinant gives a degree-8 polynomial in β, solved by the Aberth–Ehrlich method. The four roots with Im β < 0 decay into the substrate.
2. **Boundary conditions.**
   - Free surface: traction-free, with D₃ continuous to the vacuum field. This gives v₀.
   - Metallized surface: traction-free, with φ = 0. This gives vₘ.
   - The roots are where the boundary determinant vanishes. That determinant is divided by the eigenvector determinant, so that coalescing partial waves do not produce spurious roots.
3. **Coupling.** K² = 2(v₀ − vₘ)/v₀.
4. **Capacitance.** ε∞ is the effective permittivity of the traction-free surface as v → 0. The tool uses it as Cs, the IDT capacitance per finger pair per unit aperture at metallization ratio 0.5.
5. **Power-flow angle.** tan(PFA) = (1/v₀) dv₀/dψ, with ψ the in-plane rotation about the surface normal.

**Constants.** LiNbO₃ constants are from Kushibiki et al. (1999), as tabulated in Kawada et al. (2025):

| Quantity | Values |
|---|---|
| Elastic stiffness at constant E (10¹¹ N/m²) | c₁₁ = 1.9886, c₁₂ = 0.5467, c₁₃ = 0.6799, c₁₄ = 0.0783, c₃₃ = 2.3418, c₄₄ = 0.5985 |
| Piezoelectric (C/m²) | e₁₅ = 3.655, e₂₂ = 2.407, e₃₁ = 0.328, e₃₃ = 1.894 |
| Clamped permittivity | ε₁₁ = 44.9 ε₀, ε₃₃ = 26.7 ε₀ |
| Density | ρ = 4642.8 kg/m³ |

The tool computes c₆₆ = (c₁₁ − c₁₂)/2, as trigonal symmetry requires.

**Results for the presets.**

| Orientation | Source | v₀ (m/s) | vₘ (m/s) | K² (%) | ε∞/ε₀ | Cs (pF/cm) |
|---|---|---|---|---|---|---|
| Y-Z | This solver | 3486.4 | 3412.7 | 4.23 | 46.1 | 4.078 |
| Y-Z | Datta (1986) | 3488 | 3408 | 4.6 | – | – |
| 128°Y-X | This solver | 3978.4 | 3870.7 | 5.41 | 55.3 | 4.894 |
| 128°Y-X | Datta (1986) | 3996 | 3884 | 5.6 | – | – |

The 2024 notebook used Cs = 3.61 pF/cm for 128°Y-X. That value is close to the clamped-permittivity estimate ε₀ + √(ε′₁₁ε′₃₃ − ε′₁₃²) = 3.53 pF/cm, which ignores piezoelectric stiffening. The solver's ε∞ gives 4.89 pF/cm.

In **manual** mode, v, K² and Cs are typed in and the solver values are shown for reference.

**Limits.**

- Rayleigh-type waves only. Leaky and pseudo-SAW are not modelled: on 41° and 64° Y-X, for example, the strongly coupled wave is a leaky shear wave and the solver shows only the weak Rayleigh wave.
- Orientations with no SAW below the slowest bulk-wave velocity are flagged.

## IDT and delay-line model

**IDT (impulse model).** Uniform single-electrode IDT, metallization ratio 0.5:

- x = Np π (f − f₀)/f₀
- Ga = Ga₀ (sin x / x)², with Ga₀ = 8 K² Cs W f₀ Np²
- Ba = Ga₀ (sin 2x − 2x)/(2x²)
- Ct = Np Cs W

**Delay line.** The two IDTs share the aperture and period. Their acoustic transfer admittance is −√(Ga₀₁Ga₀₂)·sinc(x₁)·sinc(x₂)·e^(−jωτ), where τ is the centre-to-centre delay. An optional propagation loss is applied over the same distance. The exact Y→S conversion includes regeneration, and with it the triple-transit echo; a switch turns it off.

**Ports.** At each port the chain is: probe (Z₀) → tuning L (optional) → pad (shunt Cpad) → lead (R, L) → finger resistance → IDT. A feedthrough capacitance Cft joins the two pad nodes.

- **Finger resistance:** (2/3)ρW/(a h Np), with finger width a = λ/4.
- **Pad capacitance:** a coplanar-waveguide estimate, 2·Cs·K(k)/K(k′)·L with k = s/(s + 2g).

**Optimum aperture without tuning.** For a fixed Np, the conversion loss from a source of resistance R is lowest when |Z_IDT| = R. The 2024 notebook's W(N) formula gives Re Z = R instead. With the notebook's inputs (Np = 22), the two apertures are 832 µm and 992 µm, and they give 6.89 dB and 6.82 dB (bare IDTs, single transit).

**Limits.**

- No electrode reflections, mass loading, velocity shift under the IDT, or dispersion with metal thickness.
- No diffraction. The beam walk-off from the power-flow angle is reported but not included in S21.
- Both IDTs share one aperture and one period. The metallization ratio is fixed at 0.5.

## Validation

Run `npm test` (or `node --test`); the tests use only Node's built-in runner.

**Device model.**

- Reproduces the 2024 Mathematica notebook (`calculatuonOfImpedance20240819.nb`) to 1e-9: Z = 83.198 − j54.003 Ω and IL = 7.900 dB, for 128°Y-X, f₀ = 220 MHz, Np = 22, W = 500 µm, Cs = 3.61 pF/cm, K² = 5.5 %, 50 Ω.
- The aperture formulas give Re Z = Z₀ and |Z| = Z₀ respectively, and the |Z| = Z₀ aperture is a loss minimum.
- Passivity (|S11|² + |S21|² ≤ 1) and reciprocity (S12 = S21) hold with all parasitics, tuning and the triple-transit echo on.
- Two bidirectional IDTs never beat 6.02 dB single-transit loss.
- The auto tuning L cancels each IDT's reactance.

**Substrate solver.**

- An isotropic half-space gives the Rayleigh velocity for Poisson ratio 1/4, v_R/v_t = √(2 − 2/√3), to 1e-9.
- With the piezoelectric constants set to zero, K² = 0 and ε∞ equals 1 + √(ε′₁₁ε′₃₃ − ε′₁₃²) exactly.
- Y-Z and 128°Y-X agree with Datta's table within the spread between constant sets: 0.5 % in velocity, 10 % in K². ε∞ matches Morgan's 46 ε₀ (Y-Z) and 56 ε₀ (128°Y-X).
- Euler angles, the opposite face and reversed propagation give identical results.
- The Z-cut 3-fold and mirror symmetries hold. The power-flow angle is zero where mirror symmetry requires it, and it agrees with the slope of v₀(ψ).
- A regression test covers the rotated Y-cuts where partial waves coalesce.

## Roadmap

| Phase | Content | Status |
|---|---|---|
| 1 | Impulse model, delay line, probe ports, pads, export | Done |
| 2 | Partial-wave solver for any cut and direction; angle sweep | Done |
| 3 | Coupling-of-modes (P-matrix) model: electrode reflection, mass loading, metal thickness, metallization ratio | Planned |
| 4 | Optimizer: Np, W, metallization ratio and tuning L for lowest loss or widest band, with constraints | Planned |
| 5 (optional) | Thin-film LiNbO₃ on SiO₂/Si or sapphire | Planned |

## References

- S. Datta, *Surface Acoustic Wave Devices*, Prentice-Hall, 1986.
- T. Kawada, M. Kawaguchi, H. Matsumoto, M. Hayashi, "Model calculations of the strains associated with surface acoustic waves," arXiv:2504.12752 (2025).
- J. Kushibiki, I. Takanaga, M. Arakawa, T. Sannomiya, "Accurate measurements of the acoustical physical constants of LiNbO₃ and LiTaO₃ single crystals," *IEEE Trans. Ultrason. Ferroelectr. Freq. Control* 46, 1315–1323 (1999).
- D. Morgan, *Surface Acoustic Wave Devices*, 2nd ed., Academic Press, 2007.

## Files

| Path | Content |
|---|---|
| `index.html`, `css/style.css` | Page |
| `src/ui.js` | Form, URL state, plots (Plotly), export |
| `src/model.js` | Delay-line model, sweeps, Touchstone and CSV export |
| `src/impulse.js` | IDT impulse model, aperture formulas, finger resistance |
| `src/network.js` | Two-port Y/Z/S helpers |
| `src/materials.js` | Cut definitions, presets, clamped-ε Cs estimate |
| `src/saw/constants.js` | LiNbO₃ material constants |
| `src/saw/tensor.js` | Tensors, rotations, Euler angles |
| `src/saw/solver.js` | Partial-wave solver |
| `src/saw/substrate.js` | Cached solver calls and angle sweeps |
| `src/saw/worker.js` | Web Worker for angle sweeps |
| `src/pads.js` | Pad-capacitance estimate |
| `src/complex.js` | Complex arithmetic |
| `tests/` | Node tests |

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
