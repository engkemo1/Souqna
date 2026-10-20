// Banha Runner — the Twist delivery runner: orange hoodie, insulated delivery bag, cap, jeans, sneakers.
// Two-segment legs/arms (knees + elbows) with a proper run cycle, forward lean and bob.
import * as THREE from 'three';
import { stdMat, textTexture } from './vehicles.js';

const ORANGE = '#F26A1B', ORANGE_D = '#C9500F', BAG = '#F58220';

export function makeHero() {
  const root = new THREE.Group();
  const skin = stdMat('#C98B63', .7), hoodie = stdMat(ORANGE, .88), hoodieD = stdMat(ORANGE_D, .9), jeans = stdMat('#1F2A3D', .9), jeansL = stdMat('#2B3A55', .9);
  const black = stdMat('#14171B', .85), white = stdMat('#EDEDEA', .7), grey = stdMat('#8D9298', .6);
  const mesh = (geo, material, x, y, z, parent) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // Torso group pivots at the hips so the whole upper body can lean and bob.
  const torso = new THREE.Group(); torso.position.y = 1.0; root.add(torso);
  const chest = mesh(new THREE.CapsuleGeometry(.3, .46, 6, 14), hoodie, 0, .5, 0, torso); chest.scale.set(1.12, 1, .82);
  mesh(new THREE.CylinderGeometry(.34, .36, .12, 16), hoodieD, 0, .1, 0, torso).scale.set(1.1, 1, .82); // hoodie hem band
  const pocket = mesh(new THREE.BoxGeometry(.5, .2, .05), hoodieD, 0, .32, -.25, torso); pocket.rotation.x = .1;
  // hood bunched behind the neck + drawstrings
  const hood = mesh(new THREE.SphereGeometry(.2, 14, 10), hoodie, 0, .86, .12, torso); hood.scale.set(1.3, .8, 1);
  mesh(new THREE.CylinderGeometry(.015, .015, .26, 6), white, -.07, .66, -.23, torso); mesh(new THREE.CylinderGeometry(.015, .015, .26, 6), white, .07, .66, -.23, torso);
  // neck, head, cap
  mesh(new THREE.CylinderGeometry(.075, .085, .14, 10), skin, 0, .92, 0, torso);
  const head = new THREE.Group(); head.position.set(0, 1.12, 0); torso.add(head);
  mesh(new THREE.SphereGeometry(.2, 20, 16), skin, 0, 0, 0, head).scale.set(.95, 1.05, 1);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(.045, 8, 6), skin, s * .19, -.01, .01, head).scale.set(.5, 1, .8);
  const cap = mesh(new THREE.SphereGeometry(.215, 20, 12, 0, Math.PI * 2, 0, Math.PI * .52), black, 0, .035, .005, head); cap.scale.set(1, 1.02, 1.05);
  const brim = mesh(new THREE.CylinderGeometry(.2, .2, .03, 18, 1, false, -Math.PI * .5 - .9, 1.8), black, 0, .02, -.1, head); brim.scale.set(1, 1, 1.25);
  mesh(new THREE.BoxGeometry(.2, .035, .02), grey, 0, -.02, .205, head); // cap strap
  mesh(new THREE.BoxGeometry(.05, .03, .02), black, 0, -.02, .215, head);

  // Delivery bag (the "Twist" insulated box) with reflective strip, side pockets, straps and handle.
  const bag = new THREE.Group(); bag.position.set(0, .52, .46); torso.add(bag);
  mesh(new THREE.BoxGeometry(.78, .86, .46), stdMat(BAG, .75), 0, 0, 0, bag);
  mesh(new THREE.BoxGeometry(.8, .16, .48), stdMat('#E06A10', .7), 0, .4, 0, bag);
  const strip = mesh(new THREE.BoxGeometry(.8, .07, .475), stdMat('#D8DEE3', .3, .6), 0, .08, 0, bag);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(.46, .18), new THREE.MeshBasicMaterial({ map: textTexture('TWIST', { bg: '#073253', color: '#FFD9B0', width: 256, height: 100, size: 62 }) })); label.position.set(0, -.2, .236); bag.add(label);
  for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(.1, .5, .46), stdMat('#D9700F', .8), s * .43, -.12, 0, bag); mesh(new THREE.BoxGeometry(.07, .8, .1), black, s * .22, .02, -.22, bag); }
  const handle = mesh(new THREE.TorusGeometry(.12, .02, 8, 16, Math.PI), black, 0, .53, 0, bag); handle.rotation.set(0, 0, 0);

  // Arms: shoulder -> elbow (bent) -> forearm + cuff + hand
  const arms = [], elbows = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(s * .39, .74, -.02); torso.add(shoulder); arms.push(shoulder);
    mesh(new THREE.SphereGeometry(.125, 12, 10), hoodie, 0, 0, 0, shoulder);
    mesh(new THREE.CylinderGeometry(.1, .115, .44, 12), hoodie, 0, -.22, 0, shoulder);
    const elbow = new THREE.Group(); elbow.position.y = -.44; shoulder.add(elbow); elbows.push(elbow);
    mesh(new THREE.SphereGeometry(.1, 10, 8), hoodie, 0, 0, 0, elbow);
    mesh(new THREE.CylinderGeometry(.085, .1, .36, 12), hoodie, 0, -.18, 0, elbow);
    mesh(new THREE.CylinderGeometry(.092, .092, .06, 12), hoodieD, 0, -.38, 0, elbow);
    mesh(new THREE.SphereGeometry(.082, 10, 8), skin, 0, -.45, 0, elbow);
  }
  // Legs: hip -> thigh -> knee -> shin -> sneaker
  const legs = [], knees = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * .16, 1.0, 0); root.add(hip); legs.push(hip);
    mesh(new THREE.SphereGeometry(.15, 12, 10), jeans, 0, 0, 0, hip);
    mesh(new THREE.CylinderGeometry(.145, .115, .52, 12), jeans, 0, -.26, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -.52; hip.add(knee); knees.push(knee);
    mesh(new THREE.SphereGeometry(.113, 10, 8), jeans, 0, 0, 0, knee);
    mesh(new THREE.CylinderGeometry(.11, .085, .46, 12), jeansL, 0, -.23, 0, knee);
    mesh(new THREE.CylinderGeometry(.09, .09, .05, 12), jeans, 0, -.46, 0, knee);
    const shoe = new THREE.Group(); shoe.position.set(0, -.5, .06); knee.add(shoe);
    mesh(new THREE.BoxGeometry(.2, .12, .4), white, 0, 0, 0, shoe); mesh(new THREE.BoxGeometry(.21, .05, .42), grey, 0, -.07, 0, shoe);
    mesh(new THREE.BoxGeometry(.12, .06, .12), stdMat('#D9D9D2', .7), 0, .08, -.1, shoe);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.62, 24), new THREE.MeshBasicMaterial({ color: 0x07121b, transparent: true, opacity: .2 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .025; root.add(shadow);

  root.userData.limbs = { armPivots: arms, legPivots: legs };
  /** phase = running phase, stride 0..1, jumping/sliding flags. */
  root.userData.animate = (phase, stride = .8, jumping = false, sliding = false) => {
    const s = Math.sin(phase), c = Math.cos(phase);
    if (jumping) { // tuck jump: knees up, arms thrown forward
      legs[0].rotation.x = .95; legs[1].rotation.x = .55; knees[0].rotation.x = -1.35; knees[1].rotation.x = -.9;
      arms[0].rotation.x = -.9; arms[1].rotation.x = -1.2; elbows[0].rotation.x = 1.0; elbows[1].rotation.x = .8; torso.rotation.x = -.2; torso.position.y = 1.0; return;
    }
    const amp = stride * 1.05;
    legs[0].rotation.x = s * amp; legs[1].rotation.x = -s * amp;
    knees[0].rotation.x = -(.18 + Math.max(0, -c) * 1.15 * stride); knees[1].rotation.x = -(.18 + Math.max(0, c) * 1.15 * stride);
    arms[0].rotation.x = -s * amp * .9; arms[1].rotation.x = s * amp * .9;
    elbows[0].rotation.x = 1.15 + Math.max(0, s) * .25 * stride; elbows[1].rotation.x = 1.15 + Math.max(0, -s) * .25 * stride;
    torso.rotation.x = sliding ? -.55 : -.17 * Math.min(1, stride + .3); torso.rotation.z = c * .035 * stride;
    torso.position.y = 1.0 + Math.abs(s) * .07 * stride;
  };
  return root;
}
