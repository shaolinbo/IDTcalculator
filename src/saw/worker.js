// Web Worker: runs angle sweeps off the main thread.
import { sweep, gratingParams } from './substrate.js?v=c29d6d9797';

self.onmessage = (ev) => {
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
