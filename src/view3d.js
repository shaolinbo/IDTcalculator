// 3D sketch of the chip in device axes (= COMSOL 3D global axes):
// x = SAW propagation, z = top-surface normal (out of the chip), substrate below z = 0.
// Crystal axes X, Y, Z are the columns of A (rows of A = device axes in crystal coordinates).

const CHIP = { x: [-1.2, 1.2], y: [-1.0, 1.0], z: [-0.28, 0] };
const METAL = '#b8963e';

const add = (a, b, s = 1) => a.map((v, i) => v + s * b[i]);

function box({ x, y, z }, color, opacity) {
  const X = [x[0], x[1], x[1], x[0], x[0], x[1], x[1], x[0]];
  const Y = [y[0], y[0], y[1], y[1], y[0], y[0], y[1], y[1]];
  const Z = [z[0], z[0], z[0], z[0], z[1], z[1], z[1], z[1]];
  return {
    type: 'mesh3d', x: X, y: Y, z: Z, color, opacity, flatshading: true, hoverinfo: 'skip',
    i: [0, 0, 4, 4, 0, 0, 1, 1, 2, 2, 3, 3], j: [1, 2, 5, 6, 1, 5, 2, 6, 3, 7, 0, 4], k: [2, 3, 6, 7, 5, 4, 6, 5, 7, 6, 4, 7],
    lighting: { ambient: 0.85, diffuse: 0.3, specular: 0.05 },
  };
}

function edges({ x, y, z }, color) {
  const P = [];
  const seg = (a, b) => P.push(a, b, [null, null, null]);
  for (const zz of z) {
    seg([x[0], y[0], zz], [x[1], y[0], zz]); seg([x[1], y[0], zz], [x[1], y[1], zz]);
    seg([x[1], y[1], zz], [x[0], y[1], zz]); seg([x[0], y[1], zz], [x[0], y[0], zz]);
  }
  for (const xx of x) for (const yy of y) seg([xx, yy, z[0]], [xx, yy, z[1]]);
  return polyline(P, color, 2);
}

function polyline(P, color, width, dash = 'solid') {
  return {
    type: 'scatter3d', mode: 'lines', hoverinfo: 'skip', showlegend: false,
    x: P.map((p) => p[0]), y: P.map((p) => p[1]), z: P.map((p) => p[2]),
    line: { color, width, dash },
  };
}

/** Arrow from o along unit vector d with length L: a shaft and a cone head. */
function arrow(o, d, L, color, width = 6, dash = 'solid') {
  const tip = add(o, d, L);
  return [
    polyline([o, add(o, d, L * 0.86)], color, width, dash),
    {
      type: 'cone', x: [tip[0]], y: [tip[1]], z: [tip[2]], u: [d[0]], v: [d[1]], w: [d[2]],
      anchor: 'tip', sizemode: 'absolute', sizeref: 0.16, showscale: false, hoverinfo: 'skip',
      colorscale: [[0, color], [1, color]], lighting: { ambient: 0.9, diffuse: 0.3 },
    },
  ];
}

function labels(points, texts, color, size) {
  return {
    type: 'scatter3d', mode: 'text', hoverinfo: 'skip', showlegend: false,
    x: points.map((p) => p[0]), y: points.map((p) => p[1]), z: points.map((p) => p[2]),
    text: texts, textfont: { color, size },
  };
}

/** Two IDT combs on the top surface (finger lines and bus bars). */
function idts() {
  const P = [];
  const seg = (a, b) => P.push(a, b, [null, null, null]);
  const z = 0.004, yLo = -0.9, yHi = -0.2;
  for (const [x0, x1] of [[-1.0, -0.6], [0.6, 1.0]]) {
    seg([x0, yLo, z], [x1, yLo, z]); seg([x0, yHi, z], [x1, yHi, z]);
    const n = 7;
    for (let k = 0; k < n; k++) {
      const x = x0 + (k * (x1 - x0)) / (n - 1);
      if (k % 2 === 0) seg([x, yLo, z], [x, yHi - 0.1, z]); else seg([x, yHi, z], [x, yLo + 0.1, z]);
    }
  }
  return polyline(P, METAL, 4);
}

/**
 * Plotly traces and layout for orientation A, with the power-flow angle pfa (deg, may be null).
 * t: theme colours { surface, ink, ink2, muted, axis, s1, s2 }.
 */
export function chipFigure(A, pfa, t) {
  const col = (k) => [A[0][k], A[1][k], A[2][k]];
  const data = [box(CHIP, t.axis, 0.35), edges(CHIP, t.muted), idts()];

  // SAW propagation along +x between the IDTs; power flow rotated by the PFA about z.
  const o = [-0.45, -0.55, 0.012];
  data.push(...arrow(o, [1, 0, 0], 0.9, t.s2, 7));
  const texts = [[add(o, [0, 0.16, 0.04]), 'SAW']];
  if (Number.isFinite(pfa) && Math.abs(pfa) >= 0.1) {
    const a = (pfa * Math.PI) / 180;
    const d = [Math.cos(a), Math.sin(a), 0];
    data.push(...arrow(o, d, 0.9, t.s2, 4, 'dash'));
    // Label on the side the power flow turns to, clear of the SAW arrow.
    texts.push([add(add(o, d, 0.55), [0, Math.sign(pfa) * 0.2, 0.04]), `power flow ${pfa.toFixed(2).replace('-', '−')}°`]);
  }
  data.push(labels(texts.map((x) => x[0]), texts.map((x) => x[1]), t.ink2, 12));

  // Crystal axes X, Y, Z.
  const c0 = [0.1, 0.45, 0], L = 0.85;
  for (let k = 0; k < 3; k++) data.push(...arrow(c0, col(k), L, t.s1, 6));
  data.push(labels([0, 1, 2].map((k) => add(c0, col(k), L * 1.25)), ['<b>X</b>', '<b>Y</b>', '<b>Z</b>'], t.ink, 15));

  // Chip (COMSOL 3D global) axes x, y, z at a corner.
  const g0 = [-1.55, -1.35, CHIP.z[0]], Lg = 0.35;
  const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const e of E) data.push(...arrow(g0, e, Lg, t.muted, 4));
  data.push(labels(E.map((e) => add(g0, e, Lg * 1.35)), ['x', 'y', 'z'], t.muted, 12));

  const hidden = { visible: false, showspikes: false };
  const layout = {
    paper_bgcolor: t.surface,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    showlegend: false,
    uirevision: 'chip',
    scene: {
      bgcolor: t.surface, aspectmode: 'data', dragmode: 'orbit',
      xaxis: hidden, yaxis: hidden, zaxis: hidden,
      camera: { eye: { x: 0.9, y: -1.2, z: 0.85 }, up: { x: 0, y: 0, z: 1 } },
    },
  };
  return { data, layout };
}
