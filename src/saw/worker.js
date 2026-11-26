// Web Worker: runs angle sweeps off the main thread.
import { stackSAW, stackDispersion } from './stack.js?v=521bac1594';
import { sweep, gratingParams } from './substrate.js?v=521bac1594';

self.onmessage = (ev) => {
  if (ev.data.kind === 'stack' || ev.data.kind === 'disp') {
    const { kind, key, orient, prm } = ev.data;
    try {
      if (kind === 'stack') self.postMessage({ kind, key, result: stackSAW(orient, prm) });
      else self.postMessage({ kind, key, rows: stackDispersion(orient, { ...prm, onProgress: (f) => self.postMessage({ kind, key, progress: f }) }) });
    } catch (err) {
      self.postMessage({ kind, key, error: String(err && err.message || err) });
    }
    return;
  }
  if (ev.data.kind === 'grating') {
    const { key, orient, set, metal, h, f0, eta } = ev.data;
    try {
      self.postMessage({ kind: 'grating', key, result: gratingParams(orient, { set, metal, h, f0, eta }) });
    } catch (err) {
      self.postMessage({ kind: 'grating', key, error: String(err && err.message || err) });
    }
    return;
  }
  const { id, fam, base, list, set } = ev.data;
  try {
    const rows = sweep(fam, base, list, (frac) => self.postMessage({ id, progress: frac }), set);
    self.postMessage({ id, rows });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
