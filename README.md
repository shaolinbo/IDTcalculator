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
- **Orientation view:** drag to rotate the chip; **Copy** gives the COMSOL Euler angles in COMSOL syntax.

## What is computed

| Output | Meaning |
|---|---|
| v₀, vₘ, K², ε∞, power-flow angle | Substrate values for the chosen cut and direction (partial-wave solver) |
| Angle sweep | v₀, vₘ, K², power-flow angle and Cs over 0–180° of the cut's angle family |
| Orientation view | 3D chip with the crystal axes X, Y, Z, the SAW direction and the power-flow direction |
| COMSOL Euler angles | Rotated System angles (Z-X-Z) for 3D and 2D models, and the crystal axes in the model axes |
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

The surface normal points out of the chip. Y-Z is (0°, −90°, −90°) on the +Y face and (0°, 90°, 90°) on the −Y face; opposite faces give the same SAW velocity and coupling.

**COMSOL Euler angles.** COMSOL's Rotated System (Euler angles, Z-X-Z, intrinsic) maps crystal-axis components to the model's global axes. The page gives (α, β, γ) for two model frames; select the Rotated System as the coordinate system of the piezoelectric material, whose data stay in crystal axes.

| Model | Global axes | 128°Y-X |
|---|---|---|
| 3D | x = SAW direction, z = surface normal (out of the chip), y = z × x | (0°, −38°, 0°) |
| 2D | x = SAW direction, y = surface normal (out of the chip), z = x × y | (0°, −128°, 0°) |

Both 128°Y-X values match COMSOL's application example *Euler Angle Rotation in Surface Acoustic Wave Modeling*. In this tool's (λ, μ, θ), the 3D angles are (α, β, γ) = (−θ, −μ, −λ).

**Method.** The substrate is a piezoelectric half-space; the device axes have x₁ along propagation and x₃ normal to the surface.

1. **Partial waves.** For a trial velocity v, the partial waves vary as exp(ik(x₁ + βx₃ − vt)). The Christoffel determinant gives a degree-8 polynomial in β, solved by the Aberth–Ehrlich method. The four roots with Im β < 0 decay into the substrate.
2. **Boundary conditions.**
   - Free surface: traction-free, with D₃ continuous to the vacuum field. This gives v₀.
   - Metallized surface: traction-free, with φ = 0. This gives vₘ.
   - The roots are where the boundary determinant vanishes. That determinant is divided by the eigenvector determinant, so that coalescing partial waves do not produce spurious roots.
   - Some orientations have a second root just below the bulk limit, for example a shear-horizontal wave that only metallization binds. The slowest root, the Rayleigh-type wave, is taken.
3. **Coupling.** K² = 2(v₀ − vₘ)/v₀.
4. **Capacitance.** ε∞ is the effective permittivity of the traction-free surface as v → 0. The tool uses it as Cs, the IDT capacitance per finger pair per unit aperture at metallization ratio 0.5.
5. **Power-flow angle.** tan(PFA) = (1/v₀) dv₀/dψ, with ψ the in-plane rotation about the surface normal.

**Constants.** Two LiNbO₃ sets are offered; the page selects one in the Substrate panel.

| Quantity | Default: Andrushchak et al. (2009), sample smp-1, ρ adjusted | Kushibiki et al. (1999) |
|---|---|---|
| c₁₁, c₁₂, c₁₃, c₁₄, c₃₃, c₄₄ at constant E (GPa) | 199.2, 54.7, 70, 7.9, 240, 59.9 | 198.86, 54.67, 67.99, 7.83, 234.18, 59.85 |
| e₁₅, e₂₂, e₃₁, e₃₃ (C/m²) | 3.67, 2.38, 0.34, 1.6 | 3.655, 2.407, 0.328, 1.894 |
| ε₁₁, ε₃₃ (ε₀) | 44, 27.9 | 44.9, 26.7 (clamped) |
| ρ (kg/m³) | 4700 | 4642.8 |

- **Default set:** elastic, piezoelectric and dielectric constants of sample smp-1 in Andrushchak et al. (2009), Table II and Sec. II. The density is 4700 kg/m³, an adjusted value that matches measured devices; the paper measured 4628 kg/m³.
- The paper gives c₁₃ = 70 ± 19 GPa and e₃₃ = 1.6 ± 0.9 C/m²; the other values are tighter. It does not say whether ε is at constant strain; the tool uses it as the clamped permittivity.
- **Kushibiki et al. (1999):** as tabulated in Kawada et al. (2025).
- Both papers fix the sign of c₁₄ by the IRE 1949 axes. The tool computes c₆₆ = (c₁₁ − c₁₂)/2, as trigonal symmetry requires.

**Results for the presets.**

| Orientation | Source | v₀ (m/s) | vₘ (m/s) | K² (%) | ε∞/ε₀ | Cs (pF/cm) |
|---|---|---|---|---|---|---|
| Y-Z | Solver, default set | 3477.6 | 3399.7 | 4.48 | 46.2 | 4.089 |
| Y-Z | Solver, Kushibiki | 3486.4 | 3412.7 | 4.23 | 46.1 | 4.078 |
| Y-Z | Datta (1986) | 3488 | 3408 | 4.6 | – | – |
| 128°Y-X | Solver, default set | 3963.0 | 3856.6 | 5.37 | 54.7 | 4.844 |
| 128°Y-X | Solver, Kushibiki | 3978.4 | 3870.7 | 5.41 | 55.3 | 4.894 |
| 128°Y-X | Datta (1986) | 3996 | 3884 | 5.6 | – | – |

For 128°Y-X, the clamped-permittivity estimate ε₀ + √(ε′₁₁ε′₃₃ − ε′₁₃²), which ignores piezoelectric stiffening, gives Cs = 3.53 pF/cm. The solver's ε∞ gives 4.84 pF/cm (default set) or 4.89 pF/cm (Kushibiki).

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

**Optimum aperture without tuning.** For a fixed Np, the conversion loss from a source of resistance R is lowest when |Z_IDT| = R. Choosing W for Re Z = R instead gives a smaller aperture. For 128°Y-X at 220 MHz with Np = 22, Cs = 3.61 pF/cm, K² = 5.5 % and R = 50 Ω, the two apertures are 832 µm (Re Z = R) and 992 µm (|Z| = R), and they give 6.89 dB and 6.82 dB (bare IDTs, single transit).

**Limits.**

- No electrode reflections, mass loading, velocity shift under the IDT, or dispersion with metal thickness.
- No diffraction. The beam walk-off from the power-flow angle is reported but not included in S21.
- Both IDTs share one aperture and one period. The metallization ratio is fixed at 0.5.

## Validation

Run `npm test` (or `node --test`); the tests use only Node's built-in runner.

**Device model.**

- Regression case, held to 1e-9: Z = 83.198 − j54.003 Ω and IL = 7.900 dB for 128°Y-X, f₀ = 220 MHz, Np = 22, W = 500 µm, Cs = 3.61 pF/cm, K² = 5.5 % and 50 Ω.
- The aperture formulas give Re Z = Z₀ and |Z| = Z₀ respectively, and the |Z| = Z₀ aperture is a loss minimum.
- Passivity (|S11|² + |S21|² ≤ 1) and reciprocity (S12 = S21) hold with all parasitics, tuning and the triple-transit echo on.
- Two bidirectional IDTs never beat 6.02 dB single-transit loss.
- The auto tuning L cancels each IDT's reactance.

**Substrate solver.**

- An isotropic half-space gives the Rayleigh velocity for Poisson ratio 1/4, v_R/v_t = √(2 − 2/√3), to 1e-9.
- With the piezoelectric constants set to zero, K² = 0 and ε∞ equals 1 + √(ε′₁₁ε′₃₃ − ε′₁₃²) exactly.
- With either constant set, Y-Z and 128°Y-X agree with Datta's table within 1 % in velocity and 10 % in K². With the Kushibiki set, ε∞ matches Morgan's 46 ε₀ (Y-Z) and 56 ε₀ (128°Y-X).
- Euler angles, the opposite face and reversed propagation give identical results.
- The Z-cut 3-fold and mirror symmetries hold. The power-flow angle is zero where mirror symmetry requires it, and it agrees with the slope of v₀(ψ).
- Regression tests cover the rotated Y-cuts where partial waves coalesce, and an X-cut range with a second metallized-surface root.

**Euler angles.**

- The COMSOL angles for 128°Y-X equal COMSOL's example values in 3D and 2D.
- For 200 random orientations, plus β = 0° and 180°, the COMSOL and (λ, μ, θ) angles rebuild the rotation matrix.

**Published data.** Data sets are JSON files in `tests/data/`, each with its source, whether it is measured or simulated, and its angle convention; `tests/published.test.mjs` compares them with the solver.

| Data set | Kind | Agreement |
|---|---|---|
| X-cut, −85° to 85° from Z (Shao et al. 2022, Extended Data Fig. 1) | Simulated | Default set: v₀ and vₘ within 1.3 m/s, k² within 0.09 percentage points, same slowest direction (30°) and k² zero (−40°) |

- The paper's angle θ from Z is the X-cut angle ψ = 90° + θ in this tool.
- The data were read from the vector paths of the published figure.

## Roadmap

| Phase | Content | Status |
|---|---|---|
| 1 | Impulse model, delay line, probe ports, pads, export | Done |
| 2 | Partial-wave solver for any cut and direction; angle sweep | Done |
| 3 | Coupling-of-modes (P-matrix) model: electrode reflection, mass loading, metal thickness, metallization ratio | Planned |
| 4 | Optimizer: Np, W, metallization ratio and tuning L for lowest loss or widest band, with constraints | Planned |
| 5 (optional) | Thin-film LiNbO₃ on SiO₂/Si or sapphire | Planned |

## References

- A. S. Andrushchak, B. G. Mytsyk, H. P. Laba, O. V. Yurkevych, I. M. Solskii, A. V. Kityk, B. Sahraoui, "Complete sets of elastic constants and photoelastic coefficients of pure and MgO-doped lithium niobate crystals at room temperature," *J. Appl. Phys.* 106, 073510 (2009).
- COMSOL, *Euler Angle Rotation in Surface Acoustic Wave Modeling*, Application Gallery 69281, <https://doc.comsol.com/6.4/doc/com.comsol.help.models.mems.saw_euler_angle_rotation/saw_euler_angle_rotation.html>.
- S. Datta, *Surface Acoustic Wave Devices*, Prentice-Hall, 1986.
- T. Kawada, M. Kawaguchi, H. Matsumoto, M. Hayashi, "Model calculations of the strains associated with surface acoustic waves," arXiv:2504.12752 (2025).
- J. Kushibiki, I. Takanaga, M. Arakawa, T. Sannomiya, "Accurate measurements of the acoustical physical constants of LiNbO₃ and LiTaO₃ single crystals," *IEEE Trans. Ultrason. Ferroelectr. Freq. Control* 46, 1315–1323 (1999).
- D. Morgan, *Surface Acoustic Wave Devices*, 2nd ed., Academic Press, 2007.
- L. Shao, D. Zhu, M. Colangelo, D. Lee, N. Sinclair, Y. Hu, P. T. Rakich, K. Lai, K. K. Berggren, M. Lončar, "Electrical control of surface acoustic waves," *Nat. Electron.* 5, 348–355 (2022).

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
| `src/saw/euler.js` | COMSOL and (λ, μ, θ) Euler angles of an orientation |
| `src/view3d.js` | 3D chip and axes view (Plotly) |
| `src/saw/worker.js` | Web Worker for angle sweeps |
| `src/pads.js` | Pad-capacitance estimate |
| `src/complex.js` | Complex arithmetic |
| `tests/` | Node tests |

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
