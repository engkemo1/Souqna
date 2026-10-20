// Real animated pedestrian (GLB with baked walk cycle). Falls back to the built-in figure if the file is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

let template = null;
export const hasWalker = () => !!template;
export async function loadWalker(url = '/runner/models/walker.glb') {
  try { template = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url); return true; } catch { return false; }
}
export function makeWalker(height = 1.85) {
  const model = SkeletonUtils.clone(template.scene), holder = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model), k = height / Math.max(box.max.y - box.min.y, .01);
  model.scale.multiplyScalar(k); model.position.y = -box.min.y * k;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  holder.add(model);
  const mixer = new THREE.AnimationMixer(model);
  if (template.animations[0]) { const a = mixer.clipAction(template.animations[0]); a.time = Math.random() * template.animations[0].duration; a.play(); }
  holder.userData.mixer = mixer;
  return holder;
}
