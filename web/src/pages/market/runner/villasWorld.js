// Banha Runner — "الكوبري والفلل" world.
// A winding, rolling street streamed in 14 m segments: villas with walls and gates, the Banha bridge,
// a Nile corniche, a mosque and a small shop strip. 100% procedural (three.js + canvas), no external assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { makeSedan, makeMicrobus, stdMat, textTexture, vcOf, withColors } from './vehicles.js';

/* ------------------------------------------------------------------------------------------------
   EDIT ME — real names go here. These are generic placeholders (no real business is named).
------------------------------------------------------------------------------------------------ */
export const VILLAS_PLACES = {
  bridgeSign: 'كوبري بنها',
  areaSign: 'الفلل',
  streetSigns: ['شارع الترعة', 'شارع كلية التجارة', 'الفلل'],
  mosque: 'مسجد الرحمن',
  shops: ['صيدلية', 'سوبر ماركت', 'مخبز', 'كافيه', 'ورش', 'ملابس'],
};

const L = 14;          // segment length (m)
const N = 9;           // segments alive at once
const ROAD_HALF = 5.6; // road half width used by the game
const WALK_OUT = 8.6;  // outer edge of the pavement
const WALL_X = 8.9;
const VILLA_X = 12.4;

/* ---------------------------------------------------------------- curved-world shader */
export const WORLD_BEND = { uCurve: { value: 0 }, uHill: { value: 0 } };
const BEND_KEY = 'banha-bend-v1';
function bendMaterial(material) {
  if (!material || material.userData.bendDone || material.userData.noBend) return;
  material.userData.bendDone = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uCurve = WORLD_BEND.uCurve; shader.uniforms.uHill = WORLD_BEND.uHill;
    shader.vertexShader = 'uniform float uCurve;\nuniform float uHill;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       float bendD = max(-mvPosition.z - 9.0, 0.0);
       mvPosition.x += uCurve * bendD * bendD;
       mvPosition.y -= uHill * bendD * bendD;
       gl_Position = projectionMatrix * mvPosition;`);
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + BEND_KEY;
  material.needsUpdate = true;
}
export function patchBend(root) {
  root.traverse((o) => {
    if (o.isMesh || o.isLine || o.isPoints) {
      o.frustumCulled = false;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(bendMaterial);
    }
  });
}

/* ---------------------------------------------------------------- helpers */
const rngFrom = (seed) => { let n = seed | 0; return () => { n = (n * 1664525 + 1013904223) | 0; return (n >>> 0) / 4294967296; }; };
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  plane: new THREE.PlaneGeometry(1, 1).toNonIndexed(),
  sphere: new THREE.SphereGeometry(1, 12, 9).toNonIndexed(),
  ico: new THREE.IcosahedronGeometry(1, 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10).toNonIndexed(),
  cone: new THREE.ConeGeometry(1, 1, 4).toNonIndexed(),
};
const tmpGeos = new Map();
function taperedCyl(rt, rb, seg = 8) {
  const key = rt + '|' + rb + '|' + seg;
  if (!tmpGeos.has(key)) tmpGeos.set(key, new THREE.CylinderGeometry(rt, rb, 1, seg).toNonIndexed());
  return tmpGeos.get(key);
}

/** Collects many transformed primitives and merges them per material → a handful of draw calls per building. */
class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, uvScale) {
    _p.set(x, y, z); _s.set(sx, sy, sz); _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    const g = geo.clone().applyMatrix4(_m.compose(_p, _q, _s));
    const vm = vcOf(material); if (vm) { withColors(g, material); material = vm; }
    if (uvScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); }
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
  }
  box(m, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) { this.add(UNIT.box, m, x, y, z, sx, sy, sz, rx, ry, rz); }
  plane(m, w, h, x, y, z, ry = 0, rx = 0, rz = 0, uvScale) { this.add(UNIT.plane, m, x, y, z, w, h, 1, rx, ry, rz, uvScale); }
  cyl(m, r, h, x, y, z, rx = 0, rz = 0, ry = 0) { this.add(UNIT.cyl, m, x, y, z, r, h, r, rx, ry, rz); }
  taper(m, rt, rb, h, x, y, z, rx = 0, rz = 0) { this.add(taperedCyl(rt, rb), m, x, y, z, 1, h, 1, rx, 0, rz); }
  sphere(m, r, x, y, z, sx = 1, sy = 1, sz = 1) { this.add(UNIT.sphere, m, x, y, z, r * sx, r * sy, r * sz); }
  blob(m, r, x, y, z, sy = .85) { this.add(UNIT.ico, m, x, y, z, r, r * sy, r); }
  pyramid(m, r, h, x, y, z, ry = Math.PI / 4, sx = 1, sz = 1) { this.add(UNIT.cone, m, x, y, z, r * sx, h, r * sz, 0, ry, 0); }
  object(obj, dx = 0, dy = 0, dz = 0, ry = 0, scale = 1) {
    obj.position.set(dx, dy, dz); obj.rotation.y = ry; obj.scale.setScalar(scale); obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      let g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld), material = o.material;
      const vm = vcOf(material); if (vm) { withColors(g, material); material = vm; }
      if (!this.parts.has(material)) this.parts.set(material, []);
      this.parts.get(material).push(g);
    });
  }
  build(castShadow = false) {
    const group = new THREE.Group();
    for (const [material, list] of this.parts) {
      const geo = mergeGeometries(list, false); list.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material); mesh.castShadow = castShadow; mesh.receiveShadow = false; mesh.frustumCulled = false; group.add(mesh);
    }
    return group;
  }
}
function disposeGroup(group) {
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  group.clear();
}

/* ---------------------------------------------------------------- textures */
const texMemo = new Map();
const memo = (key, make) => { if (!texMemo.has(key)) texMemo.set(key, make()); return texMemo.get(key); };
const canvasTex = (w, h, draw, { repeat, srgb = true } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
};
function noise(ctx, w, h, count, lo, hi, aLo, aHi, size = 2, seed = 1) {
  const r = rngFrom(seed);
  for (let i = 0; i < count; i++) { const s = lo + Math.floor(r() * (hi - lo)); ctx.fillStyle = `rgba(${s},${s},${s},${aLo + r() * (aHi - aLo)})`; ctx.fillRect(r() * w, r() * h, 1 + r() * size, 1 + r() * size); }
}

/** Turns a procedurally drawn height field into a tangent-space normal map (gives real surface relief under the sun). */
function normalMapFrom(w, h, drawHeight, { strength = 2.5, repeat, blur = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); drawHeight(x, w, h);
  const src = x.getImageData(0, 0, w, h).data; let hf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hf[i] = src[i * 4] / 255;
  for (let pass = 0; pass < blur; pass++) { const o = new Float32Array(w * h); for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += hf[((yy + dy + h) % h) * w + ((xx + dx + w) % w)]; o[yy * w + xx] = a / 9; } hf = o; }
  const out = x.createImageData(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const l = hf[yy * w + (xx - 1 + w) % w], r = hf[yy * w + (xx + 1) % w], u = hf[((yy - 1 + h) % h) * w + xx], d = hf[((yy + 1) % h) * w + xx];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const o = (yy * w + xx) * 4; out.data[o] = (nx * .5 + .5) * 255; out.data[o + 1] = (ny * .5 + .5) * 255; out.data[o + 2] = (nz * .5 + .5) * 255; out.data[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (repeat) t.repeat.set(repeat[0], repeat[1]); return t;
}
const grayNoise = (x, w, h, count, size, seed, base = 128, range = 90) => {
  x.fillStyle = `rgb(${base},${base},${base})`; x.fillRect(0, 0, w, h); const r = rngFrom(seed);
  for (let i = 0; i < count; i++) { const g = base + (r() - .5) * range * 2; x.fillStyle = `rgb(${g},${g},${g})`; x.beginPath(); x.arc(r() * w, r() * h, .6 + r() * size, 0, 7); x.fill(); }
};
function asphaltNormal() {
  return normalMapFrom(512, 512, (x, w, h) => {
    grayNoise(x, w, h, 16000, 2.6, 21); const r = rngFrom(3);
    x.strokeStyle = 'rgb(20,20,20)'; x.lineWidth = 2;
    for (let i = 0; i < 6; i++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += (r() - .5) * 46; py += r() * 34; x.lineTo(px, py); } x.stroke(); }
  }, { strength: 3.2, repeat: [1, 14], blur: 1 });
}
function pavementNormal() {
  return normalMapFrom(512, 512, (x, w, h) => {
    grayNoise(x, w, h, 7000, 3, 8, 150, 40); x.strokeStyle = 'rgb(40,40,40)'; x.lineWidth = 6;
    for (let y = 0; y <= h; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) { const px = col * 128 + (row % 2) * 64; x.beginPath(); x.moveTo(px, row * 64); x.lineTo(px, (row + 1) * 64); x.stroke(); }
  }, { strength: 2.6, repeat: [3, 18], blur: 1 });
}
function plasterNormal() {
  return normalMapFrom(256, 256, (x, w, h) => grayNoise(x, w, h, 9000, 2.2, 14), { strength: 1.6, repeat: [3, 3], blur: 1 });
}
function asphaltTexture() {
  return canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#54575C'; x.fillRect(0, 0, w, h); noise(x, w, h, 26000, 20, 125, .05, .24, 3, 11);
    const r = rngFrom(77);
    // large worn / patched areas
    for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(28,28,30,${.05 + r() * .09})`; x.beginPath(); x.ellipse(r() * w, r() * h, 40 + r() * 90, 20 + r() * 50, r() * 3, 0, 7); x.fill(); }
    // asphalt patches (darker fresh rectangles with a lighter seam)
    for (let i = 0; i < 4; i++) { const pw = 90 + r() * 120, ph = 120 + r() * 160, px = 120 + r() * (w - 300), py = r() * h; x.fillStyle = 'rgba(30,31,34,.55)'; x.fillRect(px, py, pw, ph); x.strokeStyle = 'rgba(150,150,150,.25)'; x.lineWidth = 2; x.strokeRect(px, py, pw, ph); noise(x, pw + px, ph + py, 600, 10, 60, .1, .3, 2, 3 + i); }
    // wheel tracks (polished dark bands) in each lane
    for (const u of [.15, .27, .4, .52, .66, .78]) { const g = x.createLinearGradient((u - .03) * w, 0, (u + .03) * w, 0); g.addColorStop(0, 'rgba(20,20,22,0)'); g.addColorStop(.5, 'rgba(20,20,22,.34)'); g.addColorStop(1, 'rgba(20,20,22,0)'); x.fillStyle = g; x.fillRect((u - .03) * w, 0, .06 * w, h); }
    // oil stains
    for (let i = 0; i < 8; i++) { const cx = r() * w, cy = r() * h, rr = 14 + r() * 26; const g = x.createRadialGradient(cx, cy, 2, cx, cy, rr); g.addColorStop(0, 'rgba(8,8,10,.7)'); g.addColorStop(1, 'rgba(8,8,10,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rr * 1.4, rr, r() * 3, 0, 7); x.fill(); }
    // sand / dust drifting in from both edges
    for (const e of [0, 1]) { const g = x.createLinearGradient(e ? w : 0, 0, e ? w * .86 : w * .14, 0); g.addColorStop(0, 'rgba(196,172,128,.6)'); g.addColorStop(1, 'rgba(196,172,128,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    noise(x, w, h, 5000, 150, 230, .1, .35, 2, 21);
    // cracks with branches
    x.strokeStyle = 'rgba(10,10,11,.7)'; x.lineWidth = 2;
    for (let i = 0; i < 9; i++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 10; k++) { px += (r() - .5) * 60; py += r() * 44; x.lineTo(px, py); if (r() > .8) { x.moveTo(px, py); x.lineTo(px + (r() - .5) * 70, py + r() * 40); x.moveTo(px, py); } } x.stroke(); }
    x.lineWidth = 1; x.strokeStyle = 'rgba(10,10,11,.5)';
    for (let i = 0; i < 18; i++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - .5) * 30; py += (r() - .5) * 30; x.lineTo(px, py); } x.stroke(); }
  }, { repeat: [1, 14] });
}
function curbTexture() {
  return canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#E4DFD2'; x.fillRect(0, 0, w, h); x.fillStyle = '#1C1D20'; x.fillRect(0, 0, w, h / 2); noise(x, w, h, 300, 40, 140, .05, .2, 2, 5); }, { repeat: [1, 70] });
}
function pavementTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#BDB09A'; x.fillRect(0, 0, w, h); noise(x, w, h, 6000, 40, 150, .05, .2, 3, 9);
    x.strokeStyle = 'rgba(70,58,44,.28)'; x.lineWidth = 3;
    for (let y = 0; y <= h; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) { const px = col * 128 + (row % 2) * 64; x.beginPath(); x.moveTo(px, row * 64); x.lineTo(px, (row + 1) * 64); x.stroke(); }
  }, { repeat: [3, 18] });
}
function grassTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#7E8C58'; x.fillRect(0, 0, w, h); const r = rngFrom(31);
    for (let i = 0; i < 3500; i++) { x.fillStyle = `rgba(${60 + r() * 60},${90 + r() * 70},${30 + r() * 40},${.1 + r() * .25})`; x.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(176,150,100,${.12 + r() * .12})`; x.beginPath(); x.ellipse(r() * w, r() * h, 30 + r() * 60, 16 + r() * 28, r() * 3, 0, 7); x.fill(); }
  }, { repeat: [4, 4] });
}
function waterTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5E9AAE'); g.addColorStop(1, '#3F7F95'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const r = rngFrom(5);
    for (let i = 0; i < 240; i++) { x.fillStyle = `rgba(255,236,196,${.08 + r() * .25})`; x.fillRect(r() * w, r() * h, 10 + r() * 46, 1.5 + r() * 2); }
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(20,60,80,${.06 + r() * .14})`; x.fillRect(r() * w, r() * h, 16 + r() * 60, 2 + r() * 3); }
  }, { repeat: [3, 5] });
}
function barsTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#23282B';
    x.fillRect(0, 22, w, 7); x.fillRect(0, h - 26, w, 7);
    for (let i = 0; i < 8; i++) { const px = 8 + i * 16; x.fillRect(px, 12, 5, h - 14); x.beginPath(); x.moveTo(px - 3, 14); x.lineTo(px + 2.5, 0); x.lineTo(px + 8, 14); x.fill(); }
  });
}
function facadeTexture(variant, w = 704, h = 512) {
  return memo('facade' + variant, () => canvasTex(w, h, (x) => {
    const palettes = [['#E8D8B8', '#8A5B3F', '#5E7F55'], ['#F1E6D0', '#6F523C', '#2F6A5B'], ['#E3C7A8', '#5B4637', '#2F5C86'], ['#F4EEE2', '#35495F', '#A4473A'], ['#D9B88F', '#664636', '#2F6B52'], ['#EEDFC6', '#46586A', '#9C5B34'], ['#E7C9C0', '#6B4A44', '#42627A'], ['#DCE3D5', '#5A5F52', '#8B5A3C']];
    const [wall, frame, shutter] = palettes[variant % palettes.length]; const floors = variant % 3 === 0 ? 3 : 2;
    const r = rngFrom(variant * 97 + 3);
    x.fillStyle = wall; x.fillRect(0, 0, w, h); noise(x, w, h, 5000, 60, 200, .03, .1, 3, variant + 2);
    const fh = (h - 54) / floors;
    // roof cornice
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, 0, w, 20); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 20, w, 6);
    for (let i = 0; i < w; i += 18) { x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(i, 26, 8, 8); }
    for (let f = 0; f < floors; f++) {
      const y0 = h - (f + 1) * fh - (f === 0 ? 0 : 0), top = y0;
      x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(0, top + fh - 8, w, 3); x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(0, top + fh - 5, w, 3);
      const cols = 3;
      for (let c = 0; c < cols; c++) {
        const cx = w * (c + .5) / cols, ww = 92, wh = fh * .46, wy = top + fh * .2;
        if (f === 0 && c === 1) { // entrance
          const dw = 120, dh = fh * .74, dy = h - dh - 8;
          x.fillStyle = frame; x.fillRect(cx - dw / 2 - 10, dy - 12, dw + 20, dh + 12);
          x.fillStyle = '#2B2018'; x.beginPath(); x.moveTo(cx - dw / 2, h - 8); x.lineTo(cx - dw / 2, dy + 38); x.quadraticCurveTo(cx, dy - 22, cx + dw / 2, dy + 38); x.lineTo(cx + dw / 2, h - 8); x.fill();
          x.fillStyle = 'rgba(160,200,215,.45)'; x.fillRect(cx - dw / 2 + 12, dy + 36, dw / 2 - 18, dh * .42); x.fillRect(cx + 6, dy + 36, dw / 2 - 18, dh * .42);
          x.fillStyle = '#D6C7A6'; x.fillRect(cx - dw / 2 - 20, h - 10, dw + 40, 10);
          continue;
        }
        x.fillStyle = frame; x.fillRect(cx - ww / 2 - 7, wy - 7, ww + 14, wh + 14);
        const arched = variant % 2 === 0 && f === 0;
        const g = x.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#6F93A5'); g.addColorStop(.55, '#B9D3DC'); g.addColorStop(1, '#456A7C');
        x.fillStyle = g;
        if (arched) { x.beginPath(); x.moveTo(cx - ww / 2, wy + wh); x.lineTo(cx - ww / 2, wy + 22); x.quadraticCurveTo(cx, wy - 20, cx + ww / 2, wy + 22); x.lineTo(cx + ww / 2, wy + wh); x.fill(); }
        else x.fillRect(cx - ww / 2, wy, ww, wh);
        x.fillStyle = frame; x.fillRect(cx - 2, wy, 4, wh); x.fillRect(cx - ww / 2, wy + wh * .45, ww, 4);
        // shutters
        if (r() > .35) for (const sx of [-1, 1]) { x.fillStyle = shutter; x.fillRect(sx < 0 ? cx - ww / 2 - 30 : cx + ww / 2 + 4, wy - 2, 26, wh + 4); x.fillStyle = 'rgba(0,0,0,.25)'; for (let l = 0; l < wh; l += 7) x.fillRect(sx < 0 ? cx - ww / 2 - 30 : cx + ww / 2 + 4, wy + l, 26, 2); }
        // sill + stain
        x.fillStyle = '#D9CCAE'; x.fillRect(cx - ww / 2 - 12, wy + wh + 7, ww + 24, 7);
        const st = x.createLinearGradient(0, wy + wh + 14, 0, wy + wh + 80); st.addColorStop(0, 'rgba(60,45,30,.18)'); st.addColorStop(1, 'rgba(60,45,30,0)'); x.fillStyle = st; x.fillRect(cx - ww / 2, wy + wh + 14, ww, 66);
        if (r() > .62) { x.fillStyle = '#EDEDED'; x.fillRect(cx + ww / 2 + 12, wy + wh * .5, 34, 24); x.fillStyle = 'rgba(0,0,0,.25)'; for (let l = 0; l < 24; l += 5) x.fillRect(cx + ww / 2 + 12, wy + 3 + wh * .5 + l, 34, 1.5); }
      }
      if (f === 1) { // balcony
        const bw = w * .46, bx = w / 2 - bw / 2, by = top + fh * .72;
        x.fillStyle = '#D8CBB0'; x.fillRect(bx - 8, by + 26, bw + 16, 12);
        x.fillStyle = '#2A2F32'; x.fillRect(bx, by - 2, bw, 5);
        for (let i = 0; i <= bw; i += 11) x.fillRect(bx + i, by, 4, 28);
        x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(bx, by + 38, bw, 10);
      }
    }
    const sh = x.createLinearGradient(0, h - 90, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(30,22,14,.3)'); x.fillStyle = sh; x.fillRect(0, h - 90, w, 90);
  }));
}
function sideTexture(variant) {
  return memo('side' + variant, () => canvasTex(512, 512, (x, w, h) => {
    const walls = ['#E3D3B3', '#EADFC9', '#D8BC9A', '#EFE6D6', '#D3B189', '#E8D8BE', '#E1C3BA', '#D6DDCE'];
    x.fillStyle = walls[variant % walls.length]; x.fillRect(0, 0, w, h); noise(x, w, h, 4000, 60, 190, .03, .1, 3, variant + 9);
    for (let f = 0; f < 3; f++) for (let c = 0; c < 2; c++) { const px = 90 + c * 250, py = 70 + f * 140; x.fillStyle = '#6E5440'; x.fillRect(px - 6, py - 6, 88, 94); x.fillStyle = '#7FA0AE'; x.fillRect(px, py, 76, 82); x.fillStyle = '#6E5440'; x.fillRect(px + 36, py, 4, 82); }
    const sh = x.createLinearGradient(0, h - 90, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(30,22,14,.3)'); x.fillStyle = sh; x.fillRect(0, h - 90, w, 90);
  }));
}
function shopFacadeTexture(names, variant) {
  return memo('shop' + names.join() + variant, () => canvasTex(1024, 640, (x, w, h) => {
    x.fillStyle = ['#D9BF9A', '#E2CFAE', '#CFA98E', '#DCD0B4'][variant % 4]; x.fillRect(0, 0, w, h); noise(x, w, h, 6000, 60, 190, .03, .1, 3, variant + 4);
    const r = rngFrom(variant * 13 + 1);
    for (let f = 0; f < 2; f++) for (let c = 0; c < 5; c++) { // apartments above
      const px = 40 + c * 196, py = 40 + f * 150;
      x.fillStyle = '#6A503C'; x.fillRect(px - 6, py - 6, 104, 104); x.fillStyle = '#7898A8'; x.fillRect(px, py, 92, 92); x.fillStyle = '#6A503C'; x.fillRect(px + 44, py, 4, 92);
      if (r() > .5) { x.fillStyle = ['#C8503C', '#3B7C92', '#E2B73C', '#6F9A59'][Math.floor(r() * 4)]; x.fillRect(px + 8, py + 14, 24, 60); }
      if (r() > .6) { x.fillStyle = '#EEE'; x.fillRect(px + 96, py + 40, 30, 22); }
    }
    const shopW = w / names.length;
    names.forEach((name, i) => {
      const px = i * shopW; x.fillStyle = ['#0F7A58', '#A44A33', '#174B71', '#7A4B73', '#B58A22', '#3B3B3B'][(i + variant) % 6]; x.fillRect(px + 6, 350, shopW - 12, 70);
      x.fillStyle = '#FFF3DA'; x.font = '900 44px system-ui'; x.textAlign = 'center'; x.direction = 'rtl'; x.textBaseline = 'middle'; x.fillText(name, px + shopW / 2, 386, shopW - 40);
      x.fillStyle = '#2C241E'; x.fillRect(px + 14, 430, shopW - 28, h - 440); x.fillStyle = 'rgba(190,215,220,.55)'; x.fillRect(px + 24, 440, shopW - 48, 120);
      x.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 6; k++) x.fillRect(px + 30 + k * 28, 450, 14, 100);
      x.fillStyle = ['#B85238', '#147154', '#193F66'][(i + variant) % 3]; x.beginPath(); x.moveTo(px + 6, 420); x.lineTo(px + shopW - 6, 420); x.lineTo(px + shopW - 20, 450); x.lineTo(px + 20, 450); x.fill();
    });
    x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, h - 12, w, 12);
  }));
}
function skyTexture() {
  return canvasTex(8, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4F86C0'); g.addColorStop(.34, '#8DB8DC'); g.addColorStop(.52, '#CFE0E4'); g.addColorStop(.62, '#F6E4C2'); g.addColorStop(.7, '#F9CF96'); g.addColorStop(1, '#F4C08A');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}
function glowTexture(inner, outer) {
  return canvasTex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, inner); g.addColorStop(.25, outer); g.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
}
function cloudTexture() {
  return canvasTex(256, 128, (x, w, h) => {
    const r = rngFrom(8);
    for (let i = 0; i < 16; i++) { const px = 40 + r() * 176, py = 50 + r() * 30, pr = 18 + r() * 26; const g = x.createRadialGradient(px, py, 0, px, py, pr); g.addColorStop(0, 'rgba(255,245,230,.85)'); g.addColorStop(1, 'rgba(255,240,220,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  });
}

/* ---------------------------------------------------------------- materials (cached, shared) */
const MAT = {};
function initMaterials() {
  if (MAT.ready) return;
  Object.assign(MAT, {
    ready: true,
    wallCream: stdMat('#E9DCC0', .95), wallBase: stdMat('#7C6A58', .95), wallCap: stdMat('#B9A98D', .9), pillar: stdMat('#DCCDB0', .9),
    bars: new THREE.MeshStandardMaterial({ map: barsTexture(), alphaTest: .5, side: THREE.DoubleSide, roughness: .6, metalness: .3 }),
    iron: stdMat('#23282B', .55, .5), concrete: stdMat('#B9B5AA', .95), concreteDark: stdMat('#8F8B82', .95), paveCorniche: stdMat('#CFC3A8', .95),
    trunk: stdMat('#7A5A3C', .95), trunkPalm: stdMat('#8A6C4A', .95), frond: new THREE.MeshStandardMaterial({ color: '#4E8A3E', roughness: .8, side: THREE.DoubleSide }),
    frond2: new THREE.MeshStandardMaterial({ color: '#68A04C', roughness: .8, side: THREE.DoubleSide }),
    leaf1: new THREE.MeshStandardMaterial({ color: '#4C7F3C', roughness: .9 }), leaf2: new THREE.MeshStandardMaterial({ color: '#5F9446', roughness: .9 }),
    leaf3: new THREE.MeshStandardMaterial({ color: '#3E6B35', roughness: .9 }),
    bougain: [new THREE.MeshStandardMaterial({ color: '#C4337A', roughness: .85, flatShading: true }), new THREE.MeshStandardMaterial({ color: '#E0568F', roughness: .85, flatShading: true }), new THREE.MeshStandardMaterial({ color: '#E3772F', roughness: .85, flatShading: true })],
    lampPole: stdMat('#3B4744', .6, .4), lampGlow: new THREE.MeshBasicMaterial({ color: '#FFE6A6' }),
    redTile: stdMat('#B65A3A', .9), tank: stdMat('#2D3A44', .7), tankLight: stdMat('#8DA2B2', .7), glassDark: stdMat('#2A3E4A', .2, .4),
    path: stdMat('#BDB29C', .95), hedge: new THREE.MeshStandardMaterial({ color: '#3F7236', roughness: .95, flatShading: true }),
    dome: stdMat('#2E7A5C', .45, .3), gold: stdMat('#D9B24A', .35, .8), mosqueWall: stdMat('#EFE8D6', .9),
    pole: stdMat('#9C9A92', .95), signBack: stdMat('#6F7374', .9), woodDark: stdMat('#4A3A2C', .9), slope: stdMat('#8D8472', 1), farBank: stdMat('#8FA3A8', 1),
    boatHull: stdMat('#5C3E2A', .9), sail: new THREE.MeshStandardMaterial({ color: '#F4EAD2', roughness: .9, side: THREE.DoubleSide }),
    kiosk: stdMat('#2F6B87', .8), bench: stdMat('#6A4B33', .9),
    shade: new THREE.MeshBasicMaterial({ color: 0x0b0a08, transparent: true, opacity: .38, depthWrite: false }),
    wire: new THREE.LineBasicMaterial({ color: 0x1b1b1d }),
    patch: stdMat('#2E2F32', .95), manhole: stdMat('#1E1F21', .5, .6), brick: stdMat('#9C4E34', .95), sandHeap: stdMat('#BCA67C', 1), barrier: new THREE.MeshStandardMaterial({ map: stripeTexture('#E8E4DA', '#C8302A'), roughness: .7 }), bump: new THREE.MeshStandardMaterial({ map: stripeTexture('#E9C22E', '#202022'), roughness: .85 }), gantrySign: new THREE.MeshBasicMaterial({ map: gantryTexture() }),
  });
  MAT.water = new THREE.MeshBasicMaterial({ map: waterTexture() });
  MAT.canalWater = new THREE.MeshBasicMaterial({ map: canalWaterTexture() });
  MAT.grass = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 });
  MAT.pavement = new THREE.MeshStandardMaterial({ map: pavementTexture(), normalMap: pavementNormal(), normalScale: new THREE.Vector2(1, 1), roughness: .95 });
}

/* ---------------------------------------------------------------- scenery pieces */
// Palms and trees are baked ONCE into a few merged meshes, then copied per use (much cheaper than 20 primitives each).
const protos = {};
function palmProto(variant) {
  const key = 'palm' + variant;
  if (!protos[key]) {
    const b = new Builder(), rnd = rngFrom(900 + variant * 31), h = 5;
    b.taper(MAT.trunkPalm, .12, .2, h, 0, h / 2, 0, .05 * (rnd() - .5), .06 * (rnd() - .5));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * .3, m = i % 2 ? MAT.frond : MAT.frond2, dx = Math.sin(a), dz = Math.cos(a);
      b.plane(m, .62, 1.5, dx * .55, h + .45, dz * .55, a, -.95);
      b.plane(m, .5, 1.3, dx * 1.3, h + .35, dz * 1.3, a, -1.7);
    }
    b.blob(MAT.trunkPalm, .2, 0, h - .1, 0, 1);
    protos[key] = b.build(false);
  }
  return protos[key];
}
function treeProto(variant) {
  const key = 'tree' + variant;
  if (!protos[key]) {
    const b = new Builder(), rnd = rngFrom(500 + variant * 17), h = 2;
    b.taper(MAT.trunk, .15, .22, h, 0, h / 2, 0);
    const mats = [MAT.leaf1, MAT.leaf2, MAT.leaf3];
    for (let i = 0; i < 4; i++) b.blob(mats[i % 3], .95 + rnd() * .5, (rnd() - .5) * 1.1, h + .5 + rnd() * .8, (rnd() - .5) * 1.1, .85);
    protos[key] = b.build(false);
  }
  return protos[key];
}
function palm(b, rnd, x, z, h = 4.6 + rnd() * 1.6) { b.object(palmProto(Math.floor(rnd() * 3)), x, 0, z, rnd() * 6.28, h / 5); }
function tree(b, rnd, x, z, big = 1) { b.object(treeProto(Math.floor(rnd() * 3)), x, 0, z, rnd() * 6.28, big); }
function lampPost(b, x, z, side) {
  b.taper(MAT.lampPole, .06, .09, 5.4, x, 2.7, z);
  b.box(MAT.lampPole, .8, .08, .08, x - side * .38, 5.38, z, 0, 0, side * .08);
  b.box(MAT.lampPole, .5, .1, .26, x - side * .8, 5.34, z);
  b.box(MAT.lampGlow, .42, .05, .2, x - side * .8, 5.27, z);
}
function utilityPole(b, x, z, side) {
  b.taper(MAT.pole, .1, .15, 8.2, x, 4.1, z);
  b.box(MAT.pole, .12, .14, 1.9, x, 7.6, z);
  b.box(MAT.pole, 1.5, .1, .12, x, 7.4, z);
  for (const dz of [-.8, 0, .8]) b.cyl(MAT.concreteDark, .06, .16, x, 7.78, z + dz);
}
function wires(side) {
  const pts = [];
  for (const dz of [-.8, 0, .8]) {
    let prev = null;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, z = L / 2 - t * L, y = 7.78 - Math.sin(t * Math.PI) * .55;
      const p = [side * 8.5, y, z + dz * 0]; // wires run along the road; offset x slightly per wire
      p[0] += dz * .5;
      if (prev) pts.push(...prev, ...p); prev = p;
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, MAT.wire); lines.frustumCulled = false; return lines;
}
function parkedCar(b, rnd, x, z, face = 1) {
  const car = rnd() > .22 ? makeSedan() : makeMicrobus(pick(rnd, ['بنها - القاهرة', 'بنها - طوخ', 'بنها - شبرا']));
  b.object(car, x, 0, z, face > 0 ? 0 : Math.PI, .72);
}
function streetFurniture(b, rnd, s, { lamp = true, trees = true } = {}) {
  if (lamp) lampPost(b, s * 6.0, (rnd() - .5) * 3, s);
  if (trees) { const n = 2; for (let i = 0; i < n; i++) { const z = -L / 2 + (i + .5) * L / n + (rnd() - .5) * 2; rnd() > .5 ? palm(b, rnd, s * 8.1, z, 4 + rnd()) : tree(b, rnd, s * 8.1, z, .85); } }
}

/* ---------- villa ---------- */
function villa(b, rnd, s, opts = {}) {
  const variant = Math.floor(rnd() * 8), floors = variant % 3 === 0 ? 3 : 2;
  const w = opts.w || (8 + rnd() * 1.8), zc = opts.zc ?? ((rnd() - .5) * (L - w - 2));
  const h = floors * 3.1 + .6, depth = 7;
  const facadeMat = memo('fm' + variant, () => new THREE.MeshStandardMaterial({ map: facadeTexture(variant), roughness: .92, normalMap: memo('plasterN', plasterNormal), normalScale: new THREE.Vector2(.5, .5) }));
  const sideMat = memo('sm' + variant, () => new THREE.MeshStandardMaterial({ map: sideTexture(variant), roughness: .92, normalMap: memo('plasterN', plasterNormal), normalScale: new THREE.Vector2(.5, .5) }));
  const wallColors = ['#E3D3B3', '#EADFC9', '#D8BC9A', '#EFE6D6', '#D3B189', '#E8D8BE', '#E1C3BA', '#D6DDCE'];
  const bodyMat = stdMat(wallColors[variant % 8], .95);
  const cx = s * (VILLA_X + depth / 2);
  b.box(bodyMat, depth, h, w, cx, h / 2, zc);
  b.plane(facadeMat, w, h, s * (VILLA_X - .02), h / 2, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.plane(sideMat, depth, h, cx, h / 2, zc + w / 2 + .02, 0);
  // roof: parapet, tanks, stair room, dish — or a red hip roof
  if (variant % 4 === 1) {
    b.pyramid(MAT.redTile, Math.max(w, depth) * .82, 2.1, cx, h + 1.0, zc, Math.PI / 4, depth / Math.max(w, depth), w / Math.max(w, depth));
  } else {
    b.box(bodyMat, depth + .3, .5, .2, cx, h + .25, zc + w / 2); b.box(bodyMat, depth + .3, .5, .2, cx, h + .25, zc - w / 2);
    b.box(bodyMat, .2, .5, w, s * (VILLA_X - .02), h + .25, zc); b.box(bodyMat, .2, .5, w, s * (VILLA_X + depth), h + .25, zc);
    b.box(bodyMat, 2.2, 2.2, 2.4, cx + s * 1.6, h + 1.1, zc - w * .25);
    b.cyl(rnd() > .5 ? MAT.tank : MAT.tankLight, .55, 1.1, cx - s * 1.2, h + 1.05, zc + w * .2); b.cyl(MAT.tank, .5, 1.0, cx - s * 2.2, h + 1.0, zc + w * .3);
    b.sphere(MAT.concrete, .5, cx + s * .2, h + 1.0, zc + w * .38, 1, .4, 1); // satellite dish
  }
  // balcony slab + columns + entrance canopy
  b.box(MAT.concrete, 1.0, .18, w * .46, s * (VILLA_X - .5), 3.1, zc);
  b.box(MAT.iron, .05, .1, w * .46, s * (VILLA_X - 1.0), 4.1, zc);
  for (let i = 0; i < 9; i++) b.box(MAT.iron, .04, .9, .04, s * (VILLA_X - 1.0), 3.6, zc - w * .23 + i * (w * .46 / 8));
  for (const dz of [-1.6, 1.6]) b.cyl(MAT.pillar, .15, 2.6, s * (VILLA_X - .85), 1.3, zc + dz);
  b.box(MAT.concrete, 1.15, .18, 3.9, s * (VILLA_X - .55), 2.7, zc);
  // garden: lawn path, hedge, trees, flowers
  b.box(MAT.path, 4.0, .04, 2.6, s * 10.4, .0, zc);
  for (const dz of [-1, 1]) b.box(MAT.hedge, 3.2, .6, .6, s * 9.6, .3, zc + dz * 2.1);
  if (rnd() > .3) palm(b, rnd, s * 10.1, zc + w * .32 + .6, 4.4 + rnd() * 1.6);
  if (rnd() > .4) tree(b, rnd, s * 10.4, zc - w * .34 - .4, 1);
  for (let i = 0; i < 3; i++) b.blob(MAT.bougain[i % 3], .34, s * 9.3, .35, zc + (i - 1) * 2.8 + (rnd() - .5), .7);
  // compound wall + gate
  const gateW = 3.3, g0 = zc - gateW / 2, g1 = zc + gateW / 2, wx = s * WALL_X;
  const wallSeg = (z0, z1) => {
    const len = z1 - z0; if (len < .3) return; const mz = (z0 + z1) / 2;
    b.box(MAT.wallBase, .38, .55, len, wx, .275, mz); b.box(MAT.wallCream, .34, 1.15, len, wx, 1.12, mz);
    b.box(MAT.wallCap, .5, .12, len, wx, 1.76, mz);
    b.plane(MAT.bars, len, .85, wx, 2.22, mz, Math.PI / 2, 0, 0, [len / 1.1, 1]);
    for (let z = z0 + .8; z < z1 - .4; z += 3.4) b.box(MAT.pillar, .55, 2.5, .55, wx, 1.25, z);
  };
  wallSeg(-L / 2, g0 - .25); wallSeg(g1 + .25, L / 2);
  for (const z of [g0 - .1, g1 + .1]) { b.box(MAT.pillar, .75, 2.6, .75, wx, 1.3, z); b.box(MAT.wallCap, .9, .14, .9, wx, 2.66, z); b.sphere(MAT.gold, .17, wx, 2.88, z); }
  b.plane(MAT.bars, gateW - .5, 1.9, wx, 1.2, zc, Math.PI / 2, 0, 0, [(gateW - .5) / 1.1, 1.2]);
  b.box(MAT.iron, .06, .1, gateW - .4, wx, 2.2, zc);
  // bougainvillea spilling over the wall
  for (let i = 0; i < 4; i++) b.blob(MAT.bougain[Math.floor(rnd() * 3)], .45 + rnd() * .3, wx + s * .1, 2.35 + rnd() * .3, -L / 2 + 1.5 + rnd() * (L - 3), .6);
  // house-number plate on the pillar
  return { zc, w };
}

/* ---------- apartment towers: what الفلل in Banha mostly looks like (5-7 floor blocks, shops below, laundry, AC) ---------- */
const TOWER_W = 13, TOWER_PX_M = 768 / 13;
function towerFacadeTexture(variant, floors, names) {
  return memo(`tower${variant}|${floors}|${names.join()}`, () => {
    const W = 768, shopH = 250, fh = 177, topH = 50, H = shopH + floors * fh + topH;
    return canvasTex(W, H, (x) => {
      const r = rngFrom(variant * 131 + floors * 7 + names.length);
      const style = variant % 4, wall = ['#E6D9BC', '#B25A3F', '#E2B89A', '#A9A59B'][style];
      x.fillStyle = wall; x.fillRect(0, 0, W, H);
      if (style === 1 || style === 3) {
        const bw = 26, bh = 11;
        for (let yy = 0; yy < H - shopH; yy += bh) for (let xx = ((yy / bh) % 2) * bw / 2 - bw; xx < W; xx += bw) {
          x.fillStyle = style === 1 ? `rgb(${160 + r() * 40},${70 + r() * 30},${48 + r() * 20})` : `rgb(${150 + r() * 30},${130 + r() * 25},${110 + r() * 20})`; x.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
        }
      } else noise(x, W, H, 7000, 60, 200, .03, .1, 3, variant + 5);
      // reinforced-concrete frame
      x.fillStyle = style === 3 ? '#8C8A84' : 'rgba(220,210,190,.92)';
      for (let f = 0; f <= floors; f++) x.fillRect(0, topH + f * fh - 7, W, 14);
      for (let c = 0; c <= 4; c++) x.fillRect(c * (W / 4) - 9, topH, 18, floors * fh);
      x.fillStyle = 'rgba(0,0,0,.18)'; for (let f = 0; f <= floors; f++) x.fillRect(0, topH + f * fh + 7, W, 4);
      const curtains = ['#C9A24A', '#B4503C', '#E4DED0', '#5D7F52', '#7A5A8B', '#3F6C8F'];
      for (let f = 0; f < floors; f++) for (let c = 0; c < 4; c++) {
        const bx = c * (W / 4) + W / 8, y0 = topH + f * fh, balcony = r() > .38;
        if (balcony) {
          const bwid = 150, by = y0 + fh - 16;
          x.fillStyle = '#2A3A46'; x.fillRect(bx - 58, y0 + 28, 116, fh - 56);            // glass door opening
          const g = x.createLinearGradient(0, y0 + 28, 0, y0 + fh - 28); g.addColorStop(0, '#6E8FA0'); g.addColorStop(1, '#3F6072'); x.fillStyle = g; x.fillRect(bx - 54, y0 + 32, 108, fh - 64);
          if (r() > .35) { x.fillStyle = curtains[Math.floor(r() * 6)]; x.fillRect(bx - 54, y0 + 32, 40 + r() * 30, fh - 64); }
          x.fillStyle = '#D9CCAE'; x.fillRect(bx - bwid / 2, by, bwid, 12);                // slab
          x.fillStyle = '#2A2F32'; x.fillRect(bx - bwid / 2, by - 46, bwid, 4);            // rail
          for (let i = 0; i <= bwid; i += 12) x.fillRect(bx - bwid / 2 + i, by - 46, 3, 46);
          if (r() > .55) { // laundry
            x.strokeStyle = '#444'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx - 70, y0 + 24); x.lineTo(bx + 70, y0 + 24); x.stroke();
            for (let i = 0; i < 4; i++) { x.fillStyle = ['#D8423B', '#3F7FBF', '#F0D24A', '#EDEDED', '#6FAF5F'][Math.floor(r() * 5)]; x.fillRect(bx - 64 + i * 32, y0 + 26, 22, 28 + r() * 14); }
          }
        } else {
          x.fillStyle = '#6A503C'; x.fillRect(bx - 44, y0 + 36, 88, 92);
          const g = x.createLinearGradient(0, y0 + 40, 0, y0 + 124); g.addColorStop(0, '#7FA0B0'); g.addColorStop(1, '#496A7C'); x.fillStyle = g; x.fillRect(bx - 38, y0 + 42, 76, 80);
          x.fillStyle = '#6A503C'; x.fillRect(bx - 2, y0 + 42, 4, 80);
          if (r() > .5) { x.fillStyle = curtains[Math.floor(r() * 6)]; x.fillRect(bx - 38, y0 + 42, 30, 80); }
          x.fillStyle = '#D9CCAE'; x.fillRect(bx - 50, y0 + 128, 100, 8);
        }
        if (r() > .62) { const ax = bx + (r() > .5 ? 60 : -92), ay = y0 + 40 + r() * 20; x.fillStyle = '#EEEEEA'; x.fillRect(ax, ay, 34, 24); x.fillStyle = 'rgba(0,0,0,.25)'; for (let l = 3; l < 24; l += 5) x.fillRect(ax, ay + l, 34, 1.5); x.fillStyle = 'rgba(60,45,30,.2)'; x.fillRect(ax + 14, ay + 24, 5, 50); }
        if (r() > .75) { x.fillStyle = '#9AA0A5'; x.beginPath(); x.arc(bx + 70, y0 + 22, 11, 0, 7); x.fill(); }
        const st = x.createLinearGradient(0, y0 + fh, 0, y0 + fh + 70); st.addColorStop(0, 'rgba(50,38,28,.2)'); st.addColorStop(1, 'rgba(50,38,28,0)'); x.fillStyle = st; x.fillRect(bx - 60, y0 + fh, 120, 70);
      }
      // parapet
      x.fillStyle = 'rgba(235,228,210,.95)'; x.fillRect(0, 0, W, topH - 6); x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(0, topH - 6, W, 5);
      // ground-floor shops
      const sy = H - shopH, n = names.length, sw = W / n;
      x.fillStyle = '#6F6A60'; x.fillRect(0, sy, W, shopH);
      names.forEach((name, i) => {
        const px = i * sw; const col = ['#0F7A58', '#A44A33', '#174B71', '#7A4B73', '#B58A22', '#3B3B3B'][(i + variant) % 6];
        x.fillStyle = col; x.fillRect(px + 8, sy + 18, sw - 16, 58);
        x.fillStyle = '#FFF3DA'; x.font = '900 40px system-ui'; x.textAlign = 'center'; x.direction = 'rtl'; x.textBaseline = 'middle'; x.fillText(name, px + sw / 2, sy + 48, sw - 40);
        const closed = r() > .72;
        if (closed) { x.fillStyle = '#8D9196'; x.fillRect(px + 14, sy + 82, sw - 28, shopH - 90); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; for (let yy = sy + 86; yy < H - 8; yy += 9) { x.beginPath(); x.moveTo(px + 14, yy); x.lineTo(px + sw - 14, yy); x.stroke(); } }
        else {
          x.fillStyle = '#2A241E'; x.fillRect(px + 14, sy + 82, sw - 28, shopH - 90); x.fillStyle = 'rgba(190,215,220,.5)'; x.fillRect(px + 24, sy + 92, sw - 48, 100);
          for (let k = 0; k < 7; k++) { x.fillStyle = ['#D8423B', '#F0D24A', '#3F7FBF', '#6FAF5F', '#EDEDED'][Math.floor(r() * 5)]; x.fillRect(px + 30 + k * ((sw - 70) / 7), 150 + sy - 40 + r() * 20, 22, 36); }
        }
        x.fillStyle = ['#B85238', '#147154', '#193F66', '#C99A2E'][(i + variant) % 4];
        x.beginPath(); x.moveTo(px + 6, sy + 78); x.lineTo(px + sw - 6, sy + 78); x.lineTo(px + sw - 20, sy + 104); x.lineTo(px + 20, sy + 104); x.fill();
      });
      x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, H - 10, W, 10);
    });
  });
}
function brickSideTexture(variant) {
  return memo('brickside' + variant, () => canvasTex(512, 768, (x, w, h) => {
    const r = rngFrom(variant + 40), plaster = variant % 2 === 0;
    x.fillStyle = plaster ? '#D8CBB0' : '#A85A40'; x.fillRect(0, 0, w, h);
    if (!plaster) for (let yy = 0; yy < h; yy += 11) for (let xx = ((yy / 11) % 2) * 13 - 26; xx < w; xx += 26) { x.fillStyle = `rgb(${155 + r() * 45},${68 + r() * 30},${46 + r() * 20})`; x.fillRect(xx + 1, yy + 1, 24, 9); }
    else noise(x, w, h, 5000, 60, 190, .03, .1, 3, variant);
    for (let k = 0; k < 4; k++) { const px = 60 + r() * 360, py = 40 + r() * 620; x.fillStyle = '#5A4636'; x.fillRect(px - 4, py - 4, 48, 58); x.fillStyle = '#6E8FA0'; x.fillRect(px, py, 40, 50); }
    const sh = x.createLinearGradient(0, h - 110, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(30,22,14,.35)'); x.fillStyle = sh; x.fillRect(0, h - 110, w, 110);
  }));
}
function canalWaterTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#5F6E49'; x.fillRect(0, 0, w, h); const r = rngFrom(12);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${150 + r() * 80},${160 + r() * 60},${110 + r() * 40},${.05 + r() * .12})`; x.fillRect(r() * w, r() * h, 8 + r() * 30, 1.5 + r() * 2); }
    for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(70,90,50,.35)'; x.beginPath(); x.arc(r() * w, r() * h, 3 + r() * 9, 0, 7); x.fill(); }
  }, { repeat: [2, 4] });
}

function tower(b, rnd, s) {
  const floors = rnd() > .5 ? 7 : 5, variant = Math.floor(rnd() * 8), w = TOWER_W, depth = 8;
  const names = []; const pool = VILLAS_PLACES.shops.slice(); const count = rnd() > .5 ? 3 : 2;
  for (let i = 0; i < count; i++) names.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const h = 4.2 + floors * 3 + .85, zc = (rnd() - .5) * .8, fx = s * 9.0;
  const bodyCols = ['#D9C8A6', '#A85A40', '#D6A98A', '#9E9A90'], body = stdMat(bodyCols[variant % 4], .95);
  const m = memo(`towerm${variant}|${floors}|${names.join()}`, () => new THREE.MeshStandardMaterial({ map: towerFacadeTexture(variant, floors, names), roughness: .92, normalMap: memo('plasterN', plasterNormal), normalScale: new THREE.Vector2(.45, .45) }));
  const sideM = memo('bsm' + variant, () => new THREE.MeshStandardMaterial({ map: brickSideTexture(variant), roughness: .95 }));
  b.box(body, depth, h, w, fx + s * depth / 2, h / 2, zc);
  b.plane(m, w, h, fx - s * .02, h / 2, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.plane(sideM, depth, h, fx + s * depth / 2, h / 2, zc + w / 2 + .02, 0);
  // shop awnings projecting over the pavement
  const aw = [stdMat('#B85238', .8), stdMat('#147154', .8), stdMat('#193F66', .8)];
  const sw = w / names.length;
  names.forEach((_, i) => b.box(aw[(i + variant) % 3], 1.1, .1, sw - .5, fx - s * .55, 3.35, zc - w / 2 + sw * (i + .5), 0, 0, s * .2));
  // balcony slabs standing out from the facade
  for (let f = 0; f < floors; f++) for (const c of [0, 2]) {
    const bz = zc - w / 2 + w / 8 + (c + (f % 2)) * (w / 4); b.box(MAT.concrete, .9, .14, 2.3, fx - s * .45, 4.2 + f * 3 + 2.65, bz);
  }
  // roof clutter: parapet, tanks, antennas and the classic rebar columns waiting for the next floor
  b.box(body, depth, .5, .2, fx + s * depth / 2, h + .1, zc + w / 2); b.box(body, depth, .5, .2, fx + s * depth / 2, h + .1, zc - w / 2);
  for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) b.cyl(rnd() > .5 ? MAT.tank : MAT.tankLight, .55, 1.1, fx + s * (1.5 + rnd() * 5), h + 1.05, zc + (rnd() - .5) * (w - 2));
  if (rnd() > .45) for (let i = 0; i < 4; i++) { const rz = zc - 4 + i * 2.6, rx = fx + s * 6.8; b.box(MAT.concreteDark, .3, 1.5, .3, rx, h + 1.0, rz); for (const d of [-.1, .1]) b.box(MAT.iron, .03, .7, .03, rx + d, h + 2.1, rz + d); }
  if (rnd() > .5) b.box(MAT.iron, .05, 3.2, .05, fx + s * 3, h + 2.1, zc + 2);
  // sidewalk vendor
  if (rnd() > .35) vendor(b, rnd, s, zc + (rnd() - .5) * 8);
  if (rnd() > .5) parkedCar(b, rnd, s * 4.55, (rnd() - .5) * 9, s > 0 ? 1 : -1);
  if (rnd() > .5) parkedCar(b, rnd, s * 4.55, (rnd() - .5) * 9 + 5, s > 0 ? 1 : -1);
  lampPost(b, s * 6.0, 4, s);
  if (rnd() > .7) tree(b, rnd, s * 8.2, -L / 2 + 1.4, .75);
}
function vendor(b, rnd, s, z) {
  const umb = pick(rnd, ['#D8423B', '#F0B429', '#2F7FBF', '#3E9B5A', '#E8E2D0']), x = s * 7.4;
  b.cyl(MAT.iron, .03, 2.2, x, 1.1, z); b.pyramid(stdMat(umb, .8), 1.5, .5, x, 2.35, z, Math.PI / 4);
  b.box(MAT.bench, .9, .8, 1.6, x, .4, z); b.box(stdMat('#E8DCC0', .9), .95, .05, 1.65, x, .82, z);
  for (let i = 0; i < 6; i++) b.blob(stdMat(pick(rnd, ['#D8423B', '#F0B429', '#6FAF5F', '#E88A2B']), .8), .13, x + (rnd() - .5) * .6, .98, z + (rnd() - .5) * 1.3, .8);
  for (let i = 0; i < 3; i++) b.box(stdMat(pick(rnd, ['#E07B1F', '#2F7FBF', '#C9A24A']), .8), .5, .3, .4, x + s * .9, .15 + (i % 2) * .3, z - .6 + i * .5);
}
function streetSign(b, s, text) {
  const mat = memo('stsign' + text, () => new THREE.MeshBasicMaterial({ map: textTexture(text, { bg: '#0F4C81', color: '#FFFFFF', width: 384, height: 96, size: 52, border: '#FFFFFF' }) }));
  b.cyl(MAT.lampPole, .045, 3.3, s * 6.35, 1.65, 0); b.plane(mat, 1.6, .42, s * 6.35, 3.1, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
}

/* ---------- شارع الترعة: a canal-side street (800 m long in reality) ---------- */
function canal(b, rnd, s) {
  b.plane(MAT.paveCorniche, 1.7, L, s * 9.45, -.03, 0, 0, -Math.PI / 2);
  const rx = s * 10.2; // steel railing
  b.box(MAT.iron, .06, .06, L, rx, 1.0, 0); b.box(MAT.iron, .06, .06, L, rx, .55, 0);
  for (let z = -L / 2 + .5; z < L / 2; z += 2) b.box(stdMat('#2F5C86', .6), .09, 1.05, .09, rx, .52, z);
  b.box(MAT.concrete, .5, 2.0, L + .1, s * 10.6, -.9, 0);                                   // retaining wall
  b.plane(MAT.canalWater, 6.5, L + .1, s * 14, -1.85, 0, 0, -Math.PI / 2);
  b.box(MAT.concrete, .5, 2.0, L + .1, s * 17.4, -.9, 0);
  b.plane(stdMat('#9B8C6C', 1), 6, L + .1, s * 20.5, -.04, 0, 0, -Math.PI / 2);          // dusty opposite bank
  for (let i = 0; i < 3; i++) tree(b, rnd, s * (18.5 + rnd() * 2.5), -L / 2 + 2 + i * 4.5 + rnd(), .8 + rnd() * .4);
  if (rnd() > .5) palm(b, rnd, s * 19, (rnd() - .5) * 10, 4.5 + rnd());
  for (let i = 0; i < 3; i++) { const bh = 8 + rnd() * 8, bz = -L / 2 + 2 + i * 4.6; b.box(stdMat(pick(rnd, ['#D8CBB0', '#A85A40', '#C9B08A']), .95), 6, bh, 4, s * 27, bh / 2, bz); }
  b.plane(MAT.grass, 40, L + .05, s * 45, -.05, 0, 0, -Math.PI / 2, 0, [8, 3]);
  lampPost(b, s * 6.0, 2, s);
}

function shadeBox(group, y, len) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + .5, len), MAT.shade); m.rotation.x = -Math.PI / 2; m.position.set(0, y, 0); group.add(m);
}

/* ---------- mosque ---------- */
function mosque(b, rnd, s) {
  const cx = s * 15.7, sign = memo('mosque' + VILLAS_PLACES.mosque, () => new THREE.MeshBasicMaterial({ map: textTexture(VILLAS_PLACES.mosque, { bg: '#0F6B4D', color: '#FFF3D0', width: 512, height: 96, size: 54 }) }));
  b.box(MAT.mosqueWall, 8, 6.4, 9.6, cx, 3.2, -.5);
  b.box(MAT.wallBase, .4, .5, 12.6, s * 11.1, .25, 0); b.box(MAT.mosqueWall, .3, 1.2, 12.6, s * 11.1, 1.1, 0);
  for (let i = -2; i <= 2; i++) { b.box(MAT.dome, 1.1, 2.6, .6, s * (11.6), 1.9, i * 1.9 - .5); b.box(MAT.concreteDark, 1.0, 2.4, .5, s * 11.58, 1.8, i * 1.9 - .5); }
  b.sphere(MAT.dome, 3.4, cx, 6.4, -.5, 1, .85, 1);
  b.sphere(MAT.gold, .35, cx, 9.5, -.5); b.cyl(MAT.gold, .04, 1.1, cx, 9.9, -.5);
  b.cyl(MAT.mosqueWall, .62, 12.6, s * 12.1, 6.3, -5.4); b.cyl(MAT.concrete, .85, .3, s * 12.1, 9.3, -5.4); b.cyl(MAT.mosqueWall, .5, 1.9, s * 12.1, 10.5, -5.4);
  b.sphere(MAT.dome, .55, s * 12.1, 11.6, -5.4, 1, 1.4, 1); b.cyl(MAT.gold, .03, 1.0, s * 12.1, 12.9, -5.4);
  b.plane(sign, 5.4, 1.0, s * 12.16, 5.5, -.5, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.box(MAT.dome, .08, .22, 12.4, s * 11.15, 2.4, 0);
  palm(b, rnd, s * 9.5, 4.8, 5.2); palm(b, rnd, s * 9.6, -5.0, 4.7);
  lampPost(b, s * 6.0, 1, s);
}

/* ---------- shop strip ---------- */
function shops(b, rnd, s, variant) {
  const names = [];
  const pool = VILLAS_PLACES.shops.slice();
  for (let i = 0; i < 3; i++) names.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const m = memo('shopm' + names.join() + variant, () => new THREE.MeshStandardMaterial({ map: shopFacadeTexture(names, variant), roughness: .92 }));
  const h = 9.6, d = 7, fx = s * 8.7;
  b.box(stdMat('#D6BE9A', .95), d, h, L - .6, fx + s * d / 2, h / 2, 0);
  b.plane(m, L - .6, h, fx - s * .02, h / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.box(MAT.concrete, .6, .14, L - .6, fx - s * .3, 3.0, 0);
  for (let i = 0; i < 3; i++) b.box(stdMat(['#B85238', '#147154', '#193F66'][(i + variant) % 3], .8), 1.0, .12, 4, fx - s * .7, 3.15, -4.6 + i * 4.6, 0, 0, s * .22);
  b.box(MAT.concrete, 7.2, .4, L - .4, fx + s * d / 2, h + .2, 0);
  b.cyl(MAT.tank, .55, 1.1, fx + s * 3, h + .95, 2);
  { const kz = -5 + rnd() * 6; b.box(MAT.kiosk, .9, 1.9, 1.3, s * 7.3, .95, kz); b.box(stdMat('#B85238', .8), 1.3, .12, 1.7, s * 7.1, 2.0, kz); b.box(MAT.glassDark, .05, .7, .9, s * 6.84, 1.2, kz); }
  lampPost(b, s * 6.0, 4, s);
}

/* ---------- side street ---------- */
function sideStreet(b, rnd, s) {
  const asphalt = stdMat('#58595C', .96), line = stdMat('#EFE9DA', .8);
  b.plane(asphalt, 26, 9, s * 21.6, -.02, 0, 0, -Math.PI / 2);
  for (let i = 0; i < 6; i++) b.box(line, .5, .02, 8.6, s * (2 + 0), 0, 0); // (hidden under road, keeps builder simple)
  for (let i = 0; i < 7; i++) b.box(line, 1.3, .02, .35, s * (13 + i * 3), .0, 0);
  const bld = (z) => {
    const h2 = 7 + rnd() * 3, v = Math.floor(rnd() * 8);
    b.box(stdMat('#D8C6A4', .95), 8, h2, 4.2, s * 13, h2 / 2, z);
    b.plane(facadeTexture(v), 4.2, h2 * .92, s * 9.0, h2 / 2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  };
  bld(-6.6); bld(6.6);
  parkedCar(b, rnd, s * 13.5, 2.2, 1);
  for (let i = 0; i < 8; i++) b.box(line, .35, .02, 1.0, s * 8.1, 0, -4 + i * 1.15);
  lampPost(b, s * 6.0, 4, s);
}


/* ---------- road-level details: speed bump, manhole, patches, barriers, bricks, sand, gantry ---------- */
function stripeTexture(a, bcol) {
  return canvasTex(256, 64, (x, w, h) => { x.fillStyle = a; x.fillRect(0, 0, w, h); x.fillStyle = bcol; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, h); x.lineTo(i * 32 + 16, h); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 16, 0); x.fill(); } noise(x, w, h, 500, 40, 140, .05, .25, 2, 9); }, {});
}
function gantryTexture() {
  return canvasTex(1024, 256, (x, w, h) => {
    x.fillStyle = '#0B6B47'; x.fillRect(0, 0, w, h); x.strokeStyle = '#F4EBD0'; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#F4EBD0'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.font = 'bold 92px Tahoma, Arial, sans-serif';
    x.fillText(VILLAS_PLACES.bridgeSign, w / 2, h * .38); x.font = 'bold 54px Tahoma, Arial, sans-serif'; x.fillText('Banha Bridge', w / 2, h * .76);
    for (const ax of [120, 904]) { x.beginPath(); x.moveTo(ax - 40, 70); x.lineTo(ax + 40, 70); x.lineTo(ax, 190); x.fill(); }
    noise(x, w, h, 1500, 30, 90, .03, .12, 2, 4);
  }, {});
}
function roadProps(b, rnd, idx, p) {
  const g = new THREE.Group();
  if (idx % 3 === 0) { b.box(MAT.patch, 1.5 + rnd() * 1.2, .012, 2 + rnd() * 2, (rnd() - .5) * 7.5, .014, (rnd() - .5) * 9); }
  if (idx % 4 === 1) { const mx = (rnd() > .5 ? 1 : -1) * (1.5 + rnd() * 2); b.cyl(MAT.manhole, .4, .02, mx, .018, rnd() * 6 - 3); }
  if (idx % 5 === 2 && !p.bridge) { // speed bump
    b.box(MAT.bump, 11, .075, 1.0, 0, .035, -2 + rnd() * 4); }
  for (const s of [-1, 1]) {
    const k = Math.floor(rnd() * 5);
    const x = s * (6.6 + rnd() * .9), z = (rnd() - .5) * 8;
    if (k === 0) { // brick pile
      for (let i = 0; i < 3; i++) b.box(MAT.brick, 1.1 - i * .2, .22, .8 - i * .1, x, .11 + i * .22, z, rnd() * .3 - .15);
    } else if (k === 1) { // sand heap
      b.pyramid(MAT.sandHeap, 1.0, .7, x, .35, z, rnd() * 3, 1.2, 1); b.blob(MAT.sandHeap, .55, x + .5, .15, z + .3, .5);
    } else if (k === 2) { // roadwork barrier (red/white)
      for (const dx of [-.55, .55]) b.box(MAT.iron, .05, .85, .05, x + dx, .42, z);
      b.box(MAT.barrier, 1.4, .26, .05, x, .72, z); b.box(MAT.barrier, 1.4, .26, .05, x, .38, z);
    } else if (k === 3) { // cinder-block stack
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) b.box(MAT.concreteDark, .4, .2, .2, x + (j - 1) * .42, .1 + i * .2, z);
    }
  }
  return g;
}
function gantry(b) {
  const w = 13.6, y = 8.2;
  for (const x of [-w / 2, w / 2]) { b.box(MAT.signBack, .32, y, .32, x, y / 2, 0); b.box(MAT.concreteDark, .7, .25, .7, x, .12, 0); }
  b.box(MAT.signBack, w + .3, .38, .38, 0, y, 0); b.box(MAT.signBack, 9.2, .22, .22, 0, y - 2.5, 0);
  b.plane(MAT.gantrySign, 9, 2.25, 0, y - 1.3, .2); b.plane(MAT.gantrySign, 9, 2.25, 0, y - 1.3, -.2, Math.PI);
  for (const x of [-3.8, 0, 3.8]) b.box(MAT.signBack, .08, 2.5, .08, x, y - 1.25, 0);
}

/* ---------- Banha bridge ---------- */
function buildBridge() {
  const b = new Builder(), len = 10;
  const sign = memo('bridgesign' + VILLAS_PLACES.bridgeSign, () => new THREE.MeshBasicMaterial({ map: textTexture(VILLAS_PLACES.bridgeSign, { bg: '#0E6B4C', color: '#FFF3D0', width: 768, height: 140, size: 84, border: '#F3E2B2' }) }));
  const deckY = 6.4;
  b.box(MAT.concrete, 64, 1.1, len, 0, deckY, 0);
  b.box(MAT.concreteDark, 64, .5, len - .6, 0, deckY - .8, 0);
  for (let x = -18; x <= 18; x += 4.5) b.box(MAT.concreteDark, .9, .5, len - .4, x, deckY - .95, 0);
  for (const z of [-len / 2 + .2, len / 2 - .2]) { b.box(MAT.concrete, 64, 1.0, .4, 0, deckY + 1.0, z); b.box(MAT.concreteDark, 64, .12, .55, 0, deckY + 1.55, z); }
  for (const x of [-11.6, 11.6]) { b.box(MAT.concrete, 2.2, deckY - .5, 4.6, x, (deckY - .5) / 2, 0); b.box(MAT.concreteDark, 2.8, .45, 5.4, x, deckY - .75, 0); }
  b.plane(sign, 11, 2.0, 0, deckY + 2.55, len / 2 - .1, 0);
  b.box(MAT.signBack, 11.2, 2.2, .12, 0, deckY + 2.55, len / 2 - .22);
  for (const x of [-5.8, 5.8]) b.box(MAT.signBack, .14, 2.3, .14, x, deckY + 2.45, len / 2 - .22);
  for (const x of [-22, -12, 12, 22]) lampPost(b, x, len / 2 - .6, x < 0 ? 1 : -1);
  const g = b.build(false);
  shadeBox(g, .03, len);
  return g;
}

/* ---------------------------------------------------------------- world */
export function createVillasWorld(scene, camera, { sun, hemi, renderer, envUrl, startIdx = 0 } = {}) {
  initMaterials();
  const root = new THREE.Group(); scene.add(root);
  const bendFree = [];

  // atmosphere
  scene.background = new THREE.Color('#F1CFA3'); scene.fog = new THREE.Fog('#E9CBA2', 52, 128);
  if (hemi) { hemi.color.set('#FFF0D8'); hemi.groundColor.set('#8A7660'); hemi.intensity = envUrl ? .8 : 1.0; }
  if (sun) { sun.color.set('#FFC88A'); sun.intensity = 2.5; sun.position.set(-18, 15, -4); }
  // Real sunset HDRI (Poly Haven, CC0) used ONLY for lighting + reflections; the visible sky stays our own dome.
  let envTexture = null;
  if (envUrl && renderer) {
    new HDRLoader().load(envUrl, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer); envTexture = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = envTexture; scene.environmentIntensity = .5; hdr.dispose(); pmrem.dispose();
    }, undefined, () => { if (hemi) hemi.intensity = 1.0; });
  }
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }); skyMat.userData.noBend = true;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(118, 24, 16), skyMat); sky.renderOrder = -10; root.add(sky); bendFree.push(sky);
  const sunMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,252,232,1)', 'rgba(255,214,140,.55)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); sunMat.userData.noBend = true;
  const sunSprite = new THREE.Sprite(sunMat); sunSprite.scale.set(26, 26, 1); sunSprite.position.set(-30, 15, -108); root.add(sunSprite);
  const cloudTex = cloudTexture(), clouds = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: .55 + (i % 3) * .1, depthWrite: false, fog: false }); m.userData.noBend = true;
    const c = new THREE.Sprite(m); c.scale.set(46 + i * 5, 17 + i, 1); c.position.set(-100 + i * 34, 26 + (i % 3) * 8, -108 + (i % 2) * 6); root.add(c); clouds.push(c);
  }

  // far floor so the horizon fades into the haze instead of showing the sky dome below the world
  const farFloor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: '#D9BE98' })); farFloor.rotation.x = -Math.PI / 2; farFloor.position.set(0, -1.7, -300); farFloor.material.userData.noBend = true; root.add(farFloor);
  // continuous ground: road, curbs, pavements (textures scroll)
  const roadTex = asphaltTexture(), roadNormal = asphaltNormal(), curbTex = curbTexture(), padTex = MAT.pavement.map, padNormal = MAT.pavement.normalMap;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 140, 1, 70), new THREE.MeshStandardMaterial({ map: roadTex, normalMap: roadNormal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: .88 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -.04, -55); road.receiveShadow = true; root.add(road);
  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(.38, .16, 140, 1, 1, 70), new THREE.MeshStandardMaterial({ map: curbTex, roughness: .9 })); curb.position.set(s * (ROAD_HALF + .19), .03, -55); root.add(curb);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(WALK_OUT - ROAD_HALF - .38, 140, 1, 70), MAT.pavement); walk.rotation.x = -Math.PI / 2; walk.position.set(s * (ROAD_HALF + .38 + (WALK_OUT - ROAD_HALF - .38) / 2), -.03, -55); walk.receiveShadow = true; root.add(walk);
  }
  // lane markings: dashed white + yellowish edge lines
  const markings = [];
  const dash = new THREE.BoxGeometry(.1, .02, 3.2), dashMat = stdMat('#F2E9D6', .8);
  for (const lane of [-1.08, 1.08]) for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(dash, dashMat); m.position.set(lane, .01, -120 + i * 7); root.add(m); markings.push(m); }
  const edgeGeo = new THREE.BoxGeometry(.12, .02, 140, 1, 1, 70), edgeMat = stdMat('#E8D8A0', .8);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(edgeGeo, edgeMat); e.position.set(s * (ROAD_HALF - .3), .012, -55); root.add(e); }

  // streamed segments
  const slots = [];
  for (let k = 0; k < N; k++) { const g = new THREE.Group(); root.add(g); slots.push({ group: g, idx: -1, z: 4 - k * L, built: null, lines: [] }); }

  function plan(idx) {
    // Fella is a quiet villa district: low villas behind walls and gates, trees, a mosque, side streets, the bridge at the end.
    const m = ((idx % 28) + 28) % 28;
    const p = { left: 'villas', right: 'villas', bridge: false, shopVariant: idx, sign: idx % 6 === 2 };
    if (m === 8) p.bridge = true;
    if (m === 21) p.right = 'mosque';
    if (m === 4 || m === 23) p.right = 'sidestreet';
    if (m === 6 || m === 16) p.left = 'sidestreet';
    return p;
  }
  function buildSide(kind, rnd, s, idx) {
    const b = new Builder(), ground = () => b.plane(MAT.grass, 42, L + .05, s * 29.6, -.04, 0, 0, -Math.PI / 2, 0, [8, 3]);
    if (kind === 'villas') {
      ground();
      const twin = rnd() > .72;
      if (twin) { villa(b, rnd, s, { w: 5.2, zc: -3.5 }); villa(b, rnd, s, { w: 5.2, zc: 3.6 }); } else villa(b, rnd, s);
      if (rnd() > .4) parkedCar(b, rnd, s * 4.55, (rnd() - .5) * 8, s > 0 ? 1 : -1);
      streetFurniture(b, rnd, s, { lamp: true, trees: true });
    } else if (kind === 'tower') { ground(); tower(b, rnd, s); }
    else if (kind === 'canal') canal(b, rnd, s);
    else if (kind === 'mosque') { ground(); mosque(b, rnd, s); }
    else if (kind === 'shops') { ground(); shops(b, rnd, s, idx); }
    else if (kind === 'sidestreet') { ground(); sideStreet(b, rnd, s); }
    return b.build(false);
  }
  const queue = [];
  function rebuild(slot, idx, immediate = false) {
    for (const c of [...slot.group.children]) { disposeGroup(c); slot.group.remove(c); }
    slot.idx = idx; slot.token = (slot.token || 0) + 1; const token = slot.token;
    const p = plan(idx), rnd = rngFrom(idx * 7919 + 17);
    // Each piece is built on its own frame so a recycled segment never causes a long hitch.
    const jobs = [
      () => { const g = buildSide(p.left, rnd, -1, idx); slot.group.add(g); patchBend(g); },
      () => { const g = buildSide(p.right, rnd, 1, idx); slot.group.add(g); patchBend(g); },
      () => {
        const extra = new Builder();
        roadProps(extra, rnd, idx, p); if (((idx % 28) + 28) % 28 === 6) gantry(extra);
        if (idx % 2 === 0 && p.left !== 'nile') utilityPole(extra, -8.2, 0, -1);
        if (idx % 2 === 1 && p.right !== 'sidestreet') utilityPole(extra, 8.2, 0, 1);
        if (p.sign && p.right === 'tower') streetSign(extra, 1, VILLAS_PLACES.streetSigns[idx % VILLAS_PLACES.streetSigns.length]);
        const g = extra.build(false); slot.group.add(g); patchBend(g);
        if (idx % 2 === 0 && p.left !== 'nile') { const w = wires(-1); slot.group.add(w); patchBend(w); }
        if (idx % 2 === 1 && p.right !== 'sidestreet') { const w = wires(1); slot.group.add(w); patchBend(w); }
        if (p.bridge) { const br = buildBridge(); slot.group.add(br); patchBend(br); }
      },
    ];
    for (const job of jobs) { const guarded = () => { if (slot.token === token) job(); }; immediate ? guarded() : queue.push(guarded); }
  }
  slots.forEach((slot, k) => { rebuild(slot, startIdx + k, true); slot.group.position.z = slot.z; });
  let nextIdx = startIdx + N;

  patchBend(root); bendFree.forEach((o) => { o.material.userData.noBend = true; });
  [sunSprite, ...clouds].forEach((o) => { o.material.userData.noBend = true; });

  let distance = 0;
  const api = {
    curve: 0,
    update(dt, speed) {
      distance += speed * dt; sky.position.copy(camera.position);
      const ramp = Math.min(1, distance / 90);
      const curve = ramp * (0.0036 * Math.sin(distance / 64) + 0.0018 * Math.sin(distance / 27 + 1.3));
      const hill = ramp * 0.0011 * Math.sin(distance / 71 + .6);
      WORLD_BEND.uCurve.value = curve; WORLD_BEND.uHill.value = hill; api.curve = curve;
      const dz = speed * dt;
      for (const slot of slots) {
        slot.z += dz; slot.group.position.z = slot.z;
        if (slot.z > 4 + L) { slot.z -= N * L; rebuild(slot, nextIdx++); }
      }
      const job = queue.shift(); if (job) job();
      const period = 140 / 14;
      roadTex.offset.y = (roadTex.offset.y + dz * 14 / 140) % 1; roadNormal.offset.y = roadTex.offset.y;
      curbTex.offset.y = (curbTex.offset.y + dz * 70 / 140) % 1;
      padTex.offset.y = (padTex.offset.y + dz * 18 / 140) % 1; padNormal.offset.y = padTex.offset.y;
      MAT.water.map.offset.y = (MAT.water.map.offset.y + dt * .01) % 1; void period;
      for (const m of markings) { m.position.z += dz; if (m.position.z > 8) m.position.z -= 140; }
      for (const c of clouds) { c.position.x += dt * .6; if (c.position.x > 130) c.position.x = -130; }
    },
    dispose() {
      for (const slot of slots) for (const c of [...slot.group.children]) disposeGroup(c);
      scene.remove(root); scene.environment = null; envTexture?.dispose(); WORLD_BEND.uCurve.value = 0; WORLD_BEND.uHill.value = 0;
    },
  };
  return api;
}
