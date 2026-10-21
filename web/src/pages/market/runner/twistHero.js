// Banha Runner — the rigged Twist courier (Mixamo skeleton, one GLB with all clips).
// loadTwistHero() resolves to a THREE.Group whose userData.twist.update(dt, state) drives the animation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const URL = '/runner/models/twist/twist.glb'; // skinned mesh + clips: run, jump, slide, fall, getup, idle
const HEIGHT = 1.85;               // game units; cars/pedestrians are scaled against this
export const TWIST_HIT_TIME = 1.5; // seconds the world stops after a crash: fall (45%) then get up (55%)
const SCRUBBED = new Set(['jump', 'slide', 'fall', 'getup']); // driven by game progress, not by wall clock
const LOOPED = new Set(['run', 'idle', 'runl', 'runr', 'walkl', 'walkr']);

/** Remove root motion (the game moves the world / the runner) but keep the hips' vertical motion. */
function cleanClip(clip, name, { lockXZ = true, yScale = 1 } = {}) {
  clip.name = name;
  if (!lockXZ && yScale === 1) return clip;
  for (const track of clip.tracks) {
    if (!/Hips\.position$/.test(track.name)) continue;
    const v = track.values, x0 = v[0], y0 = v[1], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      if (lockXZ) { v[i] = x0; v[i + 2] = z0; }
      if (yScale !== 1) v[i + 1] = y0 + (v[i + 1] - y0) * yScale;
    }
  }
  return clip;
}


/** Run-cycle polish: longer stride and a stronger arm pump, a steadier torso (so the courier box stays glued to the back), slight forward lean. */
function enhanceRun(clip, { leg = 1.25, knee = 1.2, arm = 1.6, fore = 1.3, spine = .45, lean = 0 } = {}) {
  const amp = { UpLeg: leg, Leg: knee, Arm: arm, ForeArm: fore, Spine: spine, Spine1: spine, Spine2: spine };
  const q = new THREE.Quaternion(), ref = new THREE.Quaternion(), mean = new THREE.Quaternion(), out = new THREE.Quaternion();
  for (const track of clip.tracks) {
    const m = /^mixamorig(?:(?:Left|Right)(UpLeg|ForeArm|Leg|Arm)|(Spine[12]?))\.quaternion$/.exec(track.name); if (!m) continue;
    const k = amp[m[1] || m[2]], v = track.values, n = v.length / 4;
    ref.set(v[0], v[1], v[2], v[3]); mean.set(0, 0, 0, 0);
    for (let i = 0; i < n; i++) { q.set(v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]); if (q.dot(ref) < 0) q.set(-q.x, -q.y, -q.z, -q.w); mean.set(mean.x + q.x, mean.y + q.y, mean.z + q.z, mean.w + q.w); }
    mean.normalize();
    for (let i = 0; i < n; i++) { q.set(v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]); out.copy(mean).slerp(q, k); v[i * 4] = out.x; v[i * 4 + 1] = out.y; v[i * 4 + 2] = out.z; v[i * 4 + 3] = out.w; }
    if (lean && m[2]) { const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean / 3); for (let i = 0; i < n; i++) { q.set(v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]).multiply(r); v[i * 4] = q.x; v[i * 4 + 1] = q.y; v[i * 4 + 2] = q.z; v[i * 4 + 3] = q.w; } }
  }
  return clip;
}

const LOGO_URL = '/brand/twist-logo.png';
const TAGLINE = 'كل المحلات في مكان واحد';
/** Crisp brand patch for the bag: the real Twist logo (screen-printed on the fabric) + the Arabic tagline. */
async function makeLogoPatch() {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = LOGO_URL; });
  try { await document.fonts.load('600 60px "IBM Plex Sans Arabic"'); } catch { /* falls back to system Arabic font */ }
  // Screen-printed look: no sticker plate. Navy letters of the logo are inverted to cream so they read on the navy bag.
  const W = 1440, H = 640, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const lw = 1150, lh = lw * img.height / img.width;
  const tmp = document.createElement('canvas'); tmp.width = lw; tmp.height = Math.round(lh);
  const tx = tmp.getContext('2d', { willReadFrequently: true }); tx.drawImage(img, 0, 0, lw, lh);
  const d = tx.getImageData(0, 0, tmp.width, tmp.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (b > r && r + g + b < 330) { px[i] = 246; px[i + 1] = 240; px[i + 2] = 228; } // navy -> cream
  }
  tx.putImageData(d, 0, 0);
  x.drawImage(tmp, (W - lw) / 2, 40, lw, lh);
  x.fillStyle = '#F6F0E4'; x.font = '600 100px "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
  x.fillText(TAGLINE, W / 2, 40 + lh + 100);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .9, metalness: 0, transparent: true, alphaTest: .35, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(27, 27 * H / W), mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Insulated Twist delivery box (the generated backpack mesh is cut away in the GLB). Origin = box centre, units cm. */
async function makeDeliveryBox() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#0E4A8C', roughness: .62, metalness: 0 });
  const navy = new THREE.MeshStandardMaterial({ color: '#0A2F57', roughness: .7, metalness: 0 });
  const orange = new THREE.MeshStandardMaterial({ color: '#F47C1E', roughness: .6, metalness: 0 });
  const silver = new THREE.MeshStandardMaterial({ color: '#D5DCE2', roughness: .3, metalness: .5 });
  const black = new THREE.MeshStandardMaterial({ color: '#12161B', roughness: .8 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.frustumCulled = false; g.add(m); return m; };
  add(new RoundedBoxGeometry(38, 34, 24, 5, 2.4), blue, 0, 0, 0);               // main body
  add(new RoundedBoxGeometry(38.8, 7, 24.8, 5, 2.4), navy, 0, 13.5, 0);         // lid
  add(new RoundedBoxGeometry(38.6, 2.4, 24.6, 3, 1), orange, 0, 8.6, 0);        // orange piping under the lid
  add(new RoundedBoxGeometry(38.5, 2.2, 24.5, 3, 1), silver, 0, -10, 0);        // reflective strip
  for (const sx of [-1, 1]) add(new RoundedBoxGeometry(3, 26, 22, 3, 1), navy, sx * 19.6, -2, 0); // side pockets
  const handle = add(new THREE.TorusGeometry(4.5, .7, 8, 18, Math.PI), black, 0, 17, 0); handle.rotation.set(0, 0, 0);
  // The generated mesh has no jacket back under its backpack, so the cut-away leaves a hole: close it with a jacket-coloured back plate.
  const jacket = new THREE.MeshStandardMaterial({ color: '#1B2750', roughness: .85, metalness: 0 });
  const plate = add(new RoundedBoxGeometry(50, 58, 16, 3, 2), jacket, 0, 3, 18.3); // sits between the jacket back and the box (box-local)
  plate.userData.plate = true;
  const patch = await makeLogoPatch();
  patch.position.set(0, 0, -12.3); patch.rotation.set(0, Math.PI, 0); g.add(patch);
  return g;
}

let cached = null;
const loadGlb = () => cached || (cached = new GLTFLoader().loadAsync(URL));

export async function loadTwistHero() {
  const gltf = await loadGlb();
  const model = cloneSkinned(gltf.scene);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    if (o.material.map) o.material.map.anisotropy = 8;
  });
  const byName = (n) => gltf.animations.find((c) => c.name === n).clone(); // clone: cleaning must not stack on remount

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const scale = HEIGHT / Math.max(.01, box.max.y - box.min.y);
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI;                 // the game runs toward -Z
  holder.scale.setScalar(scale);
  holder.position.y = -box.min.y * scale;      // feet on the ground
  holder.add(model);
  const root = new THREE.Group(); root.add(holder);

  // Delivery box on the upper back (model units are cm), bound to the spine so it follows every animation.
  try {
    const box = await makeDeliveryBox();
    let skinned = null; model.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
    const bone = skinned && skinned.skeleton.getBoneByName('mixamorigSpine2');
    if (bone) {
      const keep = skinned.skeleton.bones.map((b) => b.matrix.clone());
      skinned.skeleton.pose(); model.updateMatrixWorld(true);       // bind pose, so offsets match the mesh
      box.position.set(0, 110, -24.5); box.scale.setScalar(.9);
      model.add(box); box.updateMatrixWorld(true); bone.attach(box);
      skinned.skeleton.bones.forEach((b, i) => { b.matrix.copy(keep[i]); b.matrix.decompose(b.position, b.quaternion, b.scale); });
      model.updateMatrixWorld(true);
    }
  } catch (err) { console.warn('Twist delivery box skipped', err); }

  const mixer = new THREE.AnimationMixer(model);
  let headBone = null, neckBone = null; model.traverse((o) => { if (o.isBone && o.name === 'mixamorigHead') headBone = o; if (o.isBone && o.name === 'mixamorigNeck') neckBone = o; });
  const lookCur = { x: 0, y: 0 };
  const clips = {
    run: enhanceRun(cleanClip(byName('run'), 'run', { lockXZ: false }), { lean: .1 }),
    jump: cleanClip(byName('jump'), 'jump', { yScale: .35 }), // the game already lifts the runner
    slide: cleanClip(byName('slide'), 'slide'),
    fall: cleanClip(byName('fall'), 'fall'),
    getup: cleanClip(byName('getup'), 'getup'),
    idle: cleanClip(byName('idle'), 'idle', { lockXZ: false }),
    // sideways movement (lane change / strafing while exploring): the game moves the body, so strip root motion
    runl: cleanClip(byName('runl'), 'runl'), runr: cleanClip(byName('runr'), 'runr'),
    walkl: cleanClip(byName('walkl'), 'walkl'), walkr: cleanClip(byName('walkr'), 'walkr'),
  };
  const actions = {};
  for (const [name, clip] of Object.entries(clips)) {
    const a = mixer.clipAction(clip);
    a.setLoop(LOOPED.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    actions[name] = a;
  }

  let cur = null;
  const setMode = (mode, fade) => {
    const next = actions[mode], prev = cur ? actions[cur] : null;
    next.reset(); next.enabled = true; next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(SCRUBBED.has(mode) && mode !== 'fall' ? 0 : 1);
    if (prev) next.crossFadeFrom(prev, fade, false);
    next.play(); cur = mode;
  };
  const scrub = (mode, p) => { const a = actions[mode]; a.time = Math.min(Math.max(p, 0), 1) * Math.max(.001, clips[mode].duration - .002); };

  setMode('idle', 0);
  mixer.update(0);

  /** state: { paused, down, hitT, jumpT, slideT, idle, walk, side(-1 left / 1 right / 0), speed } — *T values are 0..1 progress. */
  const update = (dt, s = {}) => {
    if (s.paused) return;
    let mode = 'run';
    if (s.down) mode = 'down';
    else if (s.hitT != null) mode = s.hitT < .45 ? 'fall' : 'getup';
    else if (s.jumpT != null) mode = 'jump';
    else if (s.slideT != null) mode = 'slide';
    else if (s.side) mode = (s.walk || s.idle ? 'walk' : 'run') + (s.side < 0 ? 'l' : 'r');
    else if (s.idle) mode = 'idle';
    const key = mode === 'down' ? 'fall' : mode;
    if (key !== cur) setMode(key, key === 'fall' ? .06 : key === 'getup' ? .1 : .14);
    if (mode === 'fall') scrub('fall', s.hitT / .45);
    else if (mode === 'getup') scrub('getup', (s.hitT - .45) / .55);
    else if (mode === 'jump') scrub('jump', s.jumpT);
    else if (mode === 'slide') scrub('slide', s.slideT);
    const fast = 1.1 + Math.max(0, (s.speed || 8.5) - 8.5) * .05;
    if (mode === 'run') actions.run.setEffectiveTimeScale(s.walk ? .6 : fast);
    else if (mode === 'runl' || mode === 'runr') actions[mode].setEffectiveTimeScale(fast);
    else if (mode === 'walkl' || mode === 'walkr') actions[mode].setEffectiveTimeScale(1);
    if (mode === 'down' && actions.fall.timeScale === 0) actions.fall.setEffectiveTimeScale(1);
    mixer.update(dt);
    // Mouse look (start screen only): the head follows the pointer on top of the idle pose.
    const k = 1 - Math.exp(-8 * dt), tx = s.look ? s.look.x : 0, ty = s.look ? s.look.y : 0;
    lookCur.x += (tx - lookCur.x) * k; lookCur.y += (ty - lookCur.y) * k;
    if (headBone && (Math.abs(lookCur.x) > .002 || Math.abs(lookCur.y) > .002)) {
      if (neckBone) neckBone.rotateY(-lookCur.x * .25);
      headBone.rotateY(-lookCur.x * .45); headBone.rotateX(-lookCur.y * .3);
    }
  };

  root.userData.twist = { update, hitTime: TWIST_HIT_TIME, mixer, actions, clips };
  return root;
}
