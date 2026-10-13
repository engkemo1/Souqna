/**
 * Warms up / seeds the CLIP model:  npm run model:prefetch -w server
 * Restores it from R2 when it is already there; otherwise downloads it from HuggingFace and uploads it to R2
 * (needs the R2_* variables). Safe to run any time; never fails — without the model visual search uses the colour model.
 */
import { clipReady, clipStatus } from '../lib/visual-clip.js';

const ok = await clipReady().catch(() => false);
if (ok) await new Promise((r) => setTimeout(r, 15000)); // give the background R2 upload time to finish
console.log(ok ? '[visual] CLIP model ready' : `[visual] CLIP model not available (${clipStatus().error}); the colour model will be used`);
process.exit(0);
