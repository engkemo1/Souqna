// Banha Runner — "الكوبري والفلل" world.
// Banha street route streamed in 14 m segments, with locally named storefronts, the railway underpass,
// Farid Nada / stadium approaches, and the Kafr El-Gazzar steel bridge.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { makeSedan, makeMicrobus, makeMotorcycle, stdMat, textTexture, vcOf, withColors } from './vehicles.js';
import { hasWalker, loadWalker, makeShopper } from './walkers.js';

/* ------------------------------------------------------------------------------------------------
   Real shop names are streamed from the active, public Twist marketplace records.
------------------------------------------------------------------------------------------------- */
export const VILLAS_PLACES = {
  bridgeSign: 'كوبري كفر الجزار',
  areaSign: 'الفلل',
  streetSigns: ['شارع سعد زغلول', 'شارع فريد ندا', 'شارع الاستاد'],
  mosque: 'مسجد الرحمن',
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
  constructor() { this.parts = new Map(); this.objects = []; }
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
    // Keep vehicles as proper 3D models rather than flattening them into the
    // same merged geometry used for painted street props. This also allows us
    // to swap the parked stand-in when a supplied GLB finishes loading.
    this.objects.push(obj);
  }
  build(castShadow = false) {
    const group = new THREE.Group();
    for (const [material, list] of this.parts) {
      const geo = mergeGeometries(list, false); list.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material); mesh.castShadow = castShadow; mesh.receiveShadow = false; mesh.frustumCulled = false; group.add(mesh);
    }
    for (const object of this.objects) group.add(object);
    this.objects.length = 0;
    return group;
  }
}
function disposeGroup(group) {
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  group.clear();
}

let tangaraAssetPromise = null;
function loadTangaraAsset() {
  tangaraAssetPromise ||= new GLTFLoader().loadAsync('/runner/models/tangara_sydney_trains_t_set.glb');
  return tangaraAssetPromise;
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
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); drawHeight(x, w, h);
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
    for (let i = 0; i < 4; i++) { const pw = 90 + r() * 120, ph = 120 + r() * 160, px = 120 + r() * (w - 300), py = r() * h; x.fillStyle = 'rgba(62,63,66,.3)'; x.fillRect(px, py, pw, ph); x.strokeStyle = 'rgba(170,170,170,.18)'; x.lineWidth = 2; x.strokeRect(px, py, pw, ph); noise(x, pw + px, ph + py, 600, 10, 60, .1, .3, 2, 3 + i); }
    // wheel tracks (polished dark bands) in each lane
    for (const u of [.15, .27, .4, .52, .66, .78]) { const g = x.createLinearGradient((u - .03) * w, 0, (u + .03) * w, 0); g.addColorStop(0, 'rgba(20,20,22,0)'); g.addColorStop(.5, 'rgba(20,20,22,.34)'); g.addColorStop(1, 'rgba(20,20,22,0)'); x.fillStyle = g; x.fillRect((u - .03) * w, 0, .06 * w, h); }
    // oil stains
    for (let i = 0; i < 8; i++) { const cx = r() * w, cy = r() * h, rr = 14 + r() * 26; const g = x.createRadialGradient(cx, cy, 2, cx, cy, rr); g.addColorStop(0, 'rgba(8,8,10,.42)'); g.addColorStop(1, 'rgba(8,8,10,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rr * 1.4, rr, r() * 3, 0, 7); x.fill(); }
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
/* ---------------------------------------------------------------- partner storefront branding */
const BRANDS = new Map();           // store name -> { logo, color, initials }  (filled from the marketplace API)
const BRAND_PALETTE = ['#0F7A58', '#C4573A', '#1E5F8F', '#8A4F82', '#C08A1E', '#2A6F6B'];
const hashStr = (str) => [...str].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7);
const hexLum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
function brandOf(name) {
  const b = BRANDS.get(name) || {};
  const ok = typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) && hexLum(b.color) > .16 && hexLum(b.color) < .8;
  return { name, logo: b.logo || null, initials: b.initials || name.replace(/\s+/g, '').slice(0, 2), departments: Array.isArray(b.departments) ? b.departments : [], color: ok ? b.color : BRAND_PALETTE[Math.abs(hashStr(name)) % BRAND_PALETTE.length] };
}
const STORE_DEPARTMENT_LABELS = {
  women: 'ملابس حريمي', men: 'ملابس رجالي', kids: 'ملابس أطفال', shoes: 'أحذية', bags: 'شنط', hijab: 'طرح وحجاب',
  abaya: 'عبايات', jalabiya: 'جلاليب', underwear: 'ملابس داخلية', wedding_dress: 'فساتين أفراح',
  wedding_suit: 'بدل أفراح', sports: 'ملابس رياضية', denim: 'جينز', accessories: 'إكسسوارات',
};
function storeCategoryLabel(departments = []) {
  const keys = new Set(departments.map((x) => String(x).toLowerCase()));
  const audience = ['women', 'men', 'kids'].filter((key) => keys.has(key));
  const relevant = audience.length ? audience : [...keys].filter((key) => STORE_DEPARTMENT_LABELS[key]);
  return relevant.slice(0, 3).map((key) => STORE_DEPARTMENT_LABELS[key]).join(' • ') || 'ملابس';
}
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const logoCache = new Map();
function logoImage(url, onLoad) {
  if (!url || typeof Image === 'undefined') return null;
  let e = logoCache.get(url);
  if (!e) {
    e = { img: new Image(), ok: false, waiters: [] }; e.img.crossOrigin = 'anonymous';
    e.img.onload = () => { e.ok = true; e.waiters.splice(0).forEach((fn) => fn()); };
    e.img.onerror = () => { e.waiters.length = 0; };
    e.img.src = url; logoCache.set(url, e);
  }
  if (!e.ok) { if (onLoad) e.waiters.push(onLoad); return null; }
  return e.img;
}
/** A canvas texture that repaints itself when the store logo (or the Arabic web font) arrives. */
function liveTexture(key, w, h, draw) {
  return memo(key, () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const paint = () => { const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h, paint); t.needsUpdate = true; };
    paint();
    try { document.fonts?.load('800 64px "IBM Plex Sans Arabic"').then(paint).catch(() => {}); } catch { /* font is optional */ }
    return t;
  });
}
const ARABIC_FONT = '"IBM Plex Sans Arabic","Cairo","Segoe UI",Tahoma,Arial,sans-serif';
function roundRect(x, px, py, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(px, py, w, h, r) : x.rect(px, py, w, h); }
/** Round brand badge: the store logo clipped to a circle, or its initials on the brand colour. */
function drawBadge(x, cx, cy, r, brand, repaint) {
  x.save();
  x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  const img = logoImage(brand.logo, repaint);
  if (img) {
    x.save(); x.beginPath(); x.arc(cx, cy, r - r * .1, 0, Math.PI * 2); x.clip();
    const k = Math.max((r * 1.8) / img.width, (r * 1.8) / img.height); x.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); x.restore();
  } else {
    x.fillStyle = brand.color; x.beginPath(); x.arc(cx, cy, r * .86, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#FFFFFF'; x.font = `800 ${Math.round(r * .95)}px ${ARABIC_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(brand.initials, cx, cy + r * .06);
  }
  x.lineWidth = r * .1; x.strokeStyle = brand.color; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
  x.restore();
}
/** Main shop sign: dark glossy fascia, logo badge, store name and its real merchandise categories. */
function brandSignTexture(brand) {
  const category = storeCategoryLabel(brand.departments);
  return liveTexture('sign|' + brand.name + brand.color + (brand.logo || '') + category, 1536, 384, (x, w, h, repaint) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#222A35'); g.addColorStop(1, '#0B0F15');
    x.fillStyle = g; roundRect(x, 0, 0, w, h, 46); x.fill();
    x.lineWidth = 12; x.strokeStyle = brand.color; roundRect(x, 10, 10, w - 20, h - 20, 38); x.stroke();
    x.lineWidth = 3; x.strokeStyle = 'rgba(242,213,160,.75)'; roundRect(x, 28, 28, w - 56, h - 56, 26); x.stroke();
    const gloss = x.createLinearGradient(0, 0, 0, h * .5); gloss.addColorStop(0, 'rgba(255,255,255,.16)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gloss; roundRect(x, 16, 16, w - 32, h * .46, 34); x.fill();
    drawBadge(x, 205, h / 2, 140, brand, repaint);
    const tx = 395, tw = w - tx - 70; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    let size = 150; x.font = `800 ${size}px ${ARABIC_FONT}`;
    while (x.measureText(brand.name).width > tw && size > 56) { size -= 6; x.font = `800 ${size}px ${ARABIC_FONT}`; }
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillText(brand.name, tx + tw / 2 + 4, 160 + 5);
    x.fillStyle = '#FFF8E8'; x.fillText(brand.name, tx + tw / 2, 160);
    // Replace the Twist partner text with the categories this shop actually sells.
    const pw = 500, ph = 66, px = tx + tw / 2 - pw / 2, py = 262;
    x.fillStyle = brand.color; roundRect(x, px, py, pw, ph, 33); x.fill();
    let categorySize = 40; x.fillStyle = '#FFFFFF'; x.font = `700 ${categorySize}px ${ARABIC_FONT}`;
    while (x.measureText(category).width > pw - 38 && categorySize > 26) { categorySize -= 2; x.font = `700 ${categorySize}px ${ARABIC_FONT}`; }
    x.fillText(category, tx + tw / 2, py + ph / 2 + 3);
  });
}
/** Projecting blade sign (square, double sided) so the logo reads from far down the street. */
function brandBladeTexture(brand) {
  return liveTexture('blade|' + brand.name + brand.color + (brand.logo || ''), 512, 512, (x, w, h, repaint) => {
    x.fillStyle = '#FFF8EC'; roundRect(x, 0, 0, w, h, 60); x.fill();
    x.lineWidth = 16; x.strokeStyle = brand.color; roundRect(x, 8, 8, w - 16, h - 16, 54); x.stroke();
    drawBadge(x, w / 2, 200, 130, brand, repaint);
    x.fillStyle = '#1B2430'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
    let size = 74; x.font = `800 ${size}px ${ARABIC_FONT}`;
    while (x.measureText(brand.name).width > w - 80 && size > 34) { size -= 4; x.font = `800 ${size}px ${ARABIC_FONT}`; }
    x.fillText(brand.name, w / 2, 405);
  });
}
function mannequin(x, cx, baseY, hgt, outfit, trousers) {
  const k = hgt / 100;
  x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(cx - 5 * k, baseY - 100 * k, 10 * k, 100 * k);          // stand pole
  x.fillStyle = '#2B2F36'; x.fillRect(cx - 24 * k, baseY - 3 * k, 48 * k, 4 * k);
  x.fillStyle = trousers; x.fillRect(cx - 17 * k, baseY - 52 * k, 14 * k, 46 * k); x.fillRect(cx + 3 * k, baseY - 52 * k, 14 * k, 46 * k);
  x.fillStyle = outfit; x.beginPath(); x.moveTo(cx - 24 * k, baseY - 98 * k); x.lineTo(cx + 24 * k, baseY - 98 * k); x.lineTo(cx + 19 * k, baseY - 50 * k); x.lineTo(cx - 19 * k, baseY - 50 * k); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(cx - 18 * k, baseY - 96 * k, 8 * k, 44 * k);
  x.fillStyle = '#E8D7BE'; x.beginPath(); x.arc(cx, baseY - 111 * k, 10 * k, 0, Math.PI * 2); x.fill();
}
function shopFacadeTexture(names, variant) {
  const brands = names.map(brandOf);
  return liveTexture('shop|' + brands.map((b) => b.name + b.color + (b.logo || '')).join() + '|' + variant, 1024, 640, (x, w, h, repaint) => {
    const wall = ['#D9C5A5', '#E2D2B8', '#CEB395', '#DDD2BD'][variant % 4];
    x.fillStyle = wall; x.fillRect(0, 0, w, h); noise(x, w, h, 6500, 70, 210, .025, .085, 3, variant + 4);
    const r = rngFrom(variant * 13 + 1), trim = '#74583F';
    // Upper apartments: deep window reveals, blue glass and small balconies.
    for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
      const px = 34 + col * 198, py = 38 + row * 166;
      x.fillStyle = 'rgba(53,39,28,.24)'; x.fillRect(px - 10, py - 8, 122, 122);
      x.fillStyle = trim; x.fillRect(px - 6, py - 6, 114, 112);
      const glass = x.createLinearGradient(px, py, px + 100, py + 100);
      glass.addColorStop(0, '#A4BEC3'); glass.addColorStop(.55, '#597C86'); glass.addColorStop(1, '#344D56');
      x.fillStyle = glass; x.fillRect(px, py, 102, 100);
      x.fillStyle = 'rgba(255,248,225,.28)'; x.fillRect(px + 8, py + 6, 26, 87);
      x.fillStyle = '#E9D9BD'; x.fillRect(px + 48, py, 7, 100);
      x.fillStyle = '#E9D9BD'; x.fillRect(px - 10, py + 100, 122, 8);
      if (r() > .55) {
        x.fillStyle = '#B8A88F'; x.fillRect(px - 11, py + 110, 124, 9);
        x.fillStyle = '#3E4544'; x.fillRect(px - 7, py + 118, 4, 24); x.fillRect(px + 15, py + 118, 4, 24); x.fillRect(px + 39, py + 118, 4, 24); x.fillRect(px + 63, py + 118, 4, 24); x.fillRect(px + 87, py + 118, 4, 24); x.fillRect(px + 108, py + 118, 4, 24);
      }
      if (r() > .58) { x.fillStyle = ['#B95042', '#417B84', '#D8AD48', '#63834E'][Math.floor(r() * 4)]; x.fillRect(px + 8, py + 18, 24, 70); }
    }
    // A solid stone course separates the apartments from the retail frontage.
    x.fillStyle = '#9C8062'; x.fillRect(0, 382, w, 22); x.fillStyle = '#F0E2CB'; x.fillRect(0, 404, w, 14);
    const shopW = w / Math.max(brands.length, 1);
    brands.forEach((brand, i) => {
      const px = i * shopW, bay = brand.color;
      // Brand-coloured pilasters frame each bay; the dark fascia carries the 3D sign above it.
      x.fillStyle = '#1E2A30'; x.fillRect(px + 10, 421, shopW - 20, 66);
      x.fillStyle = bay; x.fillRect(px + 16, 427, shopW - 32, 8); x.fillRect(px + 16, 474, shopW - 32, 8);
      const stripes = Math.max(5, Math.floor((shopW - 40) / 44));
      for (let k = 0; k < stripes; k++) { x.fillStyle = k % 2 ? 'rgba(255,244,222,.92)' : bay; x.fillRect(px + 20 + k * (shopW - 40) / stripes, 487, (shopW - 40) / stripes + 1, 30); }
      x.fillStyle = shade(bay, .7); x.fillRect(px + 20, 514, shopW - 40, 9);
      // Wide lit display window: warm interior glow, shelves and dressed mannequins in the brand colour.
      const winX = px + 28, winY = 532, winW = shopW - 158, winH = 82;
      x.fillStyle = '#242B2E'; x.fillRect(winX - 8, winY - 8, winW + 16, winH + 16);
      const glow = x.createLinearGradient(0, winY, 0, winY + winH);
      glow.addColorStop(0, '#FFF1CF'); glow.addColorStop(.55, '#F4C987'); glow.addColorStop(1, '#C98E4E');
      x.fillStyle = glow; x.fillRect(winX, winY, winW, winH);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(winX, winY, winW, 12);
      x.fillStyle = '#8B6A47'; x.fillRect(winX, winY + 46, 36, 4); x.fillRect(winX + winW - 36, winY + 46, 36, 4);   // shelves
      const outfits = [bay, '#F4EFE4', shade(bay, .6), '#2C3E5C', '#C9433B'];
      const count = winW > 300 ? 4 : 3;
      for (let k = 0; k < count; k++) {
        const cxm = winX + winW * (k + .75) / (count + .5) + 6;
        mannequin(x, cxm, winY + winH - 3, 62, outfits[(k + i + variant) % outfits.length], k % 2 ? '#2B3B58' : '#6A5640');
        if (k === 1) { x.fillStyle = bay; x.fillRect(cxm + 20, winY + 30, 18, 14); x.fillStyle = '#F4EFE4'; x.fillRect(cxm + 24, winY + 26, 10, 5); } // folded stock
      }
      x.fillStyle = 'rgba(255,255,255,.24)'; x.fillRect(winX + 4, winY + 4, 11, winH - 8);
      // Small round partner sticker on the glass.
      drawBadge(x, winX + winW - 34, winY + winH - 30, 22, brand, repaint);
      const doorX = px + shopW - 112;
      x.fillStyle = '#242B2E'; x.fillRect(doorX - 5, winY - 8, 78, winH + 16);
      const dg = x.createLinearGradient(0, winY, 0, winY + winH); dg.addColorStop(0, '#CDE3E6'); dg.addColorStop(1, '#6B8F96');
      x.fillStyle = dg; x.fillRect(doorX, winY, 68, winH);
      x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(doorX + 7, winY + 5, 10, winH - 10);
      x.fillStyle = bay; roundRect(x, doorX + 12, winY + 22, 44, 18, 6); x.fill();
      x.fillStyle = '#FFFFFF'; x.font = `700 13px ${ARABIC_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('مفتوح', doorX + 34, winY + 31);
      x.fillStyle = '#D4B979'; x.fillRect(doorX + 56, winY + 42, 4, 14);
      x.fillStyle = '#7A6247'; x.fillRect(px + 12, 622, shopW - 24, 18);
      x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(px + 12, 638, shopW - 24, 2);
    });
    x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(0, h - 6, w, 6);
  });
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
function sunTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#FFFDF0'); g.addColorStop(.2, '#FFF4C9'); g.addColorStop(.27, '#FFE18C');
    g.addColorStop(.46, 'rgba(255,190,92,.5)'); g.addColorStop(1, 'rgba(255,172,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
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
    patch: stdMat('#454649', .98), manhole: stdMat('#1E1F21', .5, .6), brick: stdMat('#9C4E34', .95), sandHeap: stdMat('#BCA67C', 1), barrier: new THREE.MeshStandardMaterial({ map: stripeTexture('#E8E4DA', '#C8302A'), roughness: .7 }), bump: new THREE.MeshStandardMaterial({ map: stripeTexture('#E9C22E', '#202022'), roughness: .85 }), gantrySign: new THREE.MeshBasicMaterial({ map: gantryTexture() }),
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
function crossStreetWires() {
  const pts = [];
  for (const z of [-4.6, 1.2, 6.1]) {
    let prev = null;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, x = -8.35 + t * 16.7, y = 7.65 - Math.sin(t * Math.PI) * .58;
      const p = [x, y, z]; if (prev) pts.push(...prev, ...p); prev = p;
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(geo, MAT.wire); line.frustumCulled = false; return line;
}
const PARKED_ROUTES = ['بنها - القاهرة', 'بنها - طوخ', 'بنها - شبرا'];
function makeParkedVehicle(type, rnd = Math.random) {
  if (type === 'microbus') return makeMicrobus(pick(rnd, PARKED_ROUTES));
  if (type === 'bike') return makeMotorcycle();
  return makeSedan();
}
function parkedCar(b, rnd, x, z, face = 1) {
  const roll = rnd();
  // Tuktuks belong to moving traffic, never to parked curb scenery.
  const type = roll < .52 ? 'car' : roll < .82 ? 'microbus' : 'bike';
  const car = makeParkedVehicle(type, rnd);
  car.userData.parkedVehicleType = type;
  // The road mesh top is y=-0.04. Place the parked model there too so its
  // wheels do not float above the asphalt.
  // Parked vehicles use near full road scale; the old .72 multiplier made
  // full-size GLBs look like toy props. At x=4.65, wider cars still stay within
  // the 5.6 m road edge and clear the pedestrian pavement.
  b.object(car, x, -.04, z, face > 0 ? 0 : Math.PI, .94);
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

function tower(b, rnd, s, storeNames = [], segmentIndex = 0) {
  const floors = rnd() > .5 ? 7 : 5, variant = Math.floor(rnd() * 8), w = TOWER_W, depth = 8;
  const pool = storeNames;
  const count = Math.min(3, pool.length), names = Array.from({ length: count }, (_, i) => pool[(segmentIndex * 3 + i) % pool.length]);
  const h = 4.2 + floors * 3 + .85, zc = (rnd() - .5) * .8, fx = s * 9.0;
  const bodyCols = ['#D9C8A6', '#A85A40', '#D6A98A', '#9E9A90'], body = stdMat(bodyCols[variant % 4], .95);
  const m = memo(`towerm${variant}|${floors}|${names.join()}`, () => new THREE.MeshStandardMaterial({ map: towerFacadeTexture(variant, floors, names), roughness: .92, normalMap: memo('plasterN', plasterNormal), normalScale: new THREE.Vector2(.45, .45) }));
  const sideM = memo('bsm' + variant, () => new THREE.MeshStandardMaterial({ map: brickSideTexture(variant), roughness: .95 }));
  b.box(body, depth, h, w, fx + s * depth / 2, h / 2, zc);
  b.plane(m, w, h, fx - s * .02, h / 2, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  b.plane(sideM, depth, h, fx + s * depth / 2, h / 2, zc + w / 2 + .02, 0);
  // shop awnings projecting over the pavement
  const aw = [stdMat('#B85238', .8), stdMat('#147154', .8), stdMat('#193F66', .8)];
  const sw = w / Math.max(names.length, 1);
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
  // Parked vehicles sit on the pavement edge instead of blocking the live lanes.
  if (rnd() > .5) parkedCar(b, rnd, s * 4.65, (rnd() - .5) * 9, s > 0 ? 1 : -1);
  if (rnd() > .5) parkedCar(b, rnd, s * 4.65, (rnd() - .5) * 9 + 5, s > 0 ? 1 : -1);
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

/* Banha Station frontage, placed on the roadside so it never blocks the avenue view. */
function banhaStation(b) {
  const wall = stdMat('#E5E2DC', .9), shadow = stdMat('#C8C4BD', .9), stone = stdMat('#8F8980', .92);
  const wood = stdMat('#704D42', .72), frame = stdMat('#332F2B', .55), glass = stdMat('#527985', .28);
  const x = -13.2;
  b.box(wall, 9.2, 9.4, 13.2, x, 4.7, 0);
  b.box(stone, 9.4, 1.8, 13.5, x, 3.35, 0);
  b.box(shadow, 9.3, 2.0, 13.4, x, 7.1, 0);
  // Deep-set concrete lattice inspired by the real exterior facade.
  for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) {
    const z = -5.7 + col * 1.42, y = 5.2 + row * .86;
    b.box(wall, 1.0, .68, .2, x + 4.55, y, z);
    if ((row + col) % 2 === 0) b.box(shadow, .28, .18, .9, x + 4.48, y + .42, z);
  }
  // The bilingual station sign faces the street and remains readable as the player approaches.
  const sign = memo('banha-station-exterior-sign', () => new THREE.MeshBasicMaterial({ map: textTexture('محطة بنها  •  Banha Train Station', { bg: '#704D42', color: '#F4F0E8', width: 1024, height: 160, size: 64 }) }));
  b.box(wood, .22, 2.0, 11.6, x + 4.8, 5.18, 0);
  b.plane(sign, 10.9, 1.65, x + 4.94, 5.18, 0, Math.PI / 2);
  for (let bay = 0; bay < 7; bay++) {
    const z = -5.45 + bay * 1.82;
    b.box(frame, .22, 2.65, 1.54, x + 4.78, 1.28, z);
    b.box(glass, .1, 2.25, 1.28, x + 4.92, 1.34, z);
    b.box(stone, .24, .12, 1.7, x + 4.98, 2.72, z);
  }
  for (let col = 0; col < 6; col++) b.box(stone, .34, 3.1, .18, x + 4.95, 1.55, -4.5 + col * 1.8);
  b.box(MAT.concrete, 10.5, .28, 14.4, x, 9.55, 0);
}

/* Saad Zaghloul statue, red stone pedestal, oval paving, and marked curb island. */
function saadZaghloulStatue() {
  const b = new Builder();
  const red = stdMat('#82483D', .8), redEdge = stdMat('#A56854', .72), bronze = stdMat('#343B3C', .48), inset = stdMat('#D2C0A2', .75);
  const base = stdMat('#C4B89E', .92), curb = stdMat('#8B8171', .9), paving = stdMat('#D6CCB8', .92);
  const curbDark = stdMat('#34383A', .85), curbYellow = stdMat('#D9B247', .78);
  // Paved oval island with a continuous raised curb ring, matching the photos.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .18, 48), paving);
  pad.scale.set(1.85, 1, 5.65); pad.position.y = .12; pad.receiveShadow = true; b.objects.push(pad);
  const oval = new THREE.Shape(); oval.absellipse(0, 0, 2.05, 5.9, 0, Math.PI * 2, false, 0);
  const inner = new THREE.Path(); inner.absellipse(0, 0, 1.85, 5.65, 0, Math.PI * 2, true, 0); oval.holes.push(inner);
  const curbGeo = new THREE.ExtrudeGeometry(oval, { depth: .24, bevelEnabled: false, curveSegments: 48 });
  curbGeo.rotateX(-Math.PI / 2);
  const curbRing = new THREE.Mesh(curbGeo, curb); curbRing.position.y = .025; curbRing.castShadow = true; curbRing.receiveShadow = true; b.objects.push(curbRing);
  // Fine paving joints stay inside the oval and lead toward the statue plinth.
  for (let z = -5.1; z <= 5.1; z += .62) {
    const half = 1.85 * Math.sqrt(Math.max(0, 1 - (z * z) / (5.65 * 5.65)));
    if (half > .35) b.box(base, half * 2, .012, .035, 0, .218, z);
  }
  // Black/yellow curb marks at the front and back ends of the island.
  for (const z of [-5.72, 5.72]) for (let i = 0; i < 4; i++) {
    const x = -.45 + i * .3;
    b.box(i % 2 ? curbYellow : curbDark, .3, .18, .24, x, .18, z);
  }
  b.add(UNIT.cyl, base, 0, .18, 0, 1.32, .18, 3.25);
  b.add(UNIT.cyl, curb, 0, .48, 0, 1.16, .1, 3.08);
  b.box(redEdge, 1.75, .36, 2.1, 0, .72, 0);
  b.box(red, 1.38, 3.45, 1.72, 0, 2.62, 0);
  b.box(redEdge, 1.62, .25, 1.94, 0, 4.48, 0);
  b.box(redEdge, .9, 1.48, .08, 0, 2.75, .91);
  b.box(inset, .68, 1.24, .1, 0, 2.75, .97);
  // Upright long coat, separated legs, arms held together and a side-facing head.
  b.taper(bronze, .25, .4, 1.15, 0, 5.18, 0);
  b.box(bronze, .72, .78, .38, 0, 4.93, .02);
  b.sphere(bronze, .2, .02, 5.97, 0, .86, 1.2, .88);
  b.pyramid(bronze, .09, .22, .2, 5.97, .03, -Math.PI / 2, .75, .7);
  for (const side of [-1, 1]) {
    b.taper(bronze, .12, .15, .82, side * .16, 4.28, .02);
    b.taper(bronze, .08, .11, .78, side * .32, 5.04, .04, 0, 0, side * -.07);
    b.box(bronze, .24, .12, .34, side * .16, 3.86, .12);
  }
  b.sphere(bronze, .12, .05, 4.61, .23);
  return b.build(false);
}

/* A clear Banha Stadium landmark on the stadium approach. */
function banhaStadium(b, s) {
  const x = s * 17.5;
  const concrete = stdMat('#C9BDA7', .94), shade = stdMat('#315A70', .86), seats = stdMat('#D6A64C', .84);
  // Long, low grandstand with repeated seating tiers, open entrance bays and roof canopy.
  b.box(concrete, 14, 4.6, 11, x, 2.3, 0);
  for (let row = 0; row < 5; row++) {
    b.box(seats, 12.2 - row * .55, .22, .82, x, 1.0 + row * .43, -3.7 + row * .82);
  }
  b.box(shade, 14.8, .34, 6.8, x, 5.0, -.8);
  for (let bay = -2; bay <= 2; bay++) {
    b.box(MAT.concreteDark, 1.5, 2.2, .12, x + bay * 2.55, 1.25, 5.56);
  }
  const sign = memo('banha-stadium-sign', () => new THREE.MeshBasicMaterial({ map: textTexture('استاد بنها', { bg: '#0C5B43', color: '#FFF4D5', width: 600, height: 120, size: 76, border: '#F0D99D' }) }));
  b.box(MAT.signBack, 8.2, 1.75, .24, x, 3.55, 5.7);
  b.plane(sign, 8, 1.5, x, 3.55, 5.84, -Math.PI / 2);
  for (const dx of [-5.8, 5.8]) {
    b.box(MAT.iron, .16, 9, .16, x + dx, 6.1, -4.2);
    b.box(MAT.iron, 1.4, .14, .5, x + dx, 10.6, -4.2);
    for (let i = -2; i <= 2; i++) b.box(MAT.lampGlow, .16, .3, .16, x + dx + i * .23, 10.35, -4.2);
  }
}

/* ---------- shop strip ---------- */
function shops(b, rnd, s, variant, storeNames = []) {
  const pool = storeNames;
  // Show each real participating store once in the first storefront strip.
  const start = variant * 4 + (s > 0 ? 2 : 0), names = pool.slice(start, start + 2);
  const m = names.length
    ? memo('shopm' + names.map((n) => { const br = brandOf(n); return n + br.color + (br.logo || ''); }).join() + variant, () => new THREE.MeshStandardMaterial({ map: shopFacadeTexture(names, variant), roughness: .92 }))
    : stdMat(['#D9BF9A', '#E2CFAE', '#CFA98E', '#DCD0B4'][variant % 4], .95);
  const h = 9.6, d = 7, fx = s * 8.7;
  b.box(stdMat('#D6BE9A', .95), d, h, L - .6, fx + s * d / 2, h / 2, 0);
  b.plane(m, L - .6, h, fx - s * .02, h / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  const trim = stdMat('#26383D', .55, .35), canvas = stdMat('#F0E5D2', .82), gold = stdMat('#D8B66A', .35, .7), soil = stdMat('#5B4130', .95), leaf = stdMat('#3F7D3B', .9), leaf2 = stdMat('#58994A', .9), pot = stdMat('#8C5A3C', .85);
  // Air conditioners, drain pipes and a stone base make the two-storey block
  // read as a lived-in Banha shopping street rather than a floating billboard.
  const ac = stdMat('#D6D7D2', .62), acGrille = stdMat('#50595A', .72);
  for (const z of [-5.15, 5.15]) {
    const ax = fx - s * .22;
    b.box(ac, .38, .48, 1.0, ax, 6.35, z);
    b.box(acGrille, .035, .28, .66, ax - s * .2, 6.35, z);
    b.box(MAT.concreteDark, .07, 2.0, .07, fx - s * .14, 5.15, z + .7);
  }
  b.box(stdMat('#9C8062', .95), .12, .42, L - .6, fx - s * .08, .22, 0);
  names.forEach((name, i) => {
    const brand = brandOf(name), z = i === 0 ? -3.25 : 3.25;
    const frontX = fx - s * .1;
    // Branded sign: dark glossy board with logo badge + name + partner pill, canted toward the road so it reads from the player's lane.
    const signMat = memo('signmat|' + name + brand.color + (brand.logo || ''), () => new THREE.MeshBasicMaterial({ map: brandSignTexture(brand), transparent: true }));
    const signYaw = s > 0 ? -Math.PI / 2 : Math.PI / 2; // flat on the facade: a canted board sank one end into the wall and looked cropped
    b.box(memo('sbd|' + brand.color, () => stdMat(shade(brand.color, .45), .6)), 5.95, 1.62, .2, frontX, 3.95, z, signYaw);
    b.plane(signMat, 5.7, 1.425, frontX - s * .13, 3.95, z, signYaw);
    // Warm LED underline + two little spot lamps.
    const led = memo('led|' + brand.color, () => new THREE.MeshBasicMaterial({ color: brand.color }));
    b.box(led, 5.75, .06, .06, frontX - s * .17, 3.1, z, signYaw);
    for (const dz of [-2.1, 2.1]) b.box(gold, .1, .1, .5, frontX - s * .5, 4.88, z + dz, signYaw);
    // Window frame, door post and brand-coloured striped canopy.
    const awning = memo('awn|' + brand.color, () => stdMat(brand.color, .78));
    b.box(trim, .09, 2.42, .09, frontX, 1.58, z - 2.82);
    b.box(trim, .09, 2.42, .09, frontX, 1.58, z + 2.82);
    b.box(trim, .09, .09, 5.72, frontX, .37, z);
    b.box(trim, .09, .09, 5.72, frontX, 2.79, z);
    b.box(trim, .09, 2.25, .08, frontX, 1.58, z + 1.92);
    const awningX = fx - s * .62;
    for (let stripe = 0; stripe < 8; stripe++) b.box(stripe % 2 ? canvas : awning, .92, .13, .72, awningX, 2.78, z - 2.52 + stripe * .72, 0, 0, s * .08);
    b.box(awning, .94, .3, 5.8, awningX - s * .46, 2.62, z, 0, 0, s * .08);   // scalloped valance
    b.box(trim, .08, .62, .08, fx - s * .3, 2.45, z - 2.55);
    b.box(trim, .08, .62, .08, fx - s * .3, 2.45, z + 2.55);
    // Projecting blade sign at the near corner of the bay: face-on to the approaching courier.
    const blade = memo('blade|' + name + brand.color + (brand.logo || ''), () => new THREE.MeshBasicMaterial({ map: brandBladeTexture(brand), transparent: true, side: THREE.DoubleSide }));
    const bz = z + 3.0;
    b.box(trim, .9, .07, .07, fx - s * .55, 3.45, bz);
    b.plane(blade, 1.0, 1.0, fx - s * 1.0, 2.85, bz, Math.PI / 2);
    // Planters with flowers flank the door on the pavement.
    for (const dz of [-2.55, 2.45]) {
      const px = fx - s * 1.55, pz = z + dz;
      b.box(pot, .62, .5, .62, px, .25, pz);
      b.box(soil, .54, .06, .54, px, .52, pz);
      b.blob(leaf, .36, px, .78, pz, .85); b.blob(leaf2, .24, px + .12, .96, pz - .08, .8);
      const flower = memo('fl|' + brand.color, () => stdMat(brand.color, .7));
      const cream = memo('cream', () => stdMat('#F6E9C9', .7));
      for (let f = 0; f < 5; f++) b.sphere(f % 2 ? cream : flower, .07, px + (f - 2) * .1, .95 + (f % 2) * .1, pz + ((f * 7) % 3 - 1) * .1);
    }
  });
  // Roofline fascia + water tank, then a string of warm festoon lights along the shopfronts.
  b.box(MAT.concrete, 7.2, .4, L - .4, fx + s * d / 2, h + .2, 0);
  b.cyl(MAT.tank, .55, 1.1, fx + s * 3, h + .95, 2);
  const bulb = memo('bulb', () => new THREE.MeshBasicMaterial({ color: '#FFE2A0' }));
  for (let k = 0; k < 14; k++) b.sphere(bulb, .06, fx - s * 1.15, 5.65 - Math.sin(k / 13 * Math.PI) * .22, -6.3 + k * .97);
  b.box(trim, .03, .03, 13.2, fx - s * 1.15, 5.8, 0);
  // Cars are parked in alternating curb bays, leaving the center lanes open.
  if ((variant + (s > 0 ? 1 : 0)) % 2 === 0) parkedCar(b, rnd, s * 4.65, s > 0 ? 1.6 : -1.6, s > 0 ? -1 : 1);
  streetFurniture(b, rnd, s, { lamp: true, trees: false });
  // Detailed animated pedestrian models are attached after the building meshes are baked.
}

/* ---------- side street ---------- */
function sideStreet(b, rnd, s) {
  const asphalt = stdMat('#58595C', .96), line = stdMat('#EFE9DA', .8);
  // Asphalt joins the main road at the outer curb. Keep the junction mouth clear:
  // the old facade at x=9 sat directly across this opening, so entering cars
  // looked as if they were driving through a wall.
  b.plane(asphalt, 29, 9, s * 20.1, -.02, 0, 0, -Math.PI / 2);
  // Drop-kerb apron: the main road's kerb and pavement run past the mouth, so without this the opening reads as a
  // dam. A raised asphalt table (top at .125, just above the kerb) with short ramps both ways lets traffic roll
  // straight across the pavement like a real junction.
  b.box(asphalt, 4.0, .17, 9, s * 7.6, .04, 0);
  const rampUp = Math.atan2(.165, 1.0), rampDown = Math.atan2(.145, 1.6);
  b.box(asphalt, 1.014, .03, 9, s * 5.1, .04, 0, 0, 0, s * rampUp);
  b.box(asphalt, 1.61, .03, 9, s * 10.4, .0525, 0, 0, 0, -s * rampDown);
  for (let i = 0; i < 7; i++) b.box(line, 1.3, .02, .35, s * (13 + i * 3), .0, 0);
  const bld = (z) => {
    const h2 = 7 + rnd() * 3, v = Math.floor(rnd() * 8);
    b.box(stdMat('#D8C6A4', .95), 8, h2, 4.2, s * 17, h2 / 2, z);
    b.plane(facadeTexture(v), 4.2, h2 * .92, s * 13.0, h2 / 2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  };
  bld(-6.6); bld(6.6);
  parkedCar(b, rnd, s * 17.5, 2.2, 1);
  // Dashed edge marks begin after the junction so they do not imply a wall or curb.
  for (let i = 0; i < 8; i++) b.box(line, .35, .02, 1.0, s * (10 + i * 1.15), 0, -4.5);
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
    x.fillText(VILLAS_PLACES.bridgeSign, w / 2, h * .38); x.font = 'bold 54px Tahoma, Arial, sans-serif'; x.fillText('Kafr El-Gazzar', w / 2, h * .76);
    for (const ax of [120, 904]) { x.beginPath(); x.moveTo(ax - 40, 70); x.lineTo(ax + 40, 70); x.lineTo(ax, 190); x.fill(); }
    noise(x, w, h, 1500, 30, 90, .03, .12, 2, 4);
  }, {});
}
function roadProps(b, rnd, idx, p) {
  const g = new THREE.Group();
  if (idx % 3 === 0) { b.box(MAT.patch, 1.0 + rnd() * .7, .012, 1.4 + rnd() * 1.2, (rnd() - .5) * 7.5, .014, (rnd() - .5) * 9); }
  if (idx % 4 === 1) { const mx = (rnd() > .5 ? 1 : -1) * (1.5 + rnd() * 2); b.cyl(MAT.manhole, .4, .02, mx, .018, rnd() * 6 - 3); }
  // Keep the drivable surface clear. Dynamic traffic and scheduled incidents
  // provide the actual challenge; static construction props belong on sidewalks.
  return g;
}
function gantry(b) {
  const w = 13.6, y = 8.2;
  for (const x of [-w / 2, w / 2]) { b.box(MAT.signBack, .32, y, .32, x, y / 2, 0); b.box(MAT.concreteDark, .7, .25, .7, x, .12, 0); }
  b.box(MAT.signBack, w + .3, .38, .38, 0, y, 0); b.box(MAT.signBack, 9.2, .22, .22, 0, y - 2.5, 0);
  b.plane(MAT.gantrySign, 9, 2.25, 0, y - 1.3, .2); b.plane(MAT.gantrySign, 9, 2.25, 0, y - 1.3, -.2, Math.PI);
  for (const x of [-3.8, 0, 3.8]) b.box(MAT.signBack, .08, 2.5, .08, x, y - 1.25, 0);
}

/* ---------- Saad Zaghloul railway underpass ---------- */
function buildTunnel() {
  const b = new Builder();
  const tile = memo('saad-tunnel-tile', () => stdMat('#918D82', .92));
  const dark = stdMat('#343638', .94), concrete = stdMat('#77756F', .94);
  const ballast = memo('saad-tunnel-rail-ballast', () => stdMat('#514F49', .96));
  const sleeper = memo('saad-tunnel-rail-sleeper', () => stdMat('#493B30', .95));
  const rail = memo('saad-tunnel-rail-steel', () => stdMat('#53585A', .42, .72));
  const asphalt = memo('saad-tunnel-road', () => stdMat('#343638', .96));
  const yTop = 4.9, xStart = ROAD_HALF + .5, xEnd = 39, run = xEnd - xStart, cx = (xStart + xEnd) / 2, width = 8.6;
  // This is a right-hand branch off the avenue. The player stays on the main
  // road; local traffic can turn into this short under-rail tunnel.
  b.plane(asphalt, run, width, cx, .015, 0, 0, -Math.PI / 2);
  b.box(concrete, run, .5, width + .6, cx, yTop, 0);
  b.box(dark, run, .12, width + .8, cx, yTop - .31, 0);
  for (const sideZ of [-width / 2, width / 2]) {
    b.box(concrete, run, yTop, .45, cx, yTop / 2, sideZ);
    b.box(tile, run - 1.0, 2.7, .05, cx, 1.55, sideZ);
    b.box(MAT.concreteDark, run - 1.0, .18, .18, cx, .18, sideZ);
  }
  // Portal faces the avenue at the right curb and leaves the ordinary game
  // route open. Concrete jambs and lintel frame the opening.
  b.box(concrete, .48, 4.9, .52, xStart, 2.45, -4.05);
  b.box(concrete, .48, 4.9, .52, xStart, 2.45, 4.05);
  b.box(concrete, .48, .52, 8.6, xStart, 4.66, 0);
  for (let x = xStart + 4; x < xEnd - 1; x += 6) {
    b.box(MAT.signBack, .32, .12, .42, x, yTop - .46, 0);
    b.box(MAT.lampGlow, .2, .035, .3, x, yTop - .54, 0);
  }
  // Two parallel railway lines run above the branch and along the avenue axis.
  // Each track's rails are 1.44 m apart; sleepers bridge them across X.
  const trackSpan = 110, trackXs = [15.6, 19.8], trackCenter = (trackXs[0] + trackXs[1]) / 2;
  b.box(concrete, 8.8, .42, trackSpan, trackCenter, yTop + .32, 0);
  b.box(ballast, 8.5, .16, trackSpan + .4, trackCenter, yTop + .59, 0);
  for (const trackX of trackXs) {
    for (let z = -54; z <= 54; z += .72) b.box(sleeper, 2.9, .12, .58, trackX, yTop + .74, z);
    for (const gaugeX of [-.72, .72]) b.box(rail, .13, .16, trackSpan + .5, trackX + gaugeX, yTop + .88, 0);
  }
  return b.build(false);
}

/* ---------- Kafr El-Gazzar historic steel-truss bridge ---------- */
function buildBridge(showSign = false) {
  const b = new Builder(), len = L;
  const sign = memo('bridgesign' + VILLAS_PLACES.bridgeSign, () => new THREE.MeshBasicMaterial({ map: textTexture(VILLAS_PLACES.bridgeSign, { bg: '#0E6B4C', color: '#FFF3D0', width: 768, height: 140, size: 84, border: '#F3E2B2' }) }));
  const steel = stdMat('#34464A', .55, .68), brace = stdMat('#50666A', .58, .62), deck = stdMat('#393B3D', .9);
  const water = new THREE.MeshBasicMaterial({ map: MAT.water.map, color: '#729398' });
  b.plane(water, 56, len + .4, 0, -.34, 0, 0, -Math.PI / 2);
  // Keep the running road open below the bridge. The former deck sat at y=.15,
  // directly on top of the road plane, hiding the runner and making the bridge
  // read as a road slab instead of an overhead crossing.
  const deckY = 5.0;
  b.box(deck, 12.4, .34, len, 0, deckY, 0);
  for (const side of [-1, 1]) {
    const x = side * 6.25;
    b.box(steel, .18, .28, len, x, deckY - .2, 0); // lower chord
    b.box(steel, .18, .22, len, x, 6.8, 0);  // upper chord
    b.box(steel, .16, 1.8, .18, x, 5.8, -len / 2 + .35);
    b.box(steel, .16, 1.8, .18, x, 5.8, len / 2 - .35);
    for (let i = 1; i < 6; i++) {
      const z = -len / 2 + i * (len / 6);
      b.box(brace, .12, 1.8, .14, x, 5.8, z);
      b.box(brace, .1, 2.45, .12, x, 5.8, z - .85, 0, side > 0 ? .34 : -.34);
    }
    // Slim piers stand outside the 11.2 m roadway so the courier remains visible.
    b.box(MAT.concreteDark, .42, deckY, .72, side * 6.65, deckY / 2, 0);
  }
  for (const z of [-5.5, 0, 5.5]) {
    b.box(steel, 12.5, .16, .16, 0, deckY - .18, z);
  }
  if (showSign) {
    b.box(MAT.signBack, 9.2, 1.65, .18, 0, 6.35, len / 2 - .3);
    b.plane(sign, 9.0, 1.45, 0, 6.35, len / 2 - .4, 0);
  }
  const g = b.build(false); return g;
}

/* ---------------------------------------------------------------- world */
export function createVillasWorld(scene, camera, { sun, hemi, renderer, envUrl, startIdx = 0, storeNames = [], storeBrands = {} } = {}) {
  initMaterials();
  BRANDS.clear(); for (const [name, info] of Object.entries(storeBrands || {})) BRANDS.set(name, info);
  const root = new THREE.Group(); scene.add(root);
  const bendFree = [];
  let nightMode = false, sunSprite = null, clouds = [], farFloor = null;

  // atmosphere
  scene.background = new THREE.Color('#F7DEB8'); scene.fog = new THREE.Fog('#F0DABC', 58, 190);
  if (hemi) { hemi.color.set('#FFF7E8'); hemi.groundColor.set('#A7957C'); hemi.intensity = envUrl ? 1.25 : 1.4; }
  if (sun) { sun.color.set('#FFE0AF'); sun.intensity = 2.9; sun.position.set(-18, 15, -4); }
  // Real sunset HDRI (Poly Haven, CC0) used ONLY for lighting + reflections; the visible sky stays our own dome.
  let envTexture = null;
  if (envUrl && renderer) {
    new HDRLoader().load(envUrl, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer); envTexture = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = envTexture; scene.environmentIntensity = nightMode ? .29 : .62; hdr.dispose(); pmrem.dispose();
    }, undefined, () => { if (hemi) hemi.intensity = 1.0; });
  }
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }); skyMat.userData.noBend = true;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(118, 24, 16), skyMat); sky.renderOrder = -10; root.add(sky); bendFree.push(sky);
  const sunMat = new THREE.SpriteMaterial({ map: sunTexture(), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false }); sunMat.userData.noBend = true;
  sunSprite = new THREE.Sprite(sunMat); sunSprite.scale.set(11.5, 11.5, 1); sunSprite.renderOrder = 20; root.add(sunSprite);
  const cloudTex = cloudTexture();
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: .55 + (i % 3) * .1, depthWrite: false, fog: false }); m.userData.noBend = true;
    const c = new THREE.Sprite(m); c.scale.set(46 + i * 5, 17 + i, 1); c.position.set(-100 + i * 34, 26 + (i % 3) * 8, -108 + (i % 2) * 6); root.add(c); clouds.push(c);
  }

  // far floor so the horizon fades into the haze instead of showing the sky dome below the world
  farFloor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: '#D9BE98' })); farFloor.rotation.x = -Math.PI / 2; farFloor.position.set(0, -1.7, -300); farFloor.material.userData.noBend = true; root.add(farFloor);
  // continuous ground: road, curbs, pavements (textures scroll)
  const roadTex = asphaltTexture(), roadNormal = asphaltNormal(), curbTex = curbTexture(), padTex = MAT.pavement.map, padNormal = MAT.pavement.normalMap;
  // Continue the asphalt behind the runner so the live rear-view mirror shows
  // approaching traffic on the road instead of over the bare ground.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 230, 1, 115), new THREE.MeshStandardMaterial({ map: roadTex, normalMap: roadNormal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: .88 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -.04, -55); road.receiveShadow = true; root.add(road);
  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(.38, .16, 230, 1, 1, 115), new THREE.MeshStandardMaterial({ map: curbTex, roughness: .9 })); curb.position.set(s * (ROAD_HALF + .19), .03, -55); root.add(curb);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(WALK_OUT - ROAD_HALF - .38, 230, 1, 115), MAT.pavement); walk.rotation.x = -Math.PI / 2; walk.position.set(s * (ROAD_HALF + .38 + (WALK_OUT - ROAD_HALF - .38) / 2), -.03, -55); walk.receiveShadow = true; root.add(walk);
  }
  // lane markings: dashed white + yellowish edge lines
  const markings = [];
  const dash = new THREE.BoxGeometry(.1, .02, 3.2), dashMat = stdMat('#F2E9D6', .8);
  for (const lane of [-1.08, 1.08]) for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(dash, dashMat); m.position.set(lane, .01, -120 + i * 7); root.add(m); markings.push(m); }
  const edgeGeo = new THREE.BoxGeometry(.12, .02, 230, 1, 1, 115), edgeMat = stdMat('#E8D8A0', .8);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(edgeGeo, edgeMat); e.position.set(s * (ROAD_HALF - .3), .012, -55); root.add(e); }

  // streamed segments
  const slots = [];
  let disposed = false;
  let crossingTrain = null, trainClock = 0;
  for (let k = 0; k < N; k++) { const g = new THREE.Group(); root.add(g); slots.push({ group: g, idx: -1, z: 4 - k * L, built: null, lines: [], actors: [], trainRig: null, tunnelVan: null }); }

  // Keep the whole Twist partner strip at the start, then continue through the Banha route.
  const shopSegments = Math.max(2, Math.ceil(storeNames.length / 4));
  function plan(idx) {
    if (idx < shopSegments) return { left: 'shops', right: 'shops', bridge: false, tunnel: false, shopVariant: idx, sign: false };
    // Fixed, one-way Banha itinerary: station and mosque approach the Saad
    // Zaghloul statue square; its railway underpass sits beside the statue on
    // the opposite side, followed by Farid Nada, stadium, and Kafr El-Gazzar.
    // Never wrap landmarks
    // back to the beginning when the streamed road continues.
    const m = idx - shopSegments;
    let left = 'tower', right = 'tower';
    if (m === 0) left = 'station';
    if (m === 1) right = 'sidestreet';
    if (m === 3) left = 'sidestreet';
    // The mosque stays on the left side of the statue approach; the underpass
    // is on the opposite (right) side and closer to the station.
    if (m === 4) left = 'mosque';
    if (m === 5) right = 'none'; // leave the right-side underpass portal clear
    if (m === 6) { left = 'sidestreet'; right = 'sidestreet'; }
    // Extra real junctions: single side streets (traffic merges in) and crossroads (traffic drives straight through).
    if (m === 2 || m === 10 || m === 17) { left = 'sidestreet'; right = 'sidestreet'; }
    if (m === 12 || m === 15) left = 'sidestreet';
    if (m >= 7 && m < 9) { left = 'tower'; right = 'none'; }
    else if (m >= 18 && m < 22) { left = 'canal'; right = 'canal'; }
    else if (m >= 22 && m < 26) { left = 'villas'; right = 'villas'; }
    if (m >= 13 && m <= 15) right = 'stadium';
    const p = {
      left, right,
      bridge: m >= 18 && m <= 20,
      tunnel: m === 5,
      shopVariant: idx,
      signText: ({
        3: 'شارع سعد زغلول',
        9: 'شارع فريد ندا',
        12: 'منطقة الاستاد',
        16: 'استاد بنها',
      })[m] || null,
    };
    return p;
  }
  function buildSide(kind, rnd, s, idx) {
    const b = new Builder(), ground = () => b.plane(MAT.grass, 42, L + .05, s * 29.6, -.04, 0, 0, -Math.PI / 2, 0, [8, 3]);
    if (kind === 'villas') {
      ground();
      const twin = rnd() > .72;
      if (twin) { villa(b, rnd, s, { w: 5.2, zc: -3.5 }); villa(b, rnd, s, { w: 5.2, zc: 3.6 }); } else villa(b, rnd, s);
      if (rnd() > .4) parkedCar(b, rnd, s * 4.65, (rnd() - .5) * 8, s > 0 ? 1 : -1);
      streetFurniture(b, rnd, s, { lamp: true, trees: true });
    } else if (kind === 'tower') { ground(); tower(b, rnd, s, [], idx); }
    else if (kind === 'stadium') { ground(); banhaStadium(b, s); streetFurniture(b, rnd, s, { lamp: true, trees: false }); }
    else if (kind === 'station') { ground(); banhaStation(b); }
    else if (kind === 'canal') canal(b, rnd, s);
    else if (kind === 'mosque') { ground(); mosque(b, rnd, s); }
    else if (kind === 'shops') { ground(); shops(b, rnd, s, idx, storeNames); }
    else if (kind === 'sidestreet') { ground(); sideStreet(b, rnd, s); }
    const built = b.build(false);
    if (kind === 'station') built.position.z = 6;
    const storeOffset = idx * 4 + (s > 0 ? 2 : 0);
    if (kind === 'shops' && hasWalker()) {
      // Three distinct shopper looks based on the supplied references.
      const nm = storeNames.slice(storeOffset, storeOffset + 2).map(brandOf);
      const bagPalette = [...nm.map((x) => x.color), '#1E5F8F', '#C4573A', '#F4B63E'];
      const looks = ['grocery', 'hijabi', 'hoodie'];
      const mk = (hgt, bi, look) => makeShopper(hgt, { style: look, bags: [bagPalette[bi % bagPalette.length], rnd() > .62 ? bagPalette[(bi + 1) % bagPalette.length] : null] });
      // Walk along the shopfronts, occasionally turning slightly toward a window
      // as if browsing. No stationary greeters or waving poses.
      for (let k = 0; k < 2; k++) {
        const dir = (k + (s > 0 ? 1 : 0)) % 2 ? 1 : -1;
        const look = looks[(idx * 2 + (s > 0 ? 1 : 0) + k) % looks.length];
        const p = mk(look === 'hijabi' ? 1.62 : 1.72 + rnd() * .08, k + 1, look);
        p.position.set(s * (6.9 + (k % 2) * .5), 0, -4.8 + k * 8 + rnd());
        p.rotation.y = dir > 0 ? 0 : Math.PI;
        p.userData.stroll = { dir, speed: .75 + rnd() * .5, zMin: -6.3, zMax: 6.3, baseYaw: p.rotation.y, shopSide: s };
        p.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // walkers are small and far: no shadow pass for them
        built.add(p);
      }
    }
    return built;
  }
  const queue = [];
  // Keep direct references to the few animated people. Traversing every shop,
  // building, sign, and prop in all nine streamed segments on every frame
  // caused avoidable CPU work while the player was moving.
  function trackActors(slot, group) {
    group.traverse((o) => {
      if (o.userData.mixer || o.userData.wave || o.userData.hang) slot.actors.push(o);
    });
  }
  function mountCrossingTrain(slot, idx, token) {
    const rig = new THREE.Group();
    rig.visible = false; rig.position.set(0, 0, -59); slot.group.add(rig);
    slot.trainRig = rig; if (!slot.spare) crossingTrain = rig;
    loadTangaraAsset().then((gltf) => {
      if (disposed || rig.userData.dead) return;
      const model = gltf.scene.clone(true);
      model.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some((m) => /tracks?/i.test(m?.name || ''))) { o.visible = false; return; }
        o.geometry = o.geometry.clone();
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        o.castShadow = true; o.receiveShadow = true;
      });
      // The supplied model and elevated tracks run along the avenue's Z axis.
      model.rotation.y = 0;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      if (!Number.isFinite(size.z) || size.z < 1) return;
      const scale = 76 / size.z;
      model.scale.setScalar(scale);
      model.position.set(15.6 - center.x * scale, 5.86 - bounds.min.y * scale, -center.z * scale);
      rig.add(model); patchBend(model);
    }).catch(() => {});
  }
  // Built segments are cached by route index (the route is fixed and deterministic). Recycling a slot then only
  // re-parents ready-made, already-uploaded geometry instead of rebuilding it: no CPU spike, no GPU upload.
  const segCache = new Map(); // idx -> { holder, children, actors, trainRig, tunnelVan }
  const CACHE_MAX = (typeof window !== 'undefined' && window.innerWidth < 700) ? 12 : 48;
  const cacheFinish = (slot, idx) => {
    if (segCache.has(idx) || segCache.size >= CACHE_MAX) return;
    slot.group.updateMatrixWorld();
    segCache.set(idx, { owner: slot, holder: slot.group, children: [...slot.group.children], actors: [...slot.actors], trainRig: slot.trainRig, tunnelVan: slot.tunnelVan });
  };
  function releaseSlot(slot) {
    if (slot.trainRig === crossingTrain) crossingTrain = null;
    const entry = segCache.get(slot.idx);
    if (entry && entry.owner === slot) { // keep the built segment alive in the cache under a private holder
      const holder = new THREE.Group(); for (const c of [...slot.group.children]) holder.add(c);
      entry.holder = holder; entry.owner = null;
    } else {
      if (slot.trainRig) slot.trainRig.userData.dead = true;
      for (const c of [...slot.group.children]) { disposeGroup(c); slot.group.remove(c); }
    }
    slot.trainRig = null; slot.tunnelVan = null; slot.actors.length = 0;
  }
  function rebuild(slot, idx, immediate = false) {
    releaseSlot(slot);
    const hit = segCache.get(idx);
    if (hit && hit.owner == null) {
      slot.idx = idx; slot.token = (slot.token || 0) + 1;
      for (const c of hit.children) slot.group.add(c);
      slot.actors.push(...hit.actors); slot.trainRig = hit.trainRig; slot.tunnelVan = hit.tunnelVan;
      if (hit.trainRig) crossingTrain = hit.trainRig;
      hit.owner = slot;
      return;
    }
    slot.idx = idx; slot.token = (slot.token || 0) + 1; const token = slot.token;
    const p = plan(idx), rnd = rngFrom(idx * 7919 + 17);
    // Each piece is built on its own frame so a recycled segment never causes a long hitch.
    const jobs = [
      () => { const g = buildSide(p.left, rnd, -1, idx); slot.group.add(g); patchBend(g); trackActors(slot, g); },
      () => { const g = buildSide(p.right, rnd, 1, idx); slot.group.add(g); patchBend(g); trackActors(slot, g); },
      () => {
        const extra = new Builder();
        const m = idx - shopSegments;
        roadProps(extra, rnd, idx, p);
        if (m === 6) extra.object(saadZaghloulStatue(), 0, 0, -7);
        if (m === 16) gantry(extra);
        if (idx % 2 === 0 && p.left !== 'nile') utilityPole(extra, p.left === 'shops' ? -7.65 : -8.2, 0, -1);
        if (idx % 2 === 1 && p.right !== 'sidestreet') utilityPole(extra, p.right === 'shops' ? 7.65 : 8.2, 0, 1);
        if (p.signText && p.right === 'tower') streetSign(extra, 1, p.signText);
        const g = extra.build(false); slot.group.add(g); patchBend(g);
        if (idx % 2 === 0 && p.left !== 'nile') { const w = wires(-1); slot.group.add(w); patchBend(w); }
        if (idx % 2 === 1 && p.right !== 'sidestreet') { const w = wires(1); slot.group.add(w); patchBend(w); }
        if (p.left === 'shops' && idx % 2 === 0) { const w = crossStreetWires(); slot.group.add(w); patchBend(w); }
        if (p.tunnel) {
          const tunnel = buildTunnel(); slot.group.add(tunnel); patchBend(tunnel);
          mountCrossingTrain(slot, idx, token);
          const van = makeMicrobus('بنها - المنشية');
          van.rotation.y = Math.PI / 2; van.position.set(6.4, 0, 0); van.visible = false;
          slot.group.add(van); slot.tunnelVan = van; patchBend(van);
        }
        if (p.bridge) { const br = buildBridge(idx - shopSegments === 18); slot.group.add(br); patchBend(br); }
      },
    ];
    jobs.push(() => cacheFinish(slot, idx));
    for (const job of jobs) { const guarded = () => { if (slot.token === token) job(); }; immediate ? guarded() : queue.push(guarded); }
  }
  // Start the storefront strip ahead of the courier. Previously segment 0 was
  // partly behind the camera, cropping the nearest shop names at both edges.
  slots.forEach((slot, k) => { rebuild(slot, startIdx + k, true); slot.z = -10 - k * L; slot.group.position.z = slot.z; });
  let nextIdx = startIdx + N, minIdx = startIdx;

  patchBend(root); bendFree.forEach((o) => { o.material.userData.noBend = true; });
  [sunSprite, ...clouds].forEach((o) => { o.material.userData.noBend = true; });

  let distance = 0;
  const api = {
    curve: 0,
    getSaadStatueObstacle() {
      const slot = slots.find((item) => item.idx - shopSegments === 6);
      return slot ? { x: 0, z: slot.z - 7, halfWidth: 2.05, halfDepth: 5.9 } : null;
    },
    reset() {
      // Free roaming advances the streamed street too. Put every segment and
      // scrolling surface back at the route start before a scored challenge.
      queue.length = 0; distance = 0; trainClock = 0; nextIdx = startIdx + N; minIdx = startIdx;
      slots.forEach((slot, k) => {
        slot.z = -10 - k * L; slot.group.position.z = slot.z;
        rebuild(slot, startIdx + k, true);
      });
      markings.forEach((mark, index) => { mark.position.z = -120 + (index % 20) * 7; });
      roadTex.offset.set(0, 0); roadNormal.offset.set(0, 0);
      curbTex.offset.set(0, 0); padTex.offset.set(0, 0); padNormal.offset.set(0, 0);
      MAT.water.map.offset.set(0, 0);
      WORLD_BEND.uCurve.value = 0; WORLD_BEND.uHill.value = 0; api.curve = 0;
    },
    setNight(enabled) {
      nightMode = !!enabled;
      scene.background.set(nightMode ? '#1D3048' : '#F7DEB8');
      scene.fog.color.set(nightMode ? '#354760' : '#F0DABC');
      scene.fog.near = nightMode ? 32 : 58; scene.fog.far = 220;
      if (hemi) {
        hemi.color.set(nightMode ? '#7188A8' : '#FFF7E8');
        hemi.groundColor.set(nightMode ? '#59616D' : '#A7957C');
        hemi.intensity = nightMode ? 1.15 : (envUrl ? 1.25 : 1.4);
      }
      if (sun) sun.intensity = nightMode ? .3 : 2.9;
      scene.environmentIntensity = nightMode ? .4 : .62;
      if (sky) sky.visible = !nightMode;
      if (sunSprite) sunSprite.visible = !nightMode;
      for (const cloud of clouds) cloud.visible = !nightMode;
      if (farFloor) farFloor.material.color.set(nightMode ? '#354760' : '#D9BE98');
    },
    refreshParkedVehicles() {
      const parked = [];
      [root, ...[...segCache.values()].filter((e) => !e.owner).map((e) => e.holder)].forEach((r) => r.traverse((object) => { if (object.userData.parkedVehicleType) parked.push(object); }));
      for (const old of parked) {
        const replacement = makeParkedVehicle(old.userData.parkedVehicleType, Math.random);
        replacement.userData.parkedVehicleType = old.userData.parkedVehicleType;
        replacement.position.copy(old.position); replacement.rotation.copy(old.rotation); replacement.scale.copy(old.scale);
        old.parent.add(replacement); old.parent.remove(old); patchBend(replacement);
      }
      return parked.length;
    },
    /**
     * Warm-up during the loading screen. Builds every route segment once off-screen so the first time a
     * shop sign texture, a tunnel/bridge/train or a new shader shows up it is already compiled and uploaded
     * (that first-time work is what caused the hitches at specific places). Nothing visible changes.
     */
    async prewarm(maxMs = 7000, isBusy = () => false) {
      if (disposed || !renderer) return;
      const t0 = performance.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      try { await loadWalker(); } catch { /* shoppers are optional */ }
      const total = shopSegments + 26;
      const rt = new THREE.WebGLRenderTarget(4, 4);
      let gateOpen = true;
      const gate = new Promise((resolve) => setTimeout(() => { gateOpen = false; resolve(); }, maxMs));
      const work = (async () => {
        for (let i = 0; i < total && !disposed && segCache.size < CACHE_MAX; i++) {
          while (!gateOpen && isBusy() && !disposed) await sleep(400); // after loading, only warm up while the player is idle
          const idx = startIdx + i;
          if (segCache.has(idx)) continue;
          const spare = { group: new THREE.Group(), actors: [], idx: -1, token: 0, z: 0, spare: true };
          root.add(spare.group);
          rebuild(spare, idx, true);
          // Upload geometry + textures and compile shaders off-screen (4x4 target: nothing is shown).
          try { spare.group.updateMatrixWorld(true); renderer.setRenderTarget(rt); renderer.render(scene, camera); } catch { /* best effort */ }
          renderer.setRenderTarget(null);
          releaseSlot(spare); root.remove(spare.group);
          await sleep(gateOpen ? 0 : 30);
        }
      })();
      await Promise.race([work, gate]);
      if (!gateOpen) work.finally(() => rt.dispose()); else rt.dispose();
    },
    /** z of a streamed crossroad (side streets on BOTH sides, not the statue square) whose centre lies in [zMin, zMax], else null. */
    crossroadNear(zMin, zMax) {
      for (const slot of slots) {
        if (slot.idx < 0) continue;
        const p = plan(slot.idx);
        if (p.left === 'sidestreet' && p.right === 'sidestreet' && slot.idx - shopSegments !== 6 && slot.z >= zMin && slot.z <= zMax) return slot.z;
      }
      return null;
    },
    /** z of a streamed side street on that side (-1 left / +1 right) whose mouth lies in [zMin, zMax], else null. */
    junctionNear(side, zMin, zMax) {
      for (const slot of slots) {
        if (slot.idx < 0) continue;
        const p = plan(slot.idx);
        if ((side > 0 ? p.right : p.left) === 'sidestreet' && slot.z >= zMin && slot.z <= zMax) return slot.z;
      }
      return null;
    },
    update(dt, speed) {
      distance += speed * dt; sky.position.copy(camera.position);
      trainClock += dt;
      if (crossingTrain) {
        const phase = trainClock % 24;
        crossingTrain.visible = phase < 12;
        crossingTrain.position.z = phase < 12 ? THREE.MathUtils.lerp(-59, 59, phase / 12) : -59;
      }
      sunSprite.position.set(camera.position.x + 3, camera.position.y + 18, camera.position.z - 90);
      const ramp = Math.max(0, Math.min(1, distance / 90));
      const curve = ramp * (0.0036 * Math.sin(distance / 64) + 0.0018 * Math.sin(distance / 27 + 1.3));
      const hill = ramp * 0.0011 * Math.sin(distance / 71 + .6);
      WORLD_BEND.uCurve.value = curve; WORLD_BEND.uHill.value = hill; api.curve = curve;
      const dz = speed * dt;
      for (const slot of slots) {
        if (slot.tunnelVan) {
          const phase = trainClock % 26;
          slot.tunnelVan.visible = phase < 9;
          slot.tunnelVan.position.x = 6.4 + (phase < 9 ? phase / 9 : 0) * 31;
        }
        if (slot.z > -52) for (const actor of slot.actors) { // far segments: skip animating people nobody can see
          const st = actor.userData.stroll;
          if (st) {
            const browse = Math.sin(distance * .11 + actor.position.z * .34) > .88;
            actor.userData.mixer?.update(dt * st.speed * (browse ? .52 : .9));
            actor.position.z += st.dir * st.speed * dt;
            actor.rotation.y = st.baseYaw + (browse ? st.shopSide * .22 : 0);
            if ((st.dir > 0 && actor.position.z > st.zMax) || (st.dir < 0 && actor.position.z < st.zMin)) { st.dir *= -1; actor.rotation.y += Math.PI; }
          } else actor.userData.mixer?.update(dt * .32);
          actor.userData.wave?.(distance + (actor.position.z || 0));
          actor.userData.hang?.();
        }
        slot.z += dz; slot.group.position.z = slot.z;
        if (slot.z > 4 + L) { slot.z -= N * L; rebuild(slot, nextIdx++); minIdx++; }
        else if (slot.z < 2 - (N - 1) * L && minIdx > startIdx) { slot.z += N * L; minIdx--; nextIdx--; rebuild(slot, minIdx); } // walking back toward the start
      }
      const job = queue.shift(); if (job) job();
      const period = 140 / 14;
      roadTex.offset.y = (roadTex.offset.y + dz * 14 / 230) % 1; roadNormal.offset.y = roadTex.offset.y;
      curbTex.offset.y = (curbTex.offset.y + dz * 70 / 230) % 1;
      padTex.offset.y = (padTex.offset.y + dz * 18 / 230) % 1; padNormal.offset.y = padTex.offset.y;
      MAT.water.map.offset.y = (MAT.water.map.offset.y + dt * .01) % 1; void period;
      for (const m of markings) { m.position.z += dz; if (m.position.z > 8) m.position.z -= 140; }
      for (const c of clouds) { c.position.x += dt * .6; if (c.position.x > 130) c.position.x = -130; }
    },
    dispose() {
      disposed = true;
      for (const slot of slots) for (const c of [...slot.group.children]) disposeGroup(c);
      for (const e of segCache.values()) if (!e.owner) for (const c of [...e.holder.children]) disposeGroup(c);
      segCache.clear();
      scene.remove(root); scene.environment = null; envTexture?.dispose(); WORLD_BEND.uCurve.value = 0; WORLD_BEND.uHill.value = 0;
    },
  };
  // If this world is created before the character model finishes loading,
  // rebuild the storefront strip so its shoppers can use the rigged model.
  loadWalker().then((loaded) => {
    if (!loaded || disposed) return;
    for (const slot of slots) {
      if (slot.idx >= 0 && plan(slot.idx).left === 'shops') rebuild(slot, slot.idx, true);
    }
  });
  return api;
}
