# SAW IDT calculator

A browser tool for surface-acoustic-wave interdigital transducers (IDTs) on lithium niobate. For any crystal cut and propagation direction it computes the SAW velocity, the coupling K², the IDT capacitance and the power-flow angle, then gives the IDT impedance and the S-parameters of a two-IDT delay line between 50 Ω probe ports. Pads, leads, finger resistance and optional tuning inductors are included. Everything runs in the browser; there is no server.

**Live: <https://shaolinbo.github.io/IDTcalculator/>**

**Status: v0.3.** Partial-wave substrate solver (Rayleigh-type SAW only; no leaky or pseudo-SAW), impulse and coupling-of-modes IDT models, and a periodic-grating finite-element calculation of electrode reflection. See [Roadmap](#roadmap).

Developed by Linbo Shao with Claude (Anthropic). Provided as is, without warranty; see [Disclaimer](#disclaimer).

## Use

- **Online:** open <https://shaolinbo.github.io/IDTcalculator/>. It is served by GitHub Pages from the `main` branch, so each push updates it.
- **Locally:** ES modules need an HTTP server, so `index.html` cannot be opened as a file. Run

  ```
  npm start
  ```

  (or `node scripts/serve.mjs`) and open <http://localhost:8765>. This server turns browser caching off, so a normal refresh loads the current files. Other static servers, such as `python -m http.server`, let the browser reuse old modules after an edit.
- **After editing** any file under `src/`, `css/` or `index.html`, run `npm run stamp`. It appends a content hash (`?v=…`) to every module and stylesheet URL, so browsers and the GitHub Pages cache (10 minutes) cannot mix old and new files. `npm test` fails while the stamps are out of date.

Inputs live in the left panel. Every change updates the plots and the page URL, so **Copy link** shares the exact design.

- **Download .s2p** writes a Touchstone file referenced to Z₀ at the probe tips, for direct comparison with calibrated VNA data.
- **Download CSV** writes S-parameters, port impedances and IDT admittance.
- **Angle-sweep charts:** click a point to move to that orientation.
- **Orientation view:** drag to rotate the chip; **Copy** gives the COMSOL Euler angles in COMSOL syntax.
- **Charts:** drag an axis end (marked ▸ and ▴) to stretch that axis, the middle of an axis to shift it, or a box in the plot to zoom; double-click resets. **Show data points on curves** (Sweep panel) marks every computed point, to check the frequency resolution.
- **Result cards:** hover or focus a card for what its number means.

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
| Zero-to-zero bandwidth | Between the first transmission nulls on each side of the passband, from the S21 trace (one-step resolution); compared with 2f₀/N, N the larger Np |
| Electrode pitch | p = λ/2, λ = v_IDT/f₀ the wavelength under the IDTs; finger width λ/4 |
| Electrode mass loading | With **Include electrode mass**: velocity under a continuous metal film and under the IDTs, and its chart against h/λ |
| Thin film | Guided modes, v₀, vₘ, K² and Cs of LN on SiO₂/Si, LN on sapphire or a suspended LN membrane; dispersion charts |
| IDT model | Impulse (no reflection) or coupling of modes (COM) with an entered reflection coefficient per electrode; COM adds the grating stopband to Details |
| Z at probe, port 1 | Includes pads, leads, finger resistance and loading by IDT 2 |
| Bare IDT 1 | 1/(Ga + jBa + jωCt) of IDT 1 alone |
| Group delay | −dφ/dω of S21; blank across transmission zeros (phase step > 90° between points) and where \|S21\| is more than 40 dB below its peak |
| Finger-pair sweep | IL at f₀ and 3-dB bandwidth vs Np, for the current W and for the W that gives \|Z\| = Z₀ |
| Design aids | W for Re Z = Z₀, W for \|Z\| = Z₀, Np for widest band √(π/4K²), tuning L that cancels the reactance at f₀, beam walk-off over the delay path |

## Substrate: partial-wave solver

**Orientations.**

| Choice | Definition |
|---|---|
| 128°Y | Propagation angle φ from X; φ = 0 is 128°Y-X |
| Y-Z | Preset: Y-cut, Z propagation |
| Rotated Y-cut | Rotation θ of the normal from Y toward Z, and φ from X |
| X-cut | φ measured from Y toward Z |
| Y-cut | φ measured from X toward Z |
| Z-cut | φ measured from X toward Y |
| Euler angles (λ, μ, θ) | ZXZ convention; 128°Y-X = (0°, 38°, 0°) |

On 128°Y and rotated Y-cuts, φ is positive counter-clockwise about the outward surface normal, so 128°Y at angle φ is the Euler set (0°, 38°, φ), and a rotated Y-cut θ is (0°, θ − 90°, φ). Published values (Datta) are shown only at φ = 0.

The surface normal points out of the chip. Y-Z is (0°, −90°, −90°) on the +Y face and (0°, 90°, 90°) on the −Y face; opposite faces give the same SAW velocity and coupling.

**COMSOL Euler angles.** COMSOL's Rotated System (Euler angles, Z-X-Z, intrinsic) maps crystal-axis components to the model's global axes. The page gives (α, β, γ) for two model frames; select the Rotated System as the coordinate system of the piezoelectric material, whose data stay in crystal axes.

| Model | Global axes | 128°Y-X (128°Y, φ = 0) |
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
5. **Power-flow angle.** tan(PFA) = (1/v₀) dv₀/dφ, with φ the in-plane rotation of the propagation direction about the surface normal.

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

## Thin-film LiNbO₃ (Phase 5)

**Structures.** Selected with **Structure**; the LN film takes the cut and direction above.

| Structure | Layers (top to bottom) | Substrate orientation |
|---|---|---|
| LN / SiO₂ / Si (LNOI) | LN, SiO₂, Si half-space | Si(100); the SAW at the substrate angle from Si [110] |
| LN on sapphire | LN, sapphire half-space | c-plane; the SAW at the substrate angle from the a-axis |
| Suspended LN membrane | LN, free on both faces | – |

The substrate angle is set at φ = 0; on cuts with a propagation angle φ, the SAW direction in the substrate turns with φ.

**Method.**

1. **Layers.** Each layer carries the state (u, φ, T₃ⱼ, D₃), continuous across interfaces; across a layer it propagates with exp(iN·kh), N the 8×8 Stroh matrix of the layer material (piezoelectric or dielectric).
2. **Stability.** The surface impedance Z (traction and D₃ in terms of u and φ) is carried upward through sublayers with kh ≤ 0.4, which stays well conditioned for thick films.
3. **Boundaries.** Below: the substrate's four decaying partial waves, or for a membrane a traction-free bottom face with vacuum below. At the top: traction-free, and open (vacuum above) or shorted.
4. **Modes.** All guided modes below the substrate's slowest bulk wave (faster modes leak) are found from the boundary determinant. Each is classified by its surface displacement: shear-horizontal when u₂ dominates, otherwise Rayleigh-type; in a membrane also A (flexural) or S by the symmetry of u₃ on the two faces.
5. **Device values.** **Guided mode** picks the slowest Rayleigh-type mode (A0 in a membrane), the slowest shear-horizontal mode (SH0), or S0 (membranes). v₀ is its open-surface velocity; vₘ the shorted velocity of the same branch (same family, at or just below v₀, mutually nearest), K² = 2(v₀ − vₘ)/v₀, and Cs = ε∞ε₀ from the top-surface effective permittivity at this wavelength. h/λ is solved together with λ = v₀/f₀.
6. **Dispersion.** The page plots every guided mode and the K² of the slowest mode of each type against h_LN/λ from 1 % to 200 % (SiO₂ thickness scaled at the current ratio).

**Materials** (room temperature; no piezoelectricity):

| Material | Constants | Source |
|---|---|---|
| Si | c₁₁ = 165.64, c₁₂ = 63.94, c₄₄ = 79.51 GPa; ρ = 2329.0 kg/m³; εr = 11.7 | J. J. Hall, Phys. Rev. 161, 756 (1967), as given in EMIS Datareviews 20 (1997); density I. Henins, J. Res. NBS 68A, 529 (1964); εr Dunlap & Watters (1953) via Young & Frederikse, J. Phys. Chem. Ref. Data 2, 313 (1973) |
| Sapphire | c₁₁ = 496.8, c₁₂ = 163.6, c₁₃ = 110.9, c₁₄ = −23.5, c₃₃ = 498.1, c₄₄ = 147.4 GPa; ρ = 3986 kg/m³; ε⊥ = 9.395, ε∥ = 11.589 | J. B. Wachtman et al., J. Res. NBS 64A, 213 (1960), with their axes; permittivity Fontanella et al., J. Appl. Phys. 45, 2852 (1974) |
| SiO₂ | E = 72.7 GPa, ν = 0.16, ρ = 2201 kg/m³; εr = 3.87 | Corning HPFS 7980 fused silica; εr Jungwirth et al., Appl. Phys. Lett. 124 (2024) |

- **Sapphire c₁₄:** later work reports +22 to +23 GPa in another axis convention. On c-plane sapphire that is equivalent to turning the substrate angle by 180°.
- **Oxide:** thermal oxide films can be denser than fused silica (2284 kg/m³ in Beghi et al., Rev. Sci. Instrum. 82, 053107, 2011).
- **Silicon:** treated as a dielectric (high-resistivity Si); a conductive substrate would act as a ground plane.

**Examples** (f₀ = 1 GHz, default LN constants):

| Design | Mode | v₀ (m/s) | K² (%) |
|---|---|---|---|
| 128°Y, 600 nm LN on 2 µm SiO₂ / Si | Rayleigh-type | 3193.6 | 4.33 |
| 128°Y, 600 nm LN on sapphire | Rayleigh-type | 5103.5 | 0.99 |
| X-cut, 30° from Z, 300 nm membrane | S0 | 6770.6 | 4.96 |

**Limits.** Electrode mass loading and the periodic-grating FEM assume a bulk substrate and are off for thin-film stacks (COM with an entered r_s still works). No leaky modes; no electrode or substrate losses; layers are ideal and bonded.

## IDT and delay-line model

**IDT (impulse model).** Uniform single-electrode IDT, metallization ratio 0.5:

- x = Np π (f − f₀)/f₀
- Ga = Ga₀ (sin x / x)², with Ga₀ = 8 K² Cs W f₀ Np²
- Ba = Ga₀ (sin 2x − 2x)/(2x²)
- Ct = Np Cs W

**Delay line.** The two IDTs share the aperture and period. Their acoustic transfer admittance is −√(Ga₀₁Ga₀₂)·sinc(x₁)·sinc(x₂)·e^(−jωτ), where τ is the centre-to-centre delay: τ = gap/v₀ + (Np₁ + Np₂)/(2f₀). An optional propagation loss is applied over the same distance. The exact Y→S conversion includes regeneration, and with it the triple-transit echo; a switch turns it off.

**Ports.** At each port the chain is: probe (Z₀) → tuning L (optional) → pad (shunt Cpad) → lead (R, L) → finger resistance → IDT. A feedthrough capacitance Cft joins the two pad nodes.

- **Finger resistance:** (2/3)ρW/(a h Np), with finger width a = λ/4.
- **Pad capacitance:** a coplanar-waveguide estimate, 2·Cs·K(k)/K(k′)·L with k = s/(s + 2g).

**Coupling-of-modes (COM) model.** Selected with **IDT model**. With e^{jωt}, amplitudes R and S of the waves in +x and −x (acoustic power |R|²/2), voltage V and collected current I:

- dR/dx = −jδR + jκS + jαV
- dS/dx = −jκR + jδS − jαV
- dI/dx = −2jαR − 2jαS + jωCV

δ = ω/v_IDT − 2π/λ − jγ (γ from the propagation loss), κ = r_s/p with r_s the reflection coefficient of one electrode and p the electrode pitch, C = CsW/λ. Energy balance gives Ga₀ = 2α²L², so α² = 4K²CsWf₀/λ² reproduces the impulse model. α and κ are real: transduction and reflection centres lie at the electrode centres.

- **P-matrix.** Over a uniform IDT the coefficients are constant, so the transfer from x = 0 to L = Np·λ is closed-form in s² = δ² − κ², with power series where |sL| is small. It gives [b₁, b₂, I] = P [a₁, a₂, V].
- **Delay line.** The two P-matrices are joined across the gap at the free-surface velocity, including multiple reflections between the IDTs; the single-transit switch drops them. IDT 2's polarity is set so that with r_s = 0 the delay line equals the impulse model.
- **Stopband.** A long grating reflects in f₀(1 ± |r_s|/π). With this sign convention the lower edge couples to the IDT when r_s < 0, the upper edge when r_s > 0.
- **Where r_s comes from.** By default (**COM parameters: Computed**) a periodic-grating finite-element calculation gives r_s and the velocity under the IDTs (see [Periodic-grating FEM](#periodic-grating-fem)). With **Entered**, take them from the stopband edges f₋ < f₊ of a shorted grating with pitch p, for example a COMSOL periodic unit cell: |r_s| = π(f₊ − f₋)/(f₊ + f₋), and the velocity under the IDTs is p(f₊ + f₋) (enter it as Δv/v₀). The sign follows from which edge moves when the grating is opened.
- **Cost.** About 23 ms for a 2001-point sweep and 0.2 s for the finger-pair sweep.
- **Limits.** Metallization ratio fixed at 0.5; no end effects at the IDT edges; uniform IDTs only.

### Periodic-grating FEM

**Method.** A finite-element model of one electrode period, like a COMSOL periodic unit cell, at the Bragg condition.

1. **Cell.** One period p wide. Piezoelectric substrate (rotated constants) to a depth of 4λ, clamped and grounded at the bottom; one rectangular metal strip, width ηp (η = 0.5) and thickness h, centred; vacuum above to 2λ, with φ = 0 at the top. Fields do not depend on x₂ (infinite aperture), so each node carries u₁, u₂, u₃ and φ.
2. **Boundary conditions.** The sides are anti-periodic, f(x + p) = −f(x), so the wavenumber is π/p. The strip is an isotropic elastic conductor: φ = 0 on it (shorted grating) or one floating potential with zero net charge (open grating).
3. **Elements and solver.** Quadratic 9-node elements, graded toward the strip edges and the surface. The banded system is factorised once; shift-invert subspace iteration gives the two lowest modes, the stopband edges.
4. **Extraction.** From the shorted edges f₁ < f₂: velocity under the IDTs v = p(f₁ + f₂) and |r_s| = π(f₂ − f₁)/(f₁ + f₂). The edge that is the same for the open grating is uncoupled; the other couples to the IDT, and r_s < 0 when that is the lower edge (the COM convention above).
5. **Thickness.** h/λ is solved with λ = v/f₀, starting from the first-order film estimate.

**Example** (128°Y, φ = 0, default constants, Al strips, η = 0.5):

| h/λ | 0 | 1 % | 2 % | 3 % | 4 % | 8 % |
|---|---|---|---|---|---|---|
| r_s | −1.92 % | −1.27 % | −0.53 % | +0.29 % | +1.20 % | +6.84 % |
| Velocity under the IDTs (m/s) | 3884.8 | 3875.3 | 3862.3 | 3845.4 | 3824.3 | 3688.3 |

For Al the electrode reflection changes sign near h/λ ≈ 2.6 %. The velocities lie below the first-order estimate v₀ + η(v_film − v₀), by 25 m/s at h = 0 and 200 m/s at h/λ = 8 %.

**Accuracy and cost.** At the default mesh, r_s is within about 0.03 % (absolute) and the velocity within about 2 m/s of a mesh with twice the resolution. One design point (shorted and open grating) takes 1.5–4 s and runs in a background thread.

**Limits.** Rectangular strips of one bulk metal, bonded without an adhesion layer; η fixed at 0.5 in the delay-line model; Rayleigh-type modes only; no bulk-wave radiation from the grating.

**Velocity under the IDTs.** Under the IDTs the SAW is slower than on the free surface, from electrical shorting and the electrodes' mass. The IDT period λ = v₀(1 + Δv/v₀)/f₀, the electrode pitch λ/2 and the transit time inside the IDTs use the shifted velocity; the gap uses v₀. Δv/v₀ is either entered (for example from FEM or a measured resonance) or computed with **Include electrode mass** (see [Electrode mass loading](#electrode-mass-loading)). Details lists the wavelength under the IDTs, the free-surface wavelength v₀/f₀ and, for reference, the metallized-surface wavelength vₘ/f₀.

### Electrode mass loading

**Method.**

1. **Continuous film (exact).** An isotropic metal film of thickness h covers the substrate. The film conducts, so φ = 0 at the interface. In the film, the state (u, T₃ⱼ) obeys a linear ODE in x₃; its 6×6 transfer matrix exp(iR·kh) carries the substrate's surface state to the film top, which is traction-free. The slowest root below the bulk-wave limit is v_film(h/λ). At h = 0 it equals vₘ.
2. **Under the IDTs (estimate).** The IDT covers a fraction η = 0.5 of the surface with metal. To first order, v_IDT = v₀ + η (v_film − v₀). Since h/λ depends on λ = v_IDT/f₀, the two are solved together by iteration.
3. **Cost.** One v_film takes about 5 ms; the estimate about 20 ms; the chart of velocity against h/λ (21 points) about 0.1 s.

**Metal data** (bulk; thin films can be softer). Density, Young's modulus and Poisson ratio from the elements' Wikipedia infoboxes (Nov 2026); they can be edited on the page.

| Metal | Density (g/cm³) | E (GPa) | ν |
|---|---|---|---|
| Al | 2.699 | 70 | 0.35 |
| Au | 19.283 | 79 | 0.44 |
| Cu | 8.935 | 128 | 0.34 |
| Pt | 21.452 | 168 | 0.38 |
| Ni | 8.907 | 200 | 0.31 |

Cu is listed as 110–128 GPa; 128 GPa matches its listed shear modulus (48 GPa) and ν = 0.34.

**Example** (128°Y, φ = 0, default constants, f₀ = 220 MHz, h = 100 nm): Al gives Δv/v₀ = −1.43 % (h/λ = 0.56 %), mostly from shorting; Au gives −3.29 %.

**Limits.** The estimate leaves out grating reflections, the stopband and second-order (stored-energy) terms, which depend on the electrode shape. The coupling-of-modes model in Phase 3 will add them. The film is isotropic and bonded without an adhesion layer.

**Optimum aperture without tuning.** For a fixed Np, the conversion loss from a source of resistance R is lowest when |Z_IDT| = R. Choosing W for Re Z = R instead gives a smaller aperture. For 128°Y-X at 220 MHz with Np = 22, Cs = 3.61 pF/cm, K² = 5.5 % and R = 50 Ω, the two apertures are 832 µm (Re Z = R) and 992 µm (|Z| = R), and they give 6.89 dB and 6.82 dB (bare IDTs, single transit).

**Limits.**

- Electrode reflection only in the COM model, with an entered r_s. The velocity under the IDTs is an input, or the first-order mass-loading estimate.
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
- The Z-cut 3-fold and mirror symmetries hold. The power-flow angle is zero where mirror symmetry requires it, and it agrees with the slope of v₀(φ).
- Regression tests cover the rotated Y-cuts where partial waves coalesce, and an X-cut range with a second metallized-surface root.

**Delay-line extras.**

- With unequal Np, the group delay is blank next to every null deeper than 60 dB and lies between 0 and 2τ elsewhere; at f₀ it equals τ.
- The zero-to-zero bandwidth equals 2f₀/max(Np₁, Np₂) within two frequency steps for Np = 22/22, 22/15 and 10/30.
- With Δv/v₀ = −2 %, the pitch is v₀(1 + Δv/v₀)/(2f₀) and τ = gap/v₀ + (Np₁ + Np₂)/(2f₀); with no shift, τ = Lcc/v₀.

**Metal film (mass loading).**

- The film transfer matrix satisfies exp(iR)·exp(−iR) = I.
- A film of zero thickness gives vₘ to 1e-9.
- A film of the substrate's own material on an isotropic substrate leaves the Rayleigh velocity unchanged for kh = 0.05–3 (tests the in-plane and vertical film rows and the interface).
- The boundary determinant vanishes at the analytic Love-wave velocity of an isotropic layer on an isotropic substrate, for kh = 0.5, 1 and 2 (tests the shear-horizontal film rows).
- On 128°Y the velocity falls with thickness, faster for Au than for Al; the estimate under the IDTs is self-consistent in h/λ and lies halfway between v₀ and vₘ at h = 0.

**COM model.**

- With r_s = 0, the P-matrix admittance equals the impulse model (Ga, Ba, Ct) to 1e-12, and the delay line's S-parameters match it to 1e-12 for equal and unequal Np, with and without the triple-transit echo.
- Lossless P-matrices are unitary and reciprocal (P₁₂ = P₂₁, P₃₁ = −2P₁₃, P₃₂ = −2P₂₃), and Re P₃₃ equals the radiated power |P₁₃|² + |P₂₃|².
- The closed form agrees to 1e-10 with a numerical integration of the COM equations (matrix exponential), with loss and either sign of r_s.
- A 300-period grating reflects more than 99 % inside f₀(1 ± |r_s|/π) and less than 50 % at twice that offset; the radiation conductance of a long IDT peaks at the lower edge for r_s < 0 and the upper edge for r_s > 0.
- The COM delay line with r_s = −2 %, feedthrough, tuning and loss is passive and reciprocal at every frequency.

**Periodic-grating FEM.**

- Without strips the cell gives v₀, and fully metallized it gives vₘ (h = 0) and the continuous-film velocity (Al, h/λ = 2 %), each within 150 ppm.
- 128°Y, Al, h = 0: r_s between −2.0 % and −1.85 %, lower edge coupled; the uncoupled edge is the same in the shorted and open gratings.
- For Al on 128°Y, r_s < 0 at h/λ = 2 % and r_s > 0 at 3 %.
- The default and the doubled mesh agree within 0.05 % in r_s and 3 m/s in velocity.

**Thin-film stacks.**

- Every decaying partial-wave state of the bulk solver is an eigenvector of the Stroh matrix with eigenvalue β (to 1e-12).
- An LN film on LN of the same cut gives the bulk v₀, vₘ and ε∞ at h/λ = 0.05, 0.3 and 1.
- An isotropic layer on an isotropic substrate gives the analytic Love-wave velocity (kh = 0.5, 1, 2).
- An isotropic plate gives SH0 = shear velocity, S0 → plate velocity and A0 → thin-plate flexural velocity at small thickness, and the SH1 cutoff.
- A 3λ-thick LN film on sapphire, on SiO₂/Si and as a membrane recovers bulk 128°Y LN (within 0.2 % in velocity, 5 % in K²).
- The stack velocity is self-consistent with h/λ = h f₀/v₀, K² > 0 and v₀ below the substrate's bulk limit.

**Euler angles.**

- The COMSOL angles for 128°Y-X equal COMSOL's example values in 3D and 2D.
- For 200 random orientations, plus β = 0° and 180°, the COMSOL and (λ, μ, θ) angles rebuild the rotation matrix.
- 128°Y and rotated Y-cuts at propagation angle φ equal the Euler sets (0°, 38°, φ) and (0°, θ − 90°, φ).

**Published data.** Data sets are JSON files in `tests/data/`, each with its source, whether it is measured or simulated, and its angle convention; `tests/published.test.mjs` compares them with the solver.

| Data set | Kind | Agreement |
|---|---|---|
| X-cut, −85° to 85° from Z (Shao et al. 2022, Extended Data Fig. 1) | Simulated | Default set: v₀ and vₘ within 1.3 m/s, k² within 0.09 percentage points, same slowest direction (30°) and k² zero (−40°) |

**Comparison, not a test: Mayor et al., Phys. Rev. Applied 15, 014039 (2021).** X-cut LN, 500 nm on sapphire, propagation along Y, 1 µm IDT period. The paper measures rib waveguides (300 nm rib on a 200 nm slab) and IDTs with 55 nm Al, and does not state its sapphire orientation or material constants, so an unpatterned-film calculation is not directly comparable:

| Quantity | Paper | This tool, unpatterned 500 nm film, λ = 1 µm |
|---|---|---|
| Group velocity, Rayleigh-type | 3320 ± 30 m/s measured, 3336 m/s simulated (rib) | 3266 m/s |
| Coupling, SH (Love-type) mode | k_eff² ≈ 15 % (open vs shorted band edges of the IDT unit cell) | K² = 18.3 % (Δv/v = 9.1 %) |
| IDT centre frequency | 3.42 GHz measured | 4.07 GHz (Rayleigh-type) or 4.71 GHz (SH) from the phase velocity; not matched |

- The paper's angle θ from Z is the X-cut angle φ = 90° + θ in this tool.
- The data were read from the vector paths of the published figure.

## Roadmap

| Phase | Content | Status |
|---|---|---|
| 1 | Impulse model, delay line, probe ports, pads, export | Done |
| 2 | Partial-wave solver for any cut and direction; angle sweep | Done |
| 3 | Coupling-of-modes (P-matrix) model: electrode reflection, mass loading, metal thickness | Done. Metallization ratio as an input dropped (rarely needed); fixed at 0.5 |
| 4 | Optimizer: Np, W and tuning L for lowest loss or widest band, with constraints | Skipped |
| 5 | Thin-film LiNbO₃: LN/SiO₂/Si, LN on sapphire, suspended membrane; Rayleigh-type and SH modes | In progress (branch `phase5-thin-film`): layered solver, mode selection, dispersion charts |

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
| `src/com.js` | COM P-matrix of a uniform IDT; delay line from two P-matrices |
| `src/network.js` | Two-port Y/Z/S helpers |
| `src/materials.js` | Cut definitions, presets, clamped-ε Cs estimate |
| `src/saw/constants.js` | LiNbO₃ material constants |
| `src/saw/tensor.js` | Tensors, rotations, Euler angles |
| `src/saw/solver.js` | Partial-wave solver |
| `src/saw/substrate.js` | Cached solver calls and angle sweeps |
| `src/saw/layered.js` | Layered structures: Stroh matrices, impedance recursion, mode search |
| `src/saw/stack.js` | Thin-film stacks (LNOI, LN on sapphire, membrane), chosen mode, dispersion |
| `src/saw/grating.js` | Periodic-grating finite-element unit cell: stopband edges, r_s, velocity under the IDTs |
| `src/saw/euler.js` | COMSOL and (λ, μ, θ) Euler angles of an orientation |
| `src/view3d.js` | 3D chip and axes view (Plotly) |
| `src/saw/worker.js` | Web Worker for angle sweeps |
| `src/pads.js` | Pad-capacitance estimate |
| `src/complex.js` | Complex arithmetic |
| `tests/` | Node tests |
| `scripts/serve.mjs` | Local server with caching off (`npm start`) |
| `scripts/stamp.mjs` | Content-hash stamps on module URLs (`npm run stamp`) |

## Disclaimer

This tool is provided as is, without warranty of any kind, express or implied, including fitness for a particular purpose. Its results come from simplified models (impulse IDT model; Rayleigh-type SAW on a piezoelectric half-space; no electrode reflections, mass loading or diffraction) and published material constants, and can differ from real devices. Check them independently before design, fabrication or purchasing decisions. The authors accept no liability for any use of the results.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE). Developed by Linbo Shao with Claude (Anthropic).
