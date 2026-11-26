// Web Worker: runs angle sweeps off the main thread.
import { sweep } from './substrate.js?v=d11e120981';

self.onmessage = (ev) => {
  const { id, fam, base, list, set } = ev.data;
  try {
    const rows = sweep(fam, base, list, (frac) => self.postMessage({ id, progress: frac }), set);
    self.postMessage({ id, rows });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
