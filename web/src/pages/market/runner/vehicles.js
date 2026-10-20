// Banha Runner — higher-fidelity vehicles (extruded side profiles, glass, lights, plates).
// Everything is procedural: no external image/model files.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shared vertex-colour materials: lets hundreds of differently-coloured primitives share ONE draw call.
export const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75, metalness: .05 });
export const VCF = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0, flatShading: true });
export function vcOf(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.keep || m.vertexColors || m.map || m.alphaTest > 0 || m.transparent || m.side !== THREE.FrontSide || m.emissive.getHex() !== 0) return null;
  return m.flatShading ? VCF : VC;
}
export function withColors(geo, m) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}
/** Merge a Group of meshes into a handful of meshes (one per distinct non-vertex-colour material + shared VC). */
export function bake(group, castShadow = true) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld), key = o.material;
    const vm = vcOf(o.material);
    if (vm) { withColors(g, o.material); key = vm; }
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(g);
  });
  const out = new THREE.Group();
  for (const [material, list] of buckets) {
    const geo = mergeGeometries(list, false); list.forEach((g) => g.dispose()); if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = castShadow && (material === VC || material.userData.keep === true); out.add(mesh);
  }
  return out;
}

const matCache = new Map();
const paintCache = new Map();
/** Glossy clear-coated car paint / glass. Kept as separate (shared) materials so they pick up the HDRI reflections. */
export function paintMat(color) {
  if (!paintCache.has(color)) { const m = new THREE.MeshPhysicalMaterial({ color, roughness: .38, metalness: .55, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.1 }); m.userData.keep = true; paintCache.set(color, m); }
  return paintCache.get(color);
}
let glassMaterial = null;
export function glassMat() {
  if (!glassMaterial) { glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#16242C', roughness: .04, metalness: .15, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6 }); glassMaterial.userData.keep = true; }
  return glassMaterial;
}
export function stdMat(color, roughness = .6, metalness = .05, extra = {}) {
  const key = color + '|' + roughness + '|' + metalness + '|' + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  return matCache.get(key);
}

const texCache = new Map();
export function textTexture(text, { bg = '#1c2b36', color = '#fff', width = 256, height = 64, font = 900, size = 34, border } = {}) {
  const key = [text, bg, color, width, height, size, border].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.strokeRect(2, 2, width - 4, height - 4); }
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.font = font + ' ' + size + 'px system-ui, sans-serif';
  ctx.fillText(text, width / 2, height / 2 + 2, width - 14);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  texCache.set(key, tex); return tex;
}

function plateTexture() {
  const key = 'plate';
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#F4F1E8'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#1C5FA8'; x.fillRect(0, 0, 256, 34);
  x.fillStyle = '#fff'; x.font = '900 24px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.fillText('مصر  •  EGYPT', 128, 18);
  x.fillStyle = '#16202A'; x.font = '900 46px system-ui'; x.fillText('ب ن هـ  ٤٨٢٧', 128, 84, 232);
  x.strokeStyle = '#16202A'; x.lineWidth = 5; x.strokeRect(3, 3, 250, 122);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}

const geoCache = new Map();
function extrude(shape, depth, bevel = .07) {
  const key = shape.uuid + depth;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(depth - bevel * 2) / 2); geoCache.set(key, g); return g;
}

// A plane laid on a (z, y) segment of the side profile, normal pointing up/out.
function slopedQuad(width, [z1, y1], [z2, y2], material, lift = .012) {
  const dz = z2 - z1, dy = y2 - y1, len = Math.hypot(dz, dy);
  let nz = -dy / len, ny = dz / len; if (ny < 0) { nz = -nz; ny = -ny; }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), material);
  mesh.rotation.x = Math.atan2(-ny, nz);
  mesh.position.set(0, (y1 + y2) / 2 + ny * lift, (z1 + z2) / 2 + nz * lift);
  return mesh;
}

function wheel(g, x, z, radius = .31) {
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .22, 18), stdMat('#14181C', .95, 0));
  tire.rotation.z = Math.PI / 2; tire.position.set(x, radius, z); tire.castShadow = true; g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .58, radius * .58, .235, 14), stdMat('#B9BEC4', .35, .7));
  hub.rotation.z = Math.PI / 2; hub.position.set(x, radius, z); g.add(hub);
}

function lights(g, width, zFront, y, color = '#FFF1C4', emissive = '#6A5520') {
  const lamp = stdMat(color, .3, 0, { emissive, emissiveIntensity: .8 });
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(.3, .15, .08), lamp); l.position.set(sx * (width / 2 - .3), y, zFront); g.add(l);
  }
}

function plate(g, y, z, w = .5) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * .5), new THREE.MeshBasicMaterial({ map: plateTexture() }));
  p.position.set(0, y, z); g.add(p); return p;
}


const box = (g, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
// Dark wheel arch + door seams + B-pillar, shared by the sedan and the van.
function bodyDetails(g, W, { arches, seams, pillarZ, pillarY, pillarH, seamY, seamH, archR }) {
  const seam = stdMat('#1B1E22', .9, 0), arch = stdMat('#0E1114', 1, 0);
  for (const z of arches) { const c = new THREE.Mesh(new THREE.CylinderGeometry(archR, archR, W + .03, 18), arch); c.rotation.z = Math.PI / 2; c.position.set(0, .31, z); g.add(c); }
  for (const z of seams) box(g, W + .03, seamH, .014, seam, 0, seamY, z);
  box(g, W + .035, pillarH, .06, seam, 0, pillarY, pillarZ);
  for (const sx of [-1, 1]) for (const z of seams.slice(0, 2)) box(g, .02, .035, .14, stdMat('#C9CDD2', .3, .8), sx * (W / 2 + .02), seamY + seamH * .3, z - .17);
}

const SEDAN_COLORS = ['#E9EBEC', '#E9EBEC', '#C9CDD2', '#2F5C86', '#8E2F28', '#2E3238', '#A8B0B7', '#E9EBEC'];
let sedanShape = null;
export function makeSedan(color) {
  if (hasReal('car')) return realVehicle('car');
  const g = new THREE.Group(), W = 1.72;
  const paint = paintMat(color || SEDAN_COLORS[Math.floor(Math.random() * SEDAN_COLORS.length)]);
  const glass = glassMat();
  if (!sedanShape) {
    const s = new THREE.Shape();
    s.moveTo(-1.42, .28); s.lineTo(-1.45, .7); s.quadraticCurveTo(-1.44, .86, -1.28, .88); s.lineTo(-.9, .9);
    s.quadraticCurveTo(-.55, 1.2, -.28, 1.3); s.lineTo(.2, 1.3); s.quadraticCurveTo(.5, 1.22, .68, .94);
    s.lineTo(1.2, .85); s.quadraticCurveTo(1.44, .8, 1.47, .6); s.lineTo(1.45, .28); s.closePath(); sedanShape = s;
  }
  const body = new THREE.Mesh(extrude(sedanShape, W), paint); body.rotation.y = -Math.PI / 2; body.castShadow = true; g.add(body);
  const win = new THREE.Shape();
  win.moveTo(-.82, .95); win.lineTo(-.54, 1.2); win.lineTo(-.24, 1.27); win.lineTo(.2, 1.27); win.lineTo(.44, 1.2); win.lineTo(.64, .95); win.closePath();
  const sideGlass = new THREE.Mesh(new THREE.ExtrudeGeometry(win, { depth: W + .06, bevelEnabled: false }), glass);
  sideGlass.geometry.translate(0, 0, -(W + .06) / 2); sideGlass.rotation.y = -Math.PI / 2; g.add(sideGlass);
  g.add(slopedQuad(W - .3, [.24, 1.3], [.76, .94], glass, .105));
  g.add(slopedQuad(W - .3, [-.9, .9], [-.26, 1.3], glass, .105));
  bodyDetails(g, W, { arches: [-.9, .9], seams: [.52, -.08, -.72], pillarZ: -.08, pillarY: 1.1, pillarH: .3, seamY: .66, seamH: .5, archR: .38 });
  // Trunk lid line, bonnet line and chrome belt strip
  const dark = stdMat('#171B1F', .8, .1), chrome = stdMat('#C9CDD2', .25, .85);
  box(g, W - .1, .015, .015, dark, 0, .9, 0).position.set(0, .905, .72);
  box(g, W + .02, .03, 2.6, chrome, 0, .6, 0).scale.set(1, 1, 1); g.children[g.children.length - 1].visible = false;
  box(g, W - .06, .16, .1, dark, 0, .34, 1.45); box(g, W - .06, .16, .1, dark, 0, .36, -1.42);
  box(g, .84, .13, .05, dark, 0, .64, 1.47); box(g, .86, .02, .05, chrome, 0, .72, 1.475);
  // Wrap-around headlights and tail lights
  const lamp = stdMat('#F4F1E0', .15, 0, { emissive: '#6A5520', emissiveIntensity: .8 });
  for (const sx of [-1, 1]) { box(g, .38, .13, .1, lamp, sx * (W / 2 - .3), .72, 1.44).rotation.y = sx * .25; box(g, .06, .12, .3, lamp, sx * (W / 2 - .03), .72, 1.3); }
  const tail = stdMat('#D8262B', .4, 0, { emissive: '#7A0D10', emissiveIntensity: .7 });
  for (const sx of [-1, 1]) box(g, .42, .13, .06, tail, sx * (W / 2 - .3), .75, -1.43);
  for (const sx of [-1, 1]) box(g, .12, .1, .18, paint, sx * (W / 2 + .06), 1.0, .52);
  for (const sx of [-1, 1]) for (const z of [-.9, .9]) wheel(g, sx * (W / 2 - .04), z);
  plate(g, .42, 1.49, .5); plate(g, .5, -1.46, .5);
  box(g, W - .2, .16, 2.5, stdMat('#101316', 1, 0), 0, .3, 0);
  return bake(g);
}

let busShape = null;
export function makeMicrobus(route = 'بنها - القاهرة') {
  if (hasReal('microbus')) return realVehicle('microbus');
  // Toyota Hiace-style high-roof van, the standard Egyptian microbus: white with a sliding door and rows of windows.
  const g = new THREE.Group(), W = 1.78;
  const white = paintMat('#F1F2F0'), glass = glassMat(), dark = stdMat('#171B1F', .8, .1), chrome = stdMat('#C9CDD2', .25, .85);
  if (!busShape) {
    const s = new THREE.Shape();
    s.moveTo(-1.68, .3); s.lineTo(-1.7, 1.95); s.quadraticCurveTo(-1.68, 2.1, -1.5, 2.1); s.lineTo(.78, 2.1);
    s.quadraticCurveTo(.98, 2.08, 1.06, 1.9); s.lineTo(1.5, 1.14); s.quadraticCurveTo(1.74, 1.04, 1.76, .8); s.lineTo(1.74, .3); s.closePath(); busShape = s;
  }
  const body = new THREE.Mesh(extrude(busShape, W), white); body.rotation.y = -Math.PI / 2; body.castShadow = true; g.add(body);
  // Window band with pillars: front door window, then the sliding-door window, then 2 fixed rear windows.
  const winShape = new THREE.Shape(); winShape.moveTo(-1.5, 1.3); winShape.lineTo(-1.5, 1.85); winShape.lineTo(.84, 1.85); winShape.lineTo(1.0, 1.3); winShape.closePath();
  const wg = new THREE.ExtrudeGeometry(winShape, { depth: W + .06, bevelEnabled: false }); wg.translate(0, 0, -(W + .06) / 2);
  const sideGlass = new THREE.Mesh(wg, glass); sideGlass.rotation.y = -Math.PI / 2; g.add(sideGlass);
  for (const z of [.3, -.35, -.95]) box(g, W + .035, .56, .07, white, 0, 1.57, z);
  g.add(slopedQuad(W - .22, [.96, 1.92], [1.46, 1.16], glass, .105));
  g.add(slopedQuad(W - .22, [-1.7, 1.2], [-1.7, 1.9], glass, .02));
  // Sliding door rails, seams, belt line stripe (thin colour line like many Banha vans)
  const seam = stdMat('#1B1E22', .9, 0);
  for (const z of [.33, -.62]) box(g, W + .03, 1.0, .014, seam, 0, .86, z);
  box(g, W + .03, .014, .9, seam, 0, 1.3, -.15);
  const stripeCol = stdMat(['#1F5FA8', '#1F6B52', '#B54B3D', '#2F2F34'][Math.floor(Math.random() * 4)], .55, .1);
  box(g, W + .02, .12, 3.0, stripeCol, 0, .98, -.15);
  for (const sx of [-1, 1]) box(g, .02, .04, .16, chrome, sx * (W / 2 + .02), .9, .15);
  for (const z of [-1.1, 1.1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, W + .03, 18), stdMat('#0E1114', 1, 0)); c.rotation.z = Math.PI / 2; c.position.set(0, .34, z); g.add(c); }
  // Route board, front grille, headlights, bumpers, tail lights, roof ribs
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .26), new THREE.MeshBasicMaterial({ map: textTexture(route, { bg: '#10202B', color: '#FFD45A', width: 320, height: 72, size: 42 }) }));
  board.position.set(0, 1.93, 1.0); board.rotation.x = -.5; g.add(board);
  box(g, W, .2, .14, dark, 0, .36, 1.77); box(g, .9, .2, .05, dark, 0, .78, 1.77); box(g, .92, .03, .05, chrome, 0, .9, 1.775);
  const lamp = stdMat('#F4F1E0', .15, 0, { emissive: '#6A5520', emissiveIntensity: .8 });
  for (const sx of [-1, 1]) box(g, .34, .22, .1, lamp, sx * (W / 2 - .28), .88, 1.73);
  const tail = stdMat('#D8262B', .4, 0, { emissive: '#7A0D10', emissiveIntensity: .7 });
  for (const sx of [-1, 1]) box(g, .14, .62, .06, tail, sx * (W / 2 - .1), 1.0, -1.71);
  box(g, W, .18, .12, dark, 0, .38, -1.74);
  for (const x of [-.45, 0, .45]) box(g, .05, .03, 2.9, stdMat('#D9DCDC', .6), x, 2.115, -.4);
  for (const sx of [-1, 1]) box(g, .12, .24, .1, dark, sx * (W / 2 + .08), 1.42, .95);
  for (const sx of [-1, 1]) for (const z of [-1.1, 1.1]) wheel(g, sx * (W / 2 - .04), z, .34);
  plate(g, .55, 1.79, .52); plate(g, .6, -1.76, .52);
  box(g, W - .2, .16, 3.2, stdMat('#101316', 1, 0), 0, .32, 0);
  return bake(g);
}

const BIKE_COLORS = ['#B32A22', '#1F4E8C', '#2E3238', '#D9D9D4'];
export function makeMotorcycle() {
  if (hasReal('bike')) return realVehicle('bike');
  const g = new THREE.Group();
  const paint = paintMat(BIKE_COLORS[Math.floor(Math.random() * BIKE_COLORS.length)]), dark = stdMat('#15181B', .7, .2), chrome = stdMat('#C9CDD2', .25, .85);
  const shirt = stdMat(['#3F6C8F', '#B4503C', '#5D7F52', '#E4DED0', '#2F4F5E'][Math.floor(Math.random() * 5)], .9), skin = stdMat('#B97D58', .7), pants = stdMat('#2B3645', .9);
  for (const z of [-.62, .62]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .12, 18), stdMat('#14181C', .95, 0)); t.rotation.z = Math.PI / 2; t.position.set(0, .3, z); g.add(t); const h = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .13, 12), chrome); h.rotation.z = Math.PI / 2; h.position.set(0, .3, z); g.add(h); }
  box(g, .16, .22, .9, dark, 0, .42, 0);
  const tank = box(g, .24, .2, .45, paint, 0, .72, .2); box(g, .22, .09, .55, dark, 0, .7, -.32);
  box(g, .08, .5, .08, chrome, 0, .55, .7).rotation.x = -.35;
  box(g, .5, .04, .04, dark, 0, 1.0, .5); box(g, .18, .16, .12, stdMat('#F4F1E0', .15, 0, { emissive: '#6A5520', emissiveIntensity: .9 }), 0, .88, .66);
  box(g, .12, .12, .06, stdMat('#D8262B', .4, 0, { emissive: '#7A0D10', emissiveIntensity: .8 }), 0, .66, -.75);
  box(g, .1, .1, .5, chrome, .14, .3, -.3);
  // Rider (no helmet, as is common): torso leaning forward, arms to the bars, legs bent
  const torso = box(g, .38, .56, .26, shirt, 0, 1.12, -.12); torso.rotation.x = .28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), skin); head.position.set(0, 1.56, .0); g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * .5), stdMat('#26221F', .9)); hair.position.set(0, 1.58, -.01); g.add(hair);
  for (const sx of [-1, 1]) { const a = box(g, .09, .46, .09, shirt, sx * .25, 1.17, .22); a.rotation.x = 1.0; box(g, .13, .13, .3, pants, sx * .17, .86, -.22).rotation.x = -.3; box(g, .11, .5, .11, pants, sx * .2, .62, .0).rotation.x = .25; box(g, .1, .08, .22, dark, sx * .2, .38, .1); }
  return bake(g);
}

// Egyptian "توكتوك" (Bajaj RE style): black soft roof, open sides, one front wheel under a big mudguard,
// painted nose, slanted windscreen, rear bench. Front faces +z.
const TUK = [
  { front: '#F0B400', rear: '#15171A' }, { front: '#F0B400', rear: '#F0B400' }, { front: '#1F5FA6', rear: '#1F5FA6' },
  { front: '#15171A', rear: '#15171A', trim: '#F0B400' }, { front: '#F0B400', rear: '#15171A' },
];
function halfArch(g, r, w, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20, 1, true, 0, Math.PI), mat); m.material.side = THREE.DoubleSide;
  m.rotation.z = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
}
export function makeTuktuk() {
  const g = new THREE.Group(), W = 1.3, v = TUK[Math.floor(Math.random() * TUK.length)];
  const front = paintMat(v.front), rear = paintMat(v.rear), trim = paintMat(v.trim || v.front), black = stdMat('#121417', .8, .1), glass = new THREE.MeshPhysicalMaterial({ color: '#8FA8B2', roughness: .05, metalness: .1, transparent: true, opacity: .32, depthWrite: false }), seat = stdMat('#23262B', .95, 0), rubber = stdMat('#101214', .95, 0);
  const metal = stdMat('#B9BEC4', .35, .7);
  // chassis floor + rear body
  box(g, 1.02, .1, 2.0, black, 0, .3, -.1);
  box(g, 1.2, .46, .95, rear, 0, .6, -.62);
  box(g, 1.22, .08, .98, rear, 0, .86, -.62);
  for (const sx of [-1, 1]) { box(g, .05, .3, 1.4, rear, sx * .53, .42, -.15); halfArch(g, .33, .2, rear, sx * .6, .26, -.62); }
  // front nose (tapered), mudguard and wheel
  const nose = new THREE.Shape(); nose.moveTo(.28, .36); nose.lineTo(.3, .98); nose.lineTo(.68, 1.0); nose.quadraticCurveTo(1.0, .86, 1.08, .56); nose.lineTo(1.0, .38); nose.closePath();
  const noseMesh = new THREE.Mesh(extrude(nose, .62, .05), front); noseMesh.rotation.y = -Math.PI / 2; noseMesh.castShadow = true; g.add(noseMesh);
  halfArch(g, .34, .24, front, 0, .27, 1.0);
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .12, 18), rubber); fw.rotation.z = Math.PI / 2; fw.position.set(0, .27, 1.0); g.add(fw);
  const fh = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .14, 12), metal); fh.rotation.z = Math.PI / 2; fh.position.set(0, .27, 1.0); g.add(fh);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .15, 18), rubber); w.rotation.z = Math.PI / 2; w.position.set(sx * .6, .27, -.62); w.castShadow = true; g.add(w);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .16, 12), metal); h.rotation.z = Math.PI / 2; h.position.set(sx * .6, .27, -.62); g.add(h); }
  // headlight + indicators + front plate area
  const lamp = stdMat('#F6F1DC', .15, 0, { emissive: '#7A6420', emissiveIntensity: .9 });
  const hl = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .08, 16), lamp); hl.rotation.x = Math.PI / 2; hl.position.set(0, .78, 1.1); g.add(hl);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.125, .015, 8, 20), metal); ring.position.set(0, .78, 1.14); g.add(ring);
  // windscreen (slanted) with painted frame, roof, pillars
  g.add(slopedQuad(.98, [.72, 1.0], [.38, 1.72], glass, .02));
  box(g, 1.04, .06, .1, trim, 0, 1.0, .72).rotation.x = -.3;
  box(g, 1.1, .08, .14, trim, 0, 1.74, .36);
  for (const sx of [-1, 1]) { const p = box(g, .045, .8, .045, trim, sx * .52, 1.36, .55); p.rotation.x = .36; }
  box(g, 1.3, .07, 1.5, black, 0, 1.76, -.38).rotation.x = .02;
  box(g, 1.24, .62, .05, black, 0, 1.42, -1.06);
  for (const sx of [-1, 1]) { box(g, .04, 1.05, .04, black, sx * .6, 1.22, -1.0); box(g, .04, .9, .04, black, sx * .6, 1.28, -.05); }
  // seats, handlebar, dash
  box(g, .98, .14, .55, seat, 0, .88, -.55); box(g, .98, .5, .1, seat, 0, 1.15, -.9);
  box(g, .46, .13, .4, seat, 0, .66, .15);
  box(g, .64, .035, .035, metal, 0, .96, .5); for (const sx of [-1, 1]) box(g, .09, .035, .035, black, sx * .34, .96, .5);
  box(g, .2, .12, .14, black, 0, .94, .6);
  // mirrors, tail lights, plate
  for (const sx of [-1, 1]) { box(g, .02, .22, .02, metal, sx * .58, 1.1, .62); const m = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .02, 12), glass); m.rotation.x = Math.PI / 2; m.position.set(sx * .58, 1.24, .62); g.add(m); }
  const red = stdMat('#D8262B', .4, 0, { emissive: '#7A0D10', emissiveIntensity: .8 });
  for (const sx of [-1, 1]) box(g, .14, .1, .05, red, sx * .46, .74, -1.12);
  plate(g, .58, -1.14, .42).rotation.y = Math.PI;
  return bake(g);
}

// ---------------------------------------------------------------------------------------------
// Real 3D models. Drop GLB files into web/public/runner/models/ and they replace the built-in
// stand-ins automatically. Names: hiace.glb (microbus), sedan.glb, motorcycle.glb, tuktuk.glb.
// `length` = target length in game units (sedan ~2.9). `flip: true` if a model faces backwards.
// ---------------------------------------------------------------------------------------------
export const REAL_MODELS = {
  microbus: { file: 'hiace.glb', length: 3.5, flip: false },
  car: { file: 'sedan.glb', length: 2.9, flip: false },
  bike: { file: 'motorcycle.glb', length: 1.9, flip: false },
};
const REAL = {};
const hasReal = (k) => !!REAL[k];
export const realVehicle = (k) => {
  if (!REAL[k]) return null;
  const root = REAL[k].clone(true);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return root;
};
export async function loadRealVehicles(base = '/runner/models/') {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), found = [];
  await Promise.all(Object.entries(REAL_MODELS).map(async ([key, cfg]) => {
    try {
      const gltf = await loader.loadAsync(base + cfg.file);
      const model = gltf.scene, box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      const holder = new THREE.Group(); holder.add(model);
      if (size.x > size.z) model.rotation.y = Math.PI / 2; // longest horizontal axis -> z
      if (cfg.flip) model.rotation.y += Math.PI;
      const b2 = new THREE.Box3().setFromObject(holder), s2 = b2.getSize(new THREE.Vector3()), c = b2.getCenter(new THREE.Vector3());
      const k = cfg.length / Math.max(s2.z, .001);
      model.scale.multiplyScalar(k); model.position.set(-c.x * k, -b2.min.y * k, -c.z * k);
      REAL[key] = holder; found.push(key);
    } catch { /* file not provided: keep the built-in model */ }
  }));
  return found;
}
