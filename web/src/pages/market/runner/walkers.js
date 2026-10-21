// Real animated pedestrian (GLB with baked walk cycle). Falls back to the built-in figure if the file is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

let template = null, pendingLoad = null;
const shopperTemplates = { grocery: null, hijabi: null };
export const hasWalker = () => !!template || !!shopperTemplates.grocery || !!shopperTemplates.hijabi;
export async function loadWalker(url = '/runner/models/walker.glb') {
  if (template) return true;
  if (pendingLoad) return pendingLoad;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  pendingLoad = Promise.all([
    loader.loadAsync(url),
    loader.loadAsync('/runner/models/shopper-sam.glb').catch(() => null),
    loader.loadAsync('/runner/models/shopper-maya.glb').catch(() => null),
  ])
    .then(([loaded, sam, maya]) => { template = loaded; shopperTemplates.grocery = sam; shopperTemplates.hijabi = maya; return true; })
    .catch(() => false)
    .finally(() => { pendingLoad = null; });
  return pendingLoad;
}
export function makeWalker(height = 1.85, source = template) {
  const model = SkeletonUtils.clone(source.scene), holder = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model), k = height / Math.max(box.max.y - box.min.y, .01);
  model.scale.multiplyScalar(k); model.position.y = -box.min.y * k;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  holder.add(model);
  const mixer = new THREE.AnimationMixer(model);
  if (source.animations[0]) { const a = mixer.clipAction(source.animations[0]); a.time = Math.random() * source.animations[0].duration; a.play(); }
  holder.userData.mixer = mixer;
  return holder;
}

// A separate skinned GLB shopper gives tuk-tuk traffic a real 3D driver. Pose
// the rig into a compact seated posture instead of building the driver from
// primitive shapes; keep the existing procedural figure as a loading fallback.
export function makeSeatedTuktukDriver(height = 1.02) {
  const source = shopperTemplates.grocery;
  if (!source) return null;
  const model = SkeletonUtils.clone(source.scene), holder = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = height / Math.max(bounds.max.y - bounds.min.y, .01);
  model.scale.multiplyScalar(scale); model.position.y = -bounds.min.y * scale;
  const bones = {};
  model.traverse((o) => {
    if (!o.isBone) return;
    const name = o.name.toLowerCase();
    for (const part of ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'head']) {
      if (!bones[part] && name.includes(part)) bones[part] = o;
    }
  });
  // Lift the knees in front of the seat and bend them down toward the footrest.
  for (const side of ['l', 'r']) {
    if (bones[`thigh_${side}`]) bones[`thigh_${side}`].rotation.x += 1.05;
    if (bones[`calf_${side}`]) bones[`calf_${side}`].rotation.x -= 1.25;
    // Hands reach forward to the handlebars, with elbows slightly bent.
    if (bones[`upperarm_${side}`]) bones[`upperarm_${side}`].rotation.y += side === 'l' ? .95 : -.95;
    if (bones[`lowerarm_${side}`]) bones[`lowerarm_${side}`].rotation.y += side === 'l' ? -.25 : .25;
  }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  holder.add(model);
  // A small fitted dark cap, attached to the rigged head rather than floating above it.
  if (bones.head) {
    const anchor = new THREE.Group(); anchor.scale.setScalar(1 / scale); bones.head.add(anchor);
    const cloth = new THREE.MeshStandardMaterial({ color: '#26343E', roughness: .9 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.088, 18, 12, 0, Math.PI * 2, 0, Math.PI * .56), cloth);
    cap.position.y = .045; cap.scale.set(1.08, .72, 1.08); anchor.add(cap);
  }
  return holder;
}

// A realistic seated motorcycle rider: the skinned shopper rig posed on the seat (hips forward-flexed, knees bent onto the pegs,
// arms reaching the bars). `fit` places the pelvis on the seat and sets how far the arms reach / how far he leans.
// Returns null until the shopper GLB has loaded, so callers can fall back to the primitive rider.
export function makeBikeRider({ seat = [0, .8, -.2], thigh = 1.15, calf = 1.55, bars = [.9, .45], gap = .2, pegs = [.35, -.1], pegGap = .22, lean = .15, helmet = false, height = 1.74 } = {}) {
  const source = shopperTemplates.grocery;
  if (!source) return null;
  const model = SkeletonUtils.clone(source.scene), holder = new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(model), scale = height / Math.max(bounds.max.y - bounds.min.y, .01);
  model.scale.multiplyScalar(scale); model.position.y = -bounds.min.y * scale;
  const bones = {};
  model.traverse((o) => {
    if (!o.isBone) return;
    const name = o.name.toLowerCase();
    for (const part of ['foot_l', 'foot_r', 'hand_l', 'hand_r', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'head']) {
      if (!bones[part] && name === part) bones[part] = o;
    }
  });
  const rest = {};
  for (const side of ['l', 'r']) for (const part of [`thigh_${side}`, `calf_${side}`]) if (bones[part]) rest[part] = bones[part].rotation.x;
  const setLeg = (side, t, c) => { if (bones[`thigh_${side}`]) bones[`thigh_${side}`].rotation.x = rest[`thigh_${side}`] - t; if (bones[`calf_${side}`]) bones[`calf_${side}`].rotation.x = rest[`calf_${side}`] + c; };
  setLeg('l', thigh, calf); setLeg('r', thigh, calf);
  for (const part of ['spine_01', 'spine_02', 'spine_03']) if (bones[part]) bones[part].rotateX(lean / 3);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  holder.add(model);
  if (helmet && bones.head) {
    const anchor = new THREE.Group(); anchor.scale.setScalar(1 / scale); bones.head.add(anchor);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(.13, 20, 14, 0, Math.PI * 2, 0, Math.PI * .68), new THREE.MeshStandardMaterial({ color: '#1E262C', roughness: .3, metalness: .35 }));
    shell.position.set(0, .035, -.005); shell.scale.set(1.12, 1.08, 1.2); anchor.add(shell);
  }
  // Seat the pelvis exactly on the bike's seat point.
  holder.updateMatrixWorld(true);
  const pelvis = bones.pelvis || bones.spine_01, at = new THREE.Vector3(); pelvis.getWorldPosition(at); holder.worldToLocal(at);
  holder.position.set(seat[0] - at.x, seat[1] - at.y, seat[2] - at.z);
  // Put the feet on the pegs: per leg, pick the hip / knee angles that bring the foot closest to the footrest.
  const footTmp = new THREE.Vector3();
  for (const side of ['l', 'r']) {
    if (!bones[`foot_${side}`] || !bones[`thigh_${side}`] || !bones[`calf_${side}`]) continue;
    const peg = new THREE.Vector3(side === 'l' ? pegGap : -pegGap, pegs[0], pegs[1]); let bt = thigh, bc = calf, bd = Infinity;
    for (let t = .7; t <= 1.9; t += .1) for (let c = .4; c <= 3.4; c += .15) {
      setLeg(side, t, c); holder.updateMatrixWorld(true); bones[`foot_${side}`].getWorldPosition(footTmp);
      const d = footTmp.distanceTo(peg); if (d < bd) { bd = d; bt = t; bc = c; }
    }
    setLeg(side, bt, bc);
  }
  holder.updateMatrixWorld(true);
  // Reach for the grips: pick the shoulder angle that brings both hands closest to the handlebar ends.
  const target = { l: new THREE.Vector3(gap, bars[0], bars[1]), r: new THREE.Vector3(-gap, bars[0], bars[1]) };
  let best = 0, bestD = Infinity; const tmp = new THREE.Vector3();
  for (let a2 = 0; a2 <= 1.7; a2 += .05) {
    let d = 0;
    for (const side of ['l', 'r']) if (bones[`upperarm_${side}`]) bones[`upperarm_${side}`].rotateX(a2 - (bones._arm || 0));
    bones._arm = a2; holder.updateMatrixWorld(true);
    for (const side of ['l', 'r']) if (bones[`hand_${side}`]) { bones[`hand_${side}`].getWorldPosition(tmp); d += tmp.distanceTo(target[side]); }
    if (d < bestD) { bestD = d; best = a2; }
  }
  for (const side of ['l', 'r']) if (bones[`upperarm_${side}`]) bones[`upperarm_${side}`].rotateX(best - bones._arm);
  holder.updateMatrixWorld(true);
  return holder;
}

// A shop greeter stands in place and waves instead of playing the walk cycle.
export function makeGreeter(height = 1.78, wavePhase = 0) {
  const holder = makeWalker(height), model = holder.children[0];
  holder.userData.mixer.stopAllAction();
  let shoulder = null, elbow = null;
  model.traverse((o) => {
    const name = o.name.toLowerCase();
    if (name.includes('upperarm_r') && !name.includes('twist')) shoulder = o;
    if (name.includes('lowerarm_r') && !name.includes('twist')) elbow = o;
  });
  const shoulderBase = shoulder?.quaternion.clone(), elbowBase = elbow?.quaternion.clone();
  holder.userData.wave = (time) => {
    if (!shoulder || !elbow) return;
    // This model's arm bones point along its local X axis in the bind pose.
    // Rotate the right upper arm up, then swing the forearm as a clear wave.
    const lift = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.28, 'XYZ'));
    const wave = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -.52 + Math.sin(time * 5 + wavePhase) * .38, 'XYZ'));
    shoulder.quaternion.copy(shoulderBase).multiply(lift);
    elbow.quaternion.copy(elbowBase).multiply(wave);
  };
  holder.userData.wave(wavePhase);
  return holder;
}

/* ------------------------------------------------------------------ shoppers */
// Three wardrobe reads on the same rig keep the scene lightweight while avoiding
// the old single-person-in-different-tints look. Recolor only neutral fabric in
// the source atlas; skin, hair and denim retain their original texture.
const outfitTextures = new Map();
const outfits = {
  grocery: { shirt: '#B7A98D', bag: '#B88752' },
  hijabi: { shirt: '#477B5A', bag: '#B87D49' },
  hoodie: { shirt: '#263B5D', bag: '#AFA99B' },
};
function outfitTexture(style, source) {
  if (outfitTextures.has(style)) return outfitTextures.get(style);
  const image = source?.image;
  if (!image || typeof document === 'undefined') return source;
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
  const target = new THREE.Color(outfits[style].shirt), tr = target.r * 255, tg = target.g * 255, tb = target.b * 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (r > 155 && g > 155 && b > 155 && hi - lo < 38) {
      const shade = Math.max(.52, Math.min(1, (r + g + b) / 765));
      data[i] = tr * shade; data[i + 1] = tg * shade; data[i + 2] = tb * shade;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = source.flipY; texture.wrapS = source.wrapS; texture.wrapT = source.wrapT;
  texture.anisotropy = source.anisotropy || 1; texture.needsUpdate = true;
  outfitTextures.set(style, texture); return texture;
}
const bagGeo = { body: new THREE.BoxGeometry(.26, .32, .11), stripe: new THREE.BoxGeometry(.262, .05, .112), handle: new THREE.TorusGeometry(.055, .007, 6, 14, Math.PI) };
const bagMats = new Map();
const bagMat = (key, color) => { if (!bagMats.has(key)) bagMats.set(key, new THREE.MeshStandardMaterial({ color, roughness: .8 })); return bagMats.get(key); };
function makeBag(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bagGeo.body, bagMat('b' + color, color)); g.add(body);
  const stripe = new THREE.Mesh(bagGeo.stripe, bagMat('w', '#F7F1E6')); stripe.position.y = .05; g.add(stripe);
  const handle = new THREE.Mesh(bagGeo.handle, bagMat('h', '#F7F1E6')); handle.position.y = .16; g.add(handle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}
function findBone(model, part) {
  let found = null; const key = part.toLowerCase().replace(/[^a-z0-9]/g, '');
  model.traverse((o) => { if (!found && o.isBone && o.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key)) found = o; });
  return found;
}
function attachBag(holder, model, part, color) {
  const hand = findBone(model, part); if (!hand) return null;
  holder.updateWorldMatrix(true, true);
  const ws = new THREE.Vector3(); hand.getWorldScale(ws);
  const hanger = new THREE.Object3D(); hanger.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z); hand.add(hanger);
  const bag = makeBag(color); bag.position.y = -.2; hanger.add(bag);
  const q = new THREE.Quaternion();
  return () => { hand.getWorldQuaternion(q); hanger.quaternion.copy(q).invert(); }; // keeps the bag hanging upright
}
function addHijab(model, k) {
  const head = findBone(model, 'head_'); if (!head) return;
  const anchor = new THREE.Group(); anchor.scale.setScalar(1 / k); head.add(anchor);
  const cloth = new THREE.MeshStandardMaterial({ color: '#C8A58E', roughness: .92 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.085, 20, 14, 0, Math.PI * 2, 0, Math.PI * .72), cloth);
  cap.position.y = .018; cap.scale.set(1.04, 1.1, 1.12); anchor.add(cap);
  const neck = findBone(model, 'neck_');
  if (neck) {
    const drapeAnchor = new THREE.Group(); drapeAnchor.scale.setScalar(1 / k); neck.add(drapeAnchor);
    const drape = new THREE.Mesh(new THREE.SphereGeometry(.12, 18, 12), cloth);
    drape.position.set(0, -.04, -.015); drape.scale.set(1.1, .66, .78); drapeAnchor.add(drape);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.11, .18, .035), cloth);
    tail.position.set(0, -.15, -.07); tail.rotation.x = -.18; drapeAnchor.add(tail);
  }
}
function addHood(model, k) {
  const neck = findBone(model, 'neck_'); if (!neck) return;
  const anchor = new THREE.Group(); anchor.scale.setScalar(1 / k); neck.add(anchor);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.105, 18, 12, 0, Math.PI * 2, .12, Math.PI * .78), new THREE.MeshStandardMaterial({ color: '#263B5D', roughness: .88 }));
  hood.position.set(0, -.025, -.055); hood.scale.set(1.06, 1.04, .8); anchor.add(hood);
}
export function makeShopper(height = 1.75, { bags = [], style = 'grocery' } = {}) {
  const source = shopperTemplates[style] || template;
  const holder = makeWalker(height, source), model = holder.children[0], mixer = holder.userData.mixer;
  const outfit = outfits[style] || outfits.grocery;
  if (style === 'hoodie' && source === template) model.traverse((o) => { if (o.isMesh && o.material) {
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    const changed = materials.map((source) => { const mat = source.clone(); if (source.map) mat.map = outfitTexture(style, source.map); mat.color.set('#FFFFFF'); return mat; });
    o.material = Array.isArray(o.material) ? changed : changed[0];
  } });
  const scale = model.scale.x;
  if (style === 'hijabi') addHijab(model, scale);
  if (style === 'hoodie') addHood(model, scale);
  const action = mixer.clipAction(source.animations[0]);
  const hang = [];
  if (bags[0]) { const f = attachBag(holder, model, '_hand_r_', bags[0]); if (f) hang.push(f); }
  if (bags[1]) { const f = attachBag(holder, model, '_hand_l_', bags[1]); if (f) hang.push(f); }
  if (hang.length) { holder.userData.hang = () => hang.forEach((f) => f()); holder.userData.hang(); }
  holder.userData.shopperStyle = style;
  return holder;
}
