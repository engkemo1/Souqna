import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Car, ChevronDown, ChevronLeft, ChevronsDown, ChevronsUp, ChevronRight, ChevronUp, Maximize2, Minimize2, Moon, Pause, Play, RotateCcw, ShoppingBag, Sun, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createVillasWorld, patchBend } from './runner/villasWorld.js';
import { makeSedan, makeMicrobus, makeMotorcycle, makeTuktuk, loadRealVehicles, loadRealVehicleVariants, makeRealVehicleVariant, realVehicle } from './runner/vehicles.js';
import { makeHero } from './runner/hero.js';
import { loadTwistHero } from './runner/twistHero.js';
import { loadWalker, makeWalker } from './runner/walkers.js';
import { createTrafficAudio } from './runner/trafficAudio.js';
import { createPost } from './runner/postfx.js';
import { useApi } from '../../lib/hooks.js';

const AREAS = [
  { id: 'station', name: 'شارع المحطة', clue: 'من ميدان المحطة لوسط البلد', sign: 'محطة بنها', density: 1.2 },
  { id: 'farid-nada', name: 'شارع فريد ندا', clue: 'شارع فريد ندا', sign: 'فريد ندا', density: 1 },
  { id: 'stadium', name: 'شارع الاستاد', clue: 'منطقة الاستاد', sign: 'استاد بنها', density: 1.1 },
  { id: 'villas', name: 'شوارع بنها', clue: 'طريق بنها', sign: 'بنها', density: .9 },
  { id: 'ahram', name: 'منطقة الأهرام', clue: 'شوارع الأهرام', sign: 'الأهرام', density: 1 },
];
const LEVELS = [
  { id: 'easy', label: 'سهل', goal: 8, speed: 8.5, bagIntervalScale: 1 },
  { id: 'normal', label: 'متوسط', goal: 14, speed: 10.5, bagIntervalScale: 1 },
  // The hard route is shorter in time at its higher speed; shorten bag gaps
  // so the 20-bag objective remains achievable before the finish line.
  { id: 'hard', label: 'صعب', goal: 20, speed: 13, bagIntervalScale: .75 },
];
const ROUTE_STOPS = [
  { distance: 0, name: 'شارع المحطة', detail: 'واجهة المتاجر المشاركة' },
  { distance: 72, name: 'شارع سعد زغلول', detail: 'وسط مدينة بنها' },
  { distance: 100, name: 'تمثال سعد زغلول', detail: 'في الجزيرة الوسطى بالميدان' },
  { distance: 118, name: 'نفق سعد زغلول • المنشية', detail: 'أسفل خط السكة الحديد بجوار الميدان' },
  { distance: 160, name: 'شارع فريد ندا', detail: 'اتجاه منطقة الاستاد' },
  { distance: 208, name: 'استاد بنها', detail: 'منطقة الاستاد' },
  { distance: 285, name: 'كوبري كفر الجزار', detail: 'الطريق إلى كفر الجزار' },
];
const ROUTES = ['بنها - القاهرة', 'بنها - طوخ', 'بنها - شبرا', 'بنها البلد'];
const TUKTUK_LINES = ['اركب يا باشا، بنها البلد!', 'وسع يا معلم، التوك توك جاي!', 'بنها - طوخ يا كبير؟', 'على مهلك يا أسطى!'];
// Seed DB merchants for the bundled preview; live marketplace data replaces this list when available.
const ACTIVE_BANHA_STORE_FALLBACK = ['أحمد فاشون', 'لمار بوتيك', 'سبورت زون', 'دنيم هاوس', 'تاون ستايل'];
const LANES = [-2.15, 0, 2.15];
const TRAFFIC_TYPES = ['car', 'microbus', 'tuktuk', 'bike'];
const CHALLENGE_VEHICLE_TYPES = [...TRAFFIC_TYPES, 'tataTruck', 'corsaTruck'];
// Asphalt is placed at y=-0.04; align traffic tire contact with its surface.
const ROAD_SURFACE_Y = -.04;
const mat = (color, roughness = .78) => new THREE.MeshStandardMaterial({ color, roughness });

function getOccupiedChallengeLanes(obstacles) {
  const occupied = new Set();
  for (const item of obstacles) {
    if (item.initial || item.group.position.z <= -64 || item.group.position.z >= 38) continue;
    // A bag is only a short-lived lane reservation at the spawn line. Once it
    // has moved into the approach, later traffic can safely enter behind it.
    if (item.type === 'bag') {
      if (item.group.position.z <= -40) occupied.add(item.lane);
      continue;
    }
    if (!CHALLENGE_VEHICLE_TYPES.includes(item.type) && item.type !== 'roadCrate') continue;
    if (item.type === 'corsaTruck') {
      const bounds = item.group.userData.trafficBounds;
      const halfWidth = (bounds?.halfDepth || 2.075) * item.group.scale.z;
      LANES.forEach((x, lane) => { if (Math.abs(item.group.position.x - x) < halfWidth + .32) occupied.add(lane); });
    } else if (item.type === 'tataTruck' && item.targetLane != null && item.group.position.z > -38 && item.group.position.z < -14) {
      occupied.add(item.sourceLane); occupied.add(item.targetLane);
    } else occupied.add(item.lane);
  }
  return occupied;
}

function labelTexture(text, options = {}) {
  const canvas = document.createElement('canvas'); canvas.width = options.width || 512; canvas.height = options.height || 128;
  const ctx = canvas.getContext('2d');
  if (options.bg) { ctx.fillStyle = options.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = options.color || '#fff'; ctx.font = '900 ' + (options.fontSize || 58) + 'px system-ui, sans-serif';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 18);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function fabricTexture(base, seed = 31) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  let n = seed | 0; const rand = () => { n = (n * 1664525 + 1013904223) | 0; return (n >>> 0) / 4294967296; };
  for (let i = 0; i < 3600; i++) {
    const shade = rand() > .5 ? 255 : 35, alpha = .025 + rand() * .075;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    const x = rand() * 256, y = rand() * 256; ctx.fillRect(x, y, 1 + rand(), 1 + rand());
  }
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  for (let i = -256; i < 512; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1.2, 1.5); texture.anisotropy = 4;
  return texture;
}

function surfaceTexture(base, seed, pavement = false) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
  let n = seed | 0;
  const random = () => { n = (n * 1664525 + 1013904223) | 0; return (n >>> 0) / 4294967296; };
  if (pavement) {
    ctx.strokeStyle = 'rgba(66,53,41,.22)'; ctx.lineWidth = 3;
    for (let y = 0; y <= 512; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const x = col * 128 + (row % 2) * 64; ctx.beginPath(); ctx.moveTo(x, row * 64); ctx.lineTo(x, (row + 1) * 64); ctx.stroke();
    }
  }
  for (let i = 0; i < 8500; i++) {
    const shade = Math.floor(random() * 70), alpha = .05 + random() * .19;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    const size = pavement ? 1 + random() * 3 : 1 + random() * 2;
    ctx.fillRect(random() * 512, random() * 512, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(pavement ? 2 : 1, pavement ? 20 : 24); texture.anisotropy = 8;
  return texture;
}

function addBox(parent, size, position, material, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function createShopTexture(seed, title) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
  const c = canvas.getContext('2d');
  const walls = ['#D9B18A', '#E6C99F', '#CFA08A', '#D8C0A0', '#C69B83', '#E3B984'];
  c.fillStyle = walls[seed % walls.length]; c.fillRect(0, 0, 512, 768);
  c.fillStyle = 'rgba(70,47,37,.32)'; c.fillRect(0, 0, 512, 768);
  for (let floor = 0; floor < 4; floor++) for (let col = 0; col < 3; col++) {
    const x = 28 + col * 158, y = 26 + floor * 132;
    c.fillStyle = '#725340'; c.fillRect(x - 6, y - 6, 116, 94);
    c.fillStyle = ['#315567', '#678085', '#3F6472'][((floor + col + seed) % 3)]; c.fillRect(x, y, 104, 82);
    c.fillStyle = 'rgba(220,239,225,.32)'; c.fillRect(x + 7, y + 6, 38, 65);
    c.fillStyle = '#D4B991'; c.fillRect(x - 8, y + 82, 120, 8);
    if ((floor + col + seed) % 2 === 0) { c.fillStyle = '#7D6956'; c.fillRect(x - 13, y + 94, 130, 5); c.fillRect(x - 11, y + 94, 4, 27); c.fillRect(x + 104, y + 94, 4, 27); }
  }
  c.fillStyle = '#A85A35'; c.fillRect(0, 594, 512, 174);
  c.fillStyle = ['#087A59', '#173E61', '#AA4E32', '#7D4C76'][seed % 4]; c.fillRect(0, 565, 512, 48);
  c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFF2D9'; c.font = '900 40px system-ui'; c.fillText(title, 256, 589);
  c.fillStyle = '#3E3026'; c.fillRect(36, 630, 136, 138); c.fillRect(199, 630, 136, 138); c.fillRect(364, 630, 112, 138);
  c.fillStyle = '#AEC9C6'; c.fillRect(44, 638, 119, 57); c.fillRect(207, 638, 119, 57); c.fillRect(372, 638, 96, 57);
  c.fillStyle = '#DAA46A'; c.fillRect(0, 760, 512, 8);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function makePerson(shirt = '#3D7684', scale = 1) {
  const root = new THREE.Group(); root.scale.setScalar(scale);
  const skin = mat('#C78D69'), pants = mat('#293D51'), shirtMat = mat(shirt), shoe = mat('#17212B');
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.42, .62, .25), shirtMat); torso.position.y = 1.13; torso.castShadow = true; root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), skin); head.position.y = 1.61; head.castShadow = true; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.175, 12, 8, 0, Math.PI * 2, 0, Math.PI * .55), mat('#2B2928')); hair.position.y = 1.67; root.add(hair);
  const armPivots = [], legPivots = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .27, 1.37, 0); root.add(arm); armPivots.push(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(.065, .085, .43, 8), shirtMat); upper.position.y = -.22; arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 8), skin); hand.position.y = -.45; arm.add(hand);
    const leg = new THREE.Group(); leg.position.set(side * .12, .83, 0); root.add(leg); legPivots.push(leg);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(.075, .10, .63, 8), pants); lower.position.y = -.31; leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.18, .12, .34), shoe); foot.position.set(0, -.64, .08); leg.add(foot);
  }
  root.userData.limbs = { armPivots, legPivots };
  return root;
}

function makeRunner() {
  const root = new THREE.Group();
  const orange = mat('#EF681C'), dark = mat('#092D4B'), skin = mat('#C78A67'), trim = mat('#FFC66C');
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.30, .48, 5, 10), orange); torso.position.y = 1.33; torso.castShadow = true; root.add(torso);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.51, .65, .28), mat('#FF8B32')); pack.position.set(0, 1.38, .30); pack.castShadow = true; root.add(pack);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(.31, .12), new THREE.MeshBasicMaterial({ map: labelTexture('TWIST', { bg: '#073253', fontSize: 52 }), transparent: false }));
  tag.position.set(0, 1.43, .45); root.add(tag);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 18, 14), skin); head.position.y = 2.03; head.castShadow = true; root.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.235, 16, 8, 0, Math.PI * 2, 0, Math.PI * .48), dark); cap.position.y = 2.16; root.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(.47, .055, .26), dark); brim.position.set(0, 2.12, -.12); root.add(brim);
  const armPivots = [], legPivots = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .31, 1.58, 0); root.add(arm); armPivots.push(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .58, 10), orange); upper.position.y = -.29; arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.10, 10, 8), skin); hand.position.y = -.6; arm.add(hand);
    const leg = new THREE.Group(); leg.position.set(side * .15, .99, 0); root.add(leg); legPivots.push(leg);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(.11, .14, .74, 10), dark); lower.position.y = -.36; leg.add(lower);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.26, .16, .38), mat('#17232D')); shoe.position.set(0, -.74, -.02); leg.add(shoe);
  }
  root.userData.limbs = { armPivots, legPivots };
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.68, 24), new THREE.MeshBasicMaterial({ color: 0x07121b, transparent: true, opacity: .24 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .025; root.add(shadow);
  return root;
}

function createVehicle(type, route = ROUTES[0]) {
  // Built-in and supplied vehicle models have their grille toward +Z, the direction traffic travels here.
  const factory = { car: () => makeSedan(), microbus: () => makeMicrobus(route), bike: () => makeMotorcycle(), tuktuk: () => makeTuktuk() }[type];
  if (factory) {
    const vehicle = factory();
    addTrafficLights(vehicle, type);
    return vehicle;
  }
  const g = new THREE.Group(), wheelMat = mat('#18222A'), glass = mat('#9CC7CF'), lamp = new THREE.MeshStandardMaterial({ color: '#FFE7A8', emissive: '#503510', emissiveIntensity: .35 });
  if (type === 'bike') {
    const frame = addBox(g, [.18, .22, .78], [0, .68, 0], mat('#C84D34'));
    for (const z of [-.43, .43]) { const wheel = new THREE.Mesh(new THREE.TorusGeometry(.28, .055, 8, 16), wheelMat); wheel.rotation.y = Math.PI / 2; wheel.position.set(0, .34, z); g.add(wheel); }
    const rider = makePerson('#253F5B', .62); rider.position.y = .7; g.add(rider); return g;
  }
  const isBus = type === 'microbus', isTuk = type === 'tuktuk';
  const width = isBus ? 1.75 : isTuk ? 1.48 : 1.78, length = isBus ? 3.0 : isTuk ? 1.9 : 2.6;
  const bodyColor = isBus ? '#E8E0D0' : isTuk ? '#E5B832' : ['#D95743', '#287E9D', '#E6E1D5', '#6F5E93'][Math.floor(Math.random() * 4)];
  addBox(g, [width, isBus ? 1.45 : .78, length], [0, isBus ? 1.15 : .75, 0], mat(bodyColor));
  if (isTuk) {
    addBox(g, [width * .88, .72, length * .48], [0, 1.78, -.23], mat('#187458'));
    addBox(g, [width * .78, .43, .06], [0, 1.80, .025], new THREE.MeshStandardMaterial({ map: labelTexture('بنها', { bg: '#18684F', fontSize: 64 }), roughness: .8 }));
    addBox(g, [width * .82, .27, .045], [0, .70, length / 2 + .025], new THREE.MeshStandardMaterial({ map: labelTexture('ما شاء الله', { bg: '#E3B832', color: '#54382A', fontSize: 40 }) }));
    addBox(g, [.04, .04, .04], [-width * .37, 1.18, length / 2 + .03], mat('#C64734'));
    addBox(g, [.04, .04, .04], [width * .37, 1.18, length / 2 + .03], mat('#C64734'));
  } else {
    const windshield = addBox(g, [width * .78, isBus ? .46 : .43, .05], [0, isBus ? 1.49 : 1.03, length / 2 + .026], mat('#6F98A4'));
    if (isBus) {
      addBox(g, [width * .85, .40, .055], [0, 2.12, length / 2 + .04], new THREE.MeshStandardMaterial({ map: labelTexture(route, { bg: '#183E51', fontSize: 44 }), roughness: .55 }));
      for (const x of [-.62, -.21, .21, .62]) addBox(g, [.28, .42, .035], [x, 1.18, length / 2 + .04], mat('#A7CED2'));
      addBox(g, [.52, .20, .06], [0, .58, length / 2 + .04], new THREE.MeshStandardMaterial({ map: labelTexture('بنها', { bg: '#F5EAD0', color: '#183E51', fontSize: 40 }) }));
      // Hand-painted red/green route stripe.
      addBox(g, [width + .02, .11, length * .65], [0, 1.38, -.05], mat('#B54B3D'));
    } else {
      windshield.material = mat('#8DB6C2');
      addBox(g, [.42, .20, .06], [0, .52, length / 2 + .04], new THREE.MeshStandardMaterial({ map: labelTexture('ملاكي بنها', { bg: '#F3E4C7', color: '#263949', fontSize: 34 }) }));
    }
  }
  for (const side of [-1, 1]) for (const z of [-length * .32, length * .32]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .18, 14), wheelMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * width * .49, .35, z); wheel.castShadow = true; g.add(wheel);
  }
  for (const x of [-width * .34, width * .34]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(.23, .16, .06), lamp); headlight.position.set(x, .78, length / 2 + .05); g.add(headlight);
  }
  addBox(g, [.5, .18, .07], [0, .36, length / 2 + .05], new THREE.MeshStandardMaterial({ map: labelTexture('بنها', { bg: '#F1E5CF', color: '#173E51', fontSize: 38 }) }));
  return g;
}

function addTrafficLights(vehicle, type) {
  if (vehicle.userData.trafficLights) return vehicle;
  const bounds = vehicle.userData.trafficBounds;
  const halfWidth = bounds?.halfWidth || ({ car: .86, microbus: .9, tuktuk: .68, bike: .42 }[type] || .8);
  const halfDepth = bounds?.halfDepth || ({ car: 1.72, microbus: 1.9, tuktuk: 1.2, bike: .86 }[type] || 1.2);
  const height = bounds?.height || ({ car: 1.5, microbus: 2.2, tuktuk: 1.6, bike: 1.25 }[type] || 1.5);
  const lamps = [];
  // Lights have no visible bulb geometry: the vehicle model already provides
  // its own headlamp lens. These lights only illuminate nearby surfaces while
  // flashing, so nothing can look like a loose dot stuck on the bumper.
  const positions = type === 'car'
    ? [[-.56, .72], [.56, .72]]
    : type === 'microbus'
      ? [[-.42, .78], [.42, .78]]
      : type === 'tuktuk'
        ? [[0, .77]]
        : type === 'tataTruck' || type === 'corsaTruck'
          ? [[-.55, .82], [.55, .82]]
        : [[0, Math.min(.88, height * .58)]];
  for (const [x, y] of positions) {
    const light = new THREE.SpotLight('#FFF0B8', 0, 22, Math.PI / 7, .62, 2);
    light.position.set(x, y, halfDepth - .18);
    light.target.position.set(x, y - 1.35, halfDepth + 7);
    vehicle.add(light, light.target); lamps.push(light);
  }
  vehicle.userData.trafficLights = lamps;
  return vehicle;
}

function createEventVehicle(type) {
  const loaded = realVehicle(type);
  if (loaded) return addTrafficLights(loaded, type);
  // Keep the event playable if an optional model fails to load.
  return createVehicle(type === 'tataTruck' ? 'microbus' : 'car');
}

function createSideStreetEntry(side, z) {
  const road = new THREE.Group();
  road.position.set(side * 18.7, 0, z);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(27, 12), new THREE.MeshStandardMaterial({ color: '#45484B', roughness: .96, side: THREE.DoubleSide }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = -.025; road.add(asphalt);
  const paint = new THREE.MeshBasicMaterial({ color: '#E8E2D3', transparent: true, opacity: .8, side: THREE.DoubleSide });
  for (const edgeZ of [-5.35, 5.35]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(26, .09), paint);
    edge.rotation.x = -Math.PI / 2; edge.position.set(0, -.012, edgeZ); road.add(edge);
  }
  for (let x = -11; x < 12; x += 4) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .08), paint);
    dash.rotation.x = -Math.PI / 2; dash.position.set(x, -.01, 0); road.add(dash);
  }
  return road;
}

function makeCollectibleBag() {
  const g = new THREE.Group();
  const fabric = mat('#F46A1B');
  addBox(g, [.52, .56, .3], [0, .59, 0], fabric);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .1, 10), mat('#E85A12'));
  top.position.set(0, .91, 0); g.add(top);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(.36, .15), new THREE.MeshBasicMaterial({ map: labelTexture('TWIST', { bg: '#F46A1B', fontSize: 64 }) }));
  front.position.set(0, .59, .156); g.add(front);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.12, .027, 8, 18, Math.PI), mat('#FFE7C4')); handle.position.set(0, .98, 0); g.add(handle);
  g.userData.collectRadius = { x: 1.0, z: 1.65 };
  return g;
}

function makeRoadCrate() {
  const g = new THREE.Group();
  const cardboard = mat('#A96832', .92), shadowed = mat('#704322', .94), tape = mat('#E3C991', .75), reflect = mat('#F4F0D6', .42);
  g.userData.ownedMaterials = [cardboard, shadowed, tape, reflect];
  addBox(g, [.92, .58, .72], [0, .31, 0], cardboard);
  addBox(g, [.94, .06, .74], [0, .58, 0], shadowed);
  addBox(g, [.13, .61, .75], [0, .3, 0], tape);
  addBox(g, [.95, .12, .025], [0, .33, .38], reflect, false);
  g.userData.collisionBounds = { halfWidth: .5, halfDepth: .42, height: .64 };
  return g;
}

function makeShopBuilding(x, z, index, side) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const width = 3.6 + (index % 3) * .55, height = 5.5 + (index % 4) * .8, depth = 3.8;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(['#DDB58F', '#D1A18B', '#E0C398', '#C68C71'][index % 4]));
  wall.position.y = height / 2; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width * .94, height * .96), new THREE.MeshStandardMaterial({ map: createShopTexture(index, ['محلات بنها', 'ملابس', 'كشري', 'موبايلات'][index % 4]), roughness: .86 }));
  plane.position.set(side * (width / 2 + .025), height / 2, 0); plane.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(plane);
  const awning = addBox(g, [width * .98, .34, .7], [0, .38, side < 0 ? 1.85 : 1.85], mat(['#B85238', '#147154', '#193F66'][index % 3]));
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(width * .88, .54), new THREE.MeshBasicMaterial({ map: labelTexture(['محلات بنها', 'أحذية وملابس', 'مطعم بلدي', 'سوق بنها'][index % 4], { bg: ['#087A59', '#A54934', '#174B71'][index % 3], fontSize: 38 }) }));
  shopSign.position.set(side < 0 ? -width / 2 - .04 : width / 2 + .04, 3.2, 1.93); shopSign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(shopSign);
  return g;
}

function createStation(scene) {
  // The exterior station frontage sits closer to the camera than the statue island.
  const station = new THREE.Group(); station.position.set(0, 0, -8); scene.add(station);
  // Saad Zaghloul Street: the real scene is a busy commercial avenue, not a rail platform.
  const plaster = mat('#D9C8AE'), stone = mat('#A94F3D'), dark = mat('#453A31'), glass = mat('#527985');
  for (const side of [1]) {
    const block = new THREE.Group(); block.position.set(side * 12.4, 0, 1.2); station.add(block);
    addBox(block, [7.2, 11.5, 24], [0, 5.75, -2], plaster);
    for (let floor = 0; floor < 4; floor++) for (let bay = 0; bay < 2; bay++) {
      const z = -11 + bay * 9.2, y = 4.3 + floor * 1.78;
      addBox(block, [.08, 1.12, 1.45], [-side * 3.63, y, z], dark);
      addBox(block, [.1, .92, 1.22], [-side * 3.69, y, z], glass);
      addBox(block, [.24, .11, 1.7], [-side * 3.72, y - .57, z], stone);
      if (floor === 0) addBox(block, [.25, .13, 1.8], [-side * 3.73, 3.28, z], mat(bay ? '#17624D' : '#174C6B'));
    }
    // Ground-floor shops and their colorful awnings line both sidewalks.
    for (let bay = 0; bay < 3; bay++) {
      const z = -10 + bay * 7;
      addBox(block, [.12, 2.6, 3.8], [-side * 3.72, 1.55, z], dark);
      addBox(block, [.14, 1.55, 3.35], [-side * 3.8, 1.55, z], glass);
      addBox(block, [.62, .32, 4.25], [-side * 3.95, 3.05, z], mat(['#A64C36', '#13705A', '#174C6B'][bay]));
    }
  }
  // Exterior of Banha Station, based on the reference: pale geometric upper facade,
  // broad brown bilingual sign, stone band and dark glazed entrance doors.
  const facade = mat('#E5E2DC'), facadeShadow = mat('#C8C4BD'), stationStone = mat('#8F8980'), signBoard = mat('#704D42'), doorFrame = mat('#332F2B'), doorGlass = mat('#52656A', .28);
  const frontage = new THREE.Group(); frontage.position.x = -15; station.add(frontage);
  addBox(frontage, [19.2, 8.2, 1.25], [0, 4.1, -2.2], facade);
  addBox(frontage, [19.5, 2.0, 1.4], [0, 3.5, -1.45], stationStone);
  addBox(frontage, [19.4, 2.2, 1.45], [0, 7.1, -1.42], facadeShadow);
  // Repeating projecting blocks suggest the distinctive deep-set concrete lattice.
  for (let row = 0; row < 3; row++) for (let col = -7; col <= 7; col++) {
    const x = col * 1.28, y = 5.35 + row * .86;
    addBox(frontage, [.25, .72, .36], [x, y, -.05], facade);
    if ((col + row) % 2 === 0) addBox(frontage, [.78, .2, .28], [x, y + .43, -.12], facadeShadow);
  }
  addBox(frontage, [11.7, 2.25, .22], [0, 5.23, .35], signBoard);
  addBox(frontage, [10.95, .75, .035], [0, 5.65, .49], new THREE.MeshStandardMaterial({ map: labelTexture('محطة بنها', { bg: '#704D42', color: '#F4F0E8', width: 800, height: 120, fontSize: 76 }), roughness: .8 }));
  addBox(frontage, [7.1, .54, .035], [0, 4.88, .5], new THREE.MeshStandardMaterial({ map: labelTexture('Banha Train Station', { bg: '#704D42', color: '#F4F0E8', width: 800, height: 96, fontSize: 53 }), roughness: .8 }));
  for (let bay = -3; bay <= 3; bay++) {
    const x = bay * 1.34;
    addBox(frontage, [1.22, 2.65, .18], [x, 1.28, .25], doorFrame);
    addBox(frontage, [1.02, 2.28, .08], [x, 1.36, .37], doorGlass);
    addBox(frontage, [1.02, .68, .1], [x, .48, .42], mat('#3E4547'));
  }
  for (let x = -5.4; x <= 5.4; x += 2.7) addBox(frontage, [.2, 3.3, .35], [x, 1.65, .5], mat('#BDA98C'));
  // Mosque sits across the avenue from the statue, halfway toward the station.
  const mosque = new THREE.Group(); mosque.position.set(11.2, 0, -52); station.add(mosque);
  const ivory = mat('#E8DDC5'), green = mat('#34785D'), gold = mat('#C6A451');
  addBox(mosque, [7.8, 5.5, 6.2], [0, 2.75, 0], ivory);
  addBox(mosque, [8.3, .55, 6.65], [0, 5.45, 0], mat('#D1B993'));
  for (let i = -2; i <= 2; i++) {
    const x = i * 1.38;
    const arch = new THREE.Mesh(new THREE.ShapeGeometry(makeArchShape(1.08, 2.5)), new THREE.MeshStandardMaterial({ color: '#28634F', side: THREE.DoubleSide, roughness: .84 }));
    arch.position.set(x, .12, 3.13); mosque.add(arch);
    addBox(mosque, [.11, 2.8, .14], [x - .57, 1.5, 3.18], gold);
    addBox(mosque, [.11, 2.8, .14], [x + .57, 1.5, 3.18], gold);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.05, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), green); dome.position.set(0, 5.7, -.25); mosque.add(dome);
  addBox(mosque, [4.2, .22, 4.2], [0, 5.6, -.25], ivory);
  const minaret = new THREE.Group(); minaret.position.set(-3.35, 0, -1.1); mosque.add(minaret);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.38, .58, 9.4, 12), ivory); shaft.position.y = 5.05; minaret.add(shaft);
  for (const [y, radius, height] of [[2.1, .82, .32], [7.2, .72, .26], [8.8, .58, .22]]) {
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * .92, height, 12), gold); balcony.position.y = y; minaret.add(balcony);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.52, 1.2, 12), green); cap.position.y = 10.25; minaret.add(cap);
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .72, 8), gold); finial.position.y = 11.15; minaret.add(finial);
  return station;
}

function createSaadZaghloulMonument(parent) {
  // Keep the statue about 100 m down the avenue from the station frontage.
  const island = new THREE.Group(); island.position.set(0, 0, -110); island.scale.setScalar(1.3); parent.add(island);
  const granite = mat('#7D493F'), graniteLight = mat('#A66D58'), bronze = mat('#343B3C', .46), plaque = mat('#D4C1A0', .65);
  // Long raised traffic island, with a narrow center plinth so both road lanes pass it.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, .42, 32), mat('#C7B99E')); base.scale.z = 4.1; base.position.y = .21; island.add(base);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.31, .16, 32), mat('#8B8171')); rim.scale.z = 4.05; rim.position.y = .5; island.add(rim);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.56, .36, 2.25), graniteLight); lower.position.set(0, .72, 0); island.add(lower);
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.24, 3.18, 1.8), granite); pedestal.position.set(0, 2.49, 0); island.add(pedestal);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.48, .24, 2.02), graniteLight); cap.position.set(0, 4.2, 0); island.add(cap);
  // Framed front plaque echoes the pale inset panel visible on the photographed stone base.
  addBox(island, [.82, 1.42, .065], [0, 2.62, .935], graniteLight);
  addBox(island, [.65, 1.22, .075], [0, 2.62, .985], plaque);
  addBox(island, [.48, .08, .09], [0, 2.17, 1.03], granite);
  // Upright bronze statesman silhouette with long coat, joined hands and a distinct profile.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.24, .39, 1.22, 8), bronze); body.position.set(0, 4.98, 0); island.add(body);
  const coat = new THREE.Mesh(new THREE.BoxGeometry(.66, .72, .34), bronze); coat.position.set(0, 4.79, .015); island.add(coat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 14, 12), bronze); head.scale.set(.86, 1.2, .9); head.position.set(.035, 5.77, 0); island.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.075, .2, 8), bronze); nose.rotation.z = -Math.PI / 2; nose.position.set(.2, 5.78, .015); island.add(nose);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, .85, 8), bronze); leg.position.set(side * .15, 4.27, .015); island.add(leg);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.085, .11, .8, 8), bronze); arm.position.set(side * .31, 4.96, .02); arm.rotation.z = side * -.08; island.add(arm);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.2, .12, .3), bronze); shoe.position.set(side * .15, 3.87, .09); island.add(shoe);
  }
  const hands = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), bronze); hands.position.set(.06, 4.59, .21); island.add(hands);
  return island;
}

function makeArchShape(width, height) {
  const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(-width / 2, height * .58);
  shape.quadraticCurveTo(-width / 2, height, 0, height); shape.quadraticCurveTo(width / 2, height, width / 2, height * .58);
  shape.lineTo(width / 2, 0); shape.closePath(); return shape;
}

function makeClockTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#F1E4C7'; x.beginPath(); x.arc(128, 128, 119, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#75593A'; x.lineWidth = 8; x.stroke();
  x.strokeStyle = '#44392D'; x.lineWidth = 6; x.lineCap = 'round';
  x.beginPath(); x.moveTo(128, 128); x.lineTo(128, 61); x.moveTo(128, 128); x.lineTo(174, 128); x.stroke();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillStyle = '#554635'; x.beginPath(); x.arc(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92, 4, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function createScene(canvas, area, gameRef, storeNames, storeBrands = {}) {
  // Keep context creation compatible with integrated GPUs and embedded browsers.
  // Requesting a high-performance adapter plus multisampling could exhaust or
  // fail context allocation in the in-app preview, leaving the whole game blank.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', stencil: false, failIfMajorPerformanceCaveat: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9DD8EB'); scene.fog = new THREE.Fog('#C9DAD3', 36, 105);
  if (area.id === 'station') scene.fog.far = 250;
  const camera = new THREE.PerspectiveCamera(54, 1, .1, area.id === 'station' ? 300 : 150); camera.position.set(0, 5.2, 11.6); camera.lookAt(0, 1.1, -4);
  const hemi = new THREE.HemisphereLight('#E5F4FF', '#74604C', 2.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF0D2', 3.0); sun.position.set(-12, 22, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -15; scene.add(sun);
  const nightStreetLights = [];

  // Villas get the new curved, streamed world; every other area keeps the original straight street.
  const world = area.id === 'villas' ? createVillasWorld(scene, camera, { sun, hemi, renderer, envUrl: '/runner/env/sunset_1k.hdr', startIdx: 0, storeNames, storeBrands }) : null;
  const resetRoute = () => world?.reset();
  gameRef.current.resetRoute = resetRoute;
  const routeShift = world ? (Math.max(2, Math.ceil(storeNames.length / 4)) - 2) * 14 : 0;
  const routeStops = ROUTE_STOPS.map((stop) => ({ ...stop, distance: stop.distance + routeShift }));
  const mobile = window.innerWidth < 700;
  if (world) {
    camera.fov = 60; camera.far = 260; camera.position.set(0, 4.35, 11.2); camera.updateProjectionMatrix();
    sun.position.set(-16, 20, -6); // low sun ahead-left: long shadows toward the camera
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 45, bottom: -25 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0004;
  }
  let roadTexture = null, pavementTextures = [];
  const moving = [], markings = [], pedestrians = [], obstacles = [];
  if (!world) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 150), mat('#76865F')); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.12, -32); ground.receiveShadow = true; scene.add(ground);
  roadTexture = surfaceTexture('#45494D', 5173); pavementTextures = [-1, 1].map(side => surfaceTexture(side < 0 ? '#B7A58B' : '#C0AD91', 741 + side, true));
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 100), new THREE.MeshStandardMaterial({ map: roadTexture, roughness: .96 })); road.rotation.x = -Math.PI / 2; road.position.set(0, -.04, -35); road.receiveShadow = true; scene.add(road);
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(.38, .14, 100), mat('#D7C3A2')); curb.position.set(side * 5.8, .02, -35); curb.receiveShadow = true; scene.add(curb);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 100), new THREE.MeshStandardMaterial({ map: pavementTextures[side > 0 ? 1 : 0], roughness: 1 })); walk.rotation.x = -Math.PI / 2; walk.position.set(side * 8.7, -.035, -35); walk.receiveShadow = true; scene.add(walk);
  }
  // Dashes, crosswalk pieces, sidewalk paving, street lamps, trees and moving shops.
  for (const lane of [-1.45, 1.45]) for (let i = 0; i < 12; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.09, .018, 3.3), mat('#F4E8D5')); stripe.position.set(lane, .012, -70 + i * 7); scene.add(stripe); markings.push(stripe);
  }
  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 1]) {
      const z = -8 - i * 12;
      const building = makeShopBuilding(side * (7.5 + (i % 2) * .5), z, i + (side > 0 ? 4 : 0), side); scene.add(building); moving.push(building);
      const lampGroup = new THREE.Group(); lampGroup.position.set(side * 5.7, 0, z + 4); scene.add(lampGroup); moving.push(lampGroup);
      addBox(lampGroup, [.12, 4.6, .12], [0, 2.3, 0], mat('#3C4847'));
      const arm = addBox(lampGroup, [.9, .1, .1], [-side * .38, 4.5, 0], mat('#3C4847')); arm.rotation.z = side * .10;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#FFE8AD', emissive: '#DBA846', emissiveIntensity: .65 })); bulb.position.set(-side * .78, 4.42, 0); lampGroup.add(bulb);
      const streetLight = new THREE.PointLight('#FFD99A', 0, 13, 2); streetLight.position.copy(bulb.position); lampGroup.add(streetLight); nightStreetLights.push(streetLight);
      const treeGroup = new THREE.Group(); treeGroup.position.set(side * (6.7 + (i % 2) * .35), 0, z - 2); scene.add(treeGroup); moving.push(treeGroup);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.13, .18, 1.35, 8), mat('#765438')); trunk.position.y = .67; treeGroup.add(trunk);
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 1), mat(['#56834D', '#6D9858', '#477745'][i % 3])); foliage.position.y = 1.75; foliage.castShadow = true; treeGroup.add(foliage);
      const walker = makePerson(['#347C82', '#BB563E', '#3E5D8B', '#9C7440', '#674B76'][i % 5], .92 + (i % 3) * .07);
      walker.position.set(side * (5.25 + (i % 2) * .35), 0, z + 2); walker.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(walker); pedestrians.push(walker); moving.push(walker);
    }
  }
  }
  // Station Square: station facade, the clock monument and a fountain island.
  let landmark = null, monument = null;
  if (area.id === 'station') {
    landmark = createStation(scene);
    monument = createSaadZaghloulMonument(scene);
  }
  if (area.id === 'stadium') {
    const stand = new THREE.Group(); stand.position.set(0, 0, -34); scene.add(stand);
    addBox(stand, [12, 3.4, 1.5], [0, 1.7, -2], mat('#C8D3C2'));
    for (let i = 0; i < 5; i++) addBox(stand, [11.5 - i * .35, .17, 1.0], [0, .55 + i * .46, -1.1 - i * .18], mat(i % 2 ? '#477A57' : '#6C8D62'));
    landmark = stand;
  }
  if (area.id === 'villas' && !world) {
    const bridge = new THREE.Group(); bridge.position.set(0, 0, -31); scene.add(bridge);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(5.2, .25, 8, 32, Math.PI), mat('#D2C5AB')); arc.rotation.z = Math.PI; arc.position.y = 2.3; bridge.add(arc);
    addBox(bridge, [14, .22, 1], [0, 3.1, 0], mat('#C9B999')); landmark = bridge;
  }
  if (area.id === 'farid-nada' || area.id === 'ahram') {
    const sign = new THREE.Group(); sign.position.set(0, 0, -27); scene.add(sign);
    addBox(sign, [7.4, 2.5, .25], [0, 4.5, -2], mat('#E4D0AD'));
    addBox(sign, [6.8, .85, .15], [0, 4.5, -1.82], new THREE.MeshStandardMaterial({ map: labelTexture(area.sign, { bg: '#087A59', fontSize: 58 }) })); landmark = sign;
  }
  // Atmospheric traffic and moving street scenery.
  for (let i = 0; i < 9; i++) {
    const type = i % 4 === 0 ? 'microbus' : i % 4 === 1 ? 'tuktuk' : i % 4 === 2 ? 'car' : 'bike';
    // Give background traffic its proper road scale. The previous 0.58–0.78 multiplier
    // made already detailed GLB vehicles look toy-sized against the lane markings.
    const trafficScale = { car: .96, microbus: .92, tuktuk: .96, bike: .96 }[type] || .92;
    const direction = i % 3 === 2 ? -1 : 1;
    const lane = direction < 0 ? 2 : (i % 2);
    const vehicle = createVehicle(type, ROUTES[i % ROUTES.length]); vehicle.scale.setScalar(trafficScale);
    if (direction < 0) vehicle.rotation.y = Math.PI;
    const z = direction > 0 ? -28 - Math.floor(i / 3) * 20 : -8 - Math.floor(i / 3) * 20;
    vehicle.position.set(LANES[lane], ROAD_SURFACE_Y, z); scene.add(vehicle); if (world) patchBend(vehicle); obstacles.push({ group: vehicle, type, lane, direction, checked: false, initial: true });
  }
  let runner = world ? makeHero() : makeRunner(); runner.position.set(0, 0, 2.3); scene.add(runner); if (world) patchBend(runner);
  const loadLegacyWalker = () => loadWalker().then((loaded) => {
    if (!loaded || disposed) return;
    const oldRunner = runner, realRunner = makeWalker(1.85);
    // The person faces down the road; a compact, light courier backpack sits close to his back.
    const walkerModel = realRunner.children[0]; walkerModel.rotation.y = Math.PI;
    const deliveryBag = new THREE.Group();
    const fabric = new THREE.MeshStandardMaterial({ map: fabricTexture('#E87825'), roughness: .98 });
    const darkFabric = new THREE.MeshStandardMaterial({ map: fabricTexture('#B94E17', 73), roughness: 1 });
    const strapMat = new THREE.MeshStandardMaterial({ color: '#263746', roughness: .82 });
    // Compact soft-sided courier backpack with rounded fabric edges and a front pocket.
    const packShape = new THREE.Shape();
    packShape.moveTo(-.145, -.22); packShape.lineTo(.145, -.22); packShape.lineTo(.18, -.16);
    packShape.lineTo(.18, .12); packShape.lineTo(.145, .2); packShape.lineTo(-.145, .2);
    packShape.lineTo(-.18, .12); packShape.lineTo(-.18, -.16); packShape.closePath();
    const packGeometry = new THREE.ExtrudeGeometry(packShape, { depth: .145, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: .024, bevelThickness: .022, curveSegments: 8 });
    packGeometry.translate(0, 0, -.0725);
    const bagBody = new THREE.Mesh(packGeometry, fabric); bagBody.castShadow = true; deliveryBag.add(bagBody);
    const topFlap = new THREE.Mesh(new RoundedBoxGeometry(.29, .06, .16, 5, .025), darkFabric); topFlap.position.set(0, .19, .015); deliveryBag.add(topFlap);
    const frontPocket = new THREE.Mesh(new RoundedBoxGeometry(.295, .16, .035, 5, .028), darkFabric); frontPocket.position.set(0, -.105, .09); frontPocket.castShadow = true; deliveryBag.add(frontPocket);
    // Raised piping, zipper tracks and small zipper pulls give the fabric bag readable construction.
    for (const x of [-.16, .16]) addBox(deliveryBag, [.01, .38, .01], [x, 0, .073], darkFabric);
    addBox(deliveryBag, [.29, .012, .012], [0, .135, .091], strapMat);
    addBox(deliveryBag, [.26, .012, .012], [0, -.02, .111], strapMat);
    addBox(deliveryBag, [.04, .022, .016], [.125, .14, .1], mat('#D8DEE3', .42));
    addBox(deliveryBag, [.04, .022, .016], [.105, -.02, .116], mat('#D8DEE3', .42));
    // Use Twist's actual logo artwork on a light stitched patch so it stays readable.
    addBox(deliveryBag, [.275, .105, .012], [0, -.105, .112], mat('#FFF8EC', .4));
    const logoTexture = new THREE.TextureLoader().load('/brand/twist-logo.png');
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    const bagLabel = new THREE.Mesh(new THREE.PlaneGeometry(.255, .074), new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, toneMapped: false }));
    bagLabel.position.set(0, -.105, .119); deliveryBag.add(bagLabel);
    // Padded shoulder straps curve over the shoulders and sit flat against the rider's back.
    for (const x of [-.155, .155]) {
      addBox(deliveryBag, [.036, .4, .03], [x * .82, -.025, -.087], strapMat);
      addBox(deliveryBag, [.048, .03, .016], [x * .82, -.17, -.065], mat('#D8DEE3', .5));
    }
    deliveryBag.position.set(0, 1.3, .24); realRunner.add(deliveryBag);

    // Orange high-visibility delivery vest on the back, with a reflective strip.
    const walkerScale = Math.max(walkerModel.scale.x, .01), vest = new THREE.Group(); vest.scale.setScalar(1 / walkerScale);
    const vestShape = new THREE.Shape(); vestShape.moveTo(-.23, -.22); vestShape.lineTo(.23, -.22); vestShape.lineTo(.23, .13); vestShape.lineTo(.14, .2); vestShape.lineTo(.08, .15); vestShape.lineTo(-.08, .15); vestShape.lineTo(-.14, .2); vestShape.lineTo(-.23, .13); vestShape.closePath();
    const vestMesh = new THREE.Mesh(new THREE.ShapeGeometry(vestShape), new THREE.MeshStandardMaterial({ color: '#F58220', roughness: .84, side: THREE.DoubleSide })); vestMesh.castShadow = true; vest.add(vestMesh);
    const vestReflective = new THREE.Mesh(new THREE.PlaneGeometry(.38, .045), mat('#D8DEE3', .35)); vestReflective.position.set(0, -.09, .006); vest.add(vestReflective);
    vest.position.set(0, (1.27 - walkerModel.position.y) / walkerScale, -.125 / walkerScale); walkerModel.add(vest);

    // A fitted baseball cap: shallow cloth crown, distinct lower band, curved visor and rear adjuster.
    const cap = new THREE.Group(), capMat = new THREE.MeshStandardMaterial({ map: fabricTexture('#12314A', 47), roughness: .98 }), capTrim = mat('#0A2234', .9), capScale = 1 / walkerScale; cap.scale.setScalar(capScale);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.125, 24, 16, 0, Math.PI * 2, 0, Math.PI * .52), capMat);
    crown.scale.y = .78; crown.position.y = .015; crown.castShadow = true; cap.add(crown);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.112, .009, 8, 28), capTrim); band.rotation.x = Math.PI / 2; band.scale.z = .88; band.position.y = -.02; cap.add(band);
    const brim = new THREE.Mesh(new RoundedBoxGeometry(.255, .022, .135, 5, .045), capMat); brim.position.set(0, -.018, .095); cap.add(brim);
    const rearStrap = new THREE.Mesh(new RoundedBoxGeometry(.085, .018, .012, 3, .008), mat('#D7DEE4', .5)); rearStrap.position.set(0, -.045, -.105); cap.add(rearStrap);
    const rearTab = new THREE.Mesh(new RoundedBoxGeometry(.045, .023, .012, 3, .006), mat('#F58220', .88)); rearTab.position.set(0, -.012, -.111); cap.add(rearTab);
    const capBadge = new THREE.Mesh(new THREE.PlaneGeometry(.048, .034), new THREE.MeshBasicMaterial({ map: labelTexture('T', { bg: '#F58220', color: '#FFFFFF', width: 128, height: 128, fontSize: 74 }) })); capBadge.position.set(0, .012, .122); cap.add(capBadge);
    // Seat the cap low on the head instead of floating above the scalp.
    cap.scale.set(capScale * .9, capScale * .92, capScale * .9);
    cap.position.set(0, (1.68 - walkerModel.position.y) / walkerScale, 0); walkerModel.add(cap);
    realRunner.userData.walkerModel = walkerModel; realRunner.userData.deliveryBag = deliveryBag;
    realRunner.position.copy(oldRunner.position); realRunner.scale.copy(oldRunner.scale);
    scene.remove(oldRunner); runner = realRunner; scene.add(runner); if (world) patchBend(runner);
  }).catch(() => {});
  // Loading gate: start rendering immediately and let the fallback models keep
  // the scene usable if a remote asset stalls; the gate has its own timeout.
  let disposed = false, streetEnv = null, loadReportTimer = 0, variantLoadTimer = 0;
  const prog = { done: 0, total: 9, finished: false, heroDone: false, baseDone: false, varDone: false };
  const report = () => { gameRef.current.onLoad?.(prog.finished ? 100 : Math.min(97, 12 + Math.round(prog.done / prog.total * 85))); };
  const settle = () => {
    if (prog.finished || !prog.heroDone || !prog.baseDone || !prog.varDone) return;
    prog.finished = true;
    try { renderer.compile(scene, camera); } catch { /* shader warm-up is optional */ }
    loadReportTimer = setTimeout(() => { if (!disposed) report(); }, 60); // not rAF: background tabs never fire it
  };
  const loadTimer = setTimeout(() => { prog.heroDone = prog.baseDone = prog.varDone = true; settle(); }, 45000);
  report();
  // Rigged Twist courier (Mixamo skeleton: run / jump / slide / fall / get up / idle); the legacy walker is only a fallback.
  loadTwistHero().then((hero) => {
    if (disposed) return;
    const old = runner; hero.position.copy(old.position); hero.rotation.copy(old.rotation);
    scene.remove(old); runner = hero; scene.add(runner); if (world) patchBend(runner);
    prog.done++; prog.heroDone = true; report(); settle();
  }).catch((err) => { if (disposed) return; console.warn('Twist hero failed, using fallback', err); Promise.resolve(loadLegacyWalker()).catch(() => {}).finally(() => { if (disposed) return; prog.done++; prog.heroDone = true; report(); settle(); }); });
  const cameraTarget = new THREE.Vector3(0, world ? 1.5 : 1.15, world ? -6 : -4);
  // Swap in real GLB vehicles when provided (public/runner/models/*.glb); new spawns use them automatically.
  const applyNight = (enabled) => {
    const night = !!enabled;
    if (world?.setNight) world.setNight(night);
    else {
      scene.background.set(night ? '#1D3048' : '#9DD8EB');
      scene.fog.color.set(night ? '#354760' : '#C9DAD3');
      scene.fog.near = night ? 22 : 36; scene.fog.far = night ? 135 : 105;
      hemi.intensity = night ? .86 : 2.0; sun.intensity = night ? .12 : 3.0;
    }
    if (scene.environment) scene.environmentIntensity = night ? .29 : .72;
    for (const light of nightStreetLights) light.intensity = night ? 6.8 : 0;
  };
  let appliedNight = null;
  // Use the same outdoor HDRI reflections on every street so the vehicle paint and glass
  // read as real materials instead of flat, unreflected surfaces.
  if (!world) {
    new HDRLoader().load('/runner/env/sunset_1k.hdr', (hdr) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose(); pmrem.dispose();
      if (disposed) { env.dispose(); return; }
      streetEnv = env; scene.environment = env; scene.environmentIntensity = gameRef.current.nightMode ? .29 : .72;
    }, undefined, () => { /* Keep the existing lighting if the optional reflection map is unavailable. */ });
  }
  loadRealVehicles().catch(() => []).then((found) => {
    if (disposed) return;
    prog.done++; prog.baseDone = true; report();
    if (!found.length) { prog.varDone = true; settle(); return; }
    world?.refreshParkedVehicles();
    for (const item of obstacles) {
      if (!found.includes(item.type) || !item.initial) continue;
      const old = item.group, fresh = createVehicle(item.type); fresh.position.copy(old.position); fresh.rotation.copy(old.rotation); fresh.scale.copy(old.scale); fresh.scale.setScalar(old.scale.x);
      scene.remove(old); scene.add(fresh); if (world) patchBend(fresh); item.group = fresh;
    }
    // Start supplied models progressively. Only wait briefly for the two
    // signature challenge trucks; optional traffic variants can stream in later.
    const slotByModel = { sportage: ['car', 0], carry: ['microbus', 0], carnival: ['microbus', 1], hayabusa: ['bike', 0], autoRickshaw: ['tuktuk', 0] };
    const requiredVariants = new Set(['tataTruck', 'corsaTruck']);
    const finishVariantGate = () => { clearTimeout(variantLoadTimer); if (disposed || prog.varDone) return; prog.varDone = true; settle(); };
    variantLoadTimer = setTimeout(finishVariantGate, 12000);
    void loadRealVehicleVariants((key) => {
      if (disposed) return;
      prog.done++; report();
      world?.refreshParkedVehicles();
      const [type, slot] = slotByModel[key] || [];
      if (type) {
        const item = obstacles.filter((candidate) => candidate.initial && candidate.type === type)[slot];
        if (item) {
          const fresh = makeRealVehicleVariant(key);
          if (fresh) {
            addTrafficLights(fresh, type);
            const old = item.group;
            fresh.position.copy(old.position); fresh.rotation.copy(old.rotation); fresh.scale.copy(old.scale);
            scene.remove(old); scene.add(fresh); if (world) patchBend(fresh); item.group = fresh;
          }
        }
      }
      if (requiredVariants.has(key)) {
        requiredVariants.delete(key);
        if (!requiredVariants.size) finishVariantGate();
      }
    }).catch(() => finishVariantGate());
  });
  const post = world ? createPost(renderer, scene, camera, { mobile }) : null;
  // A small live rear-view mirror shows an approaching car without a warning banner.
  const rearView = world ? (() => {
    const target = new THREE.WebGLRenderTarget(384, 192, { depthBuffer: true, stencilBuffer: false });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.texture.generateMipmaps = false;
    target.texture.wrapS = THREE.RepeatWrapping; target.texture.repeat.x = -1; target.texture.offset.x = 1;
    const viewCamera = new THREE.PerspectiveCamera(68, 2, .1, 120);
    viewCamera.layers.set(0); scene.add(viewCamera);
    const group = new THREE.Group(); group.position.set(0, 1.34, -3.15);
    const frame = new THREE.Mesh(new RoundedBoxGeometry(1.28, .72, .08, 5, .08), new THREE.MeshBasicMaterial({ color: '#101820', toneMapped: false }));
    frame.layers.set(1); group.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.16, .58), new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false }));
    screen.position.z = .045; screen.layers.set(1); group.add(screen);
    group.visible = false; camera.add(group); camera.layers.enable(1); scene.add(camera);
    return { target, camera: viewCamera, group, frame, screen };
  })() : null;
  const clock = new THREE.Clock(); let hudTime = 0, raf = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); post?.setSize(rect.width, rect.height);
    camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix();
  };
  resize(); const observer = new ResizeObserver(resize); observer.observe(canvas);
  const animateLimb = (limbs, phase, amount = .68) => {
    limbs.armPivots[0].rotation.x = Math.sin(phase) * amount; limbs.armPivots[1].rotation.x = Math.sin(phase + Math.PI) * amount;
    limbs.legPivots[0].rotation.x = Math.sin(phase + Math.PI) * amount; limbs.legPivots[1].rotation.x = Math.sin(phase) * amount;
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const marker = new THREE.Mesh(new THREE.RingGeometry(.26, .36, 28), new THREE.MeshBasicMaterial({ color: '#F47C1E', transparent: true, opacity: .85, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 5; scene.add(marker);
  const tick = () => {
    raf = requestAnimationFrame(tick); const dt = Math.min(clock.getDelta(), .045), g = gameRef.current;
    if (appliedNight !== !!g.nightMode) { applyNight(g.nightMode); appliedNight = !!g.nightMode; }
    if ((g.running || g.exploring) && !g.paused) g.hitPause = Math.max(0, (g.hitPause || 0) - dt);
    const active = (g.running || g.exploring) && !g.paused;
    for (const item of obstacles) {
      if (TRAFFIC_TYPES.includes(item.type) && item.initial) item.group.visible = !g.running;
      else if (CHALLENGE_VEHICLE_TYPES.includes(item.type)) item.group.visible = true;
    }
    if (g.running && g.resetChallenge) {
      let vehicleIndex = 0;
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const item = obstacles[i];
        if (!item.initial) {
          scene.remove(item.group);
          if (item.entryRoad) {
            scene.remove(item.entryRoad);
            item.entryRoad.traverse((object) => {
              object.geometry?.dispose();
              const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
              materials.forEach((material) => material.dispose());
            });
          }
          for (const material of item.group.userData.ownedMaterials || []) material.dispose();
          obstacles.splice(i, 1);
          continue;
        }
        const isVehicle = TRAFFIC_TYPES.includes(item.type);
        item.checked = false; item.hold = 0; item.tukPhraseHandled = false;
        if (isVehicle) {
          item.lane = vehicleIndex % 2 ? 2 : 0;
          item.group.position.set(LANES[item.lane], ROAD_SURFACE_Y, -62 - vehicleIndex * 16);
          vehicleIndex++;
        }
      }
      g.resetChallenge = false;
    }
    // Third-person free-roam (WASD / stick, camera-relative): the body turns to face where he walks, with smooth start / stop.
    {
      const k = g.k || (g.k = {});
      let kx = (k.r || g.moveRight ? 1 : 0) - (k.l || g.moveLeft ? 1 : 0), kz = (k.f || g.walkForward ? 1 : 0) - (k.b ? 1 : 0), sprint = !!k.sprint;
      if (g.stick) { kx = g.stick.x; kz = g.stick.y; sprint = Math.hypot(kx, kz) > .85; }
      const m0 = Math.hypot(kx, kz), mag = Math.min(1, m0), mv = g.mv || (g.mv = { x: 0, z: 0 });
      const can = g.exploring && !g.paused && !(g.hitPause > 0) && m0 > .05;
      if (!g.exploring) { g.zoff = 0; mv.x = 0; mv.z = 0; }
      if (g.hitPause > 0) { mv.x = 0; mv.z = 0; }
      const cy = g.cam && g.cam.on ? g.cam.yaw : 0, sn = Math.sin(cy), cs = Math.cos(cy); // camera forward = (-sin, -cos), right = (cos, -sin)
      const ux = can ? (cs * kx - sn * kz) / m0 : 0, uz = can ? (-cs * kz - sn * kx) / m0 : 0, v = can ? (sprint ? 5.4 : 2.7) * mag : 0;
      mv.x = THREE.MathUtils.damp(mv.x, ux * v, can ? 7 : 10, dt); mv.z = THREE.MathUtils.damp(mv.z, uz * v, can ? 7 : 10, dt);
      g.moving = can; g.sprinting = can && sprint;
      if (can) g.heading = Math.atan2(-ux, -uz);
      // Forward (-z) scrolls the street; walking back toward the camera steps him out of his spot (up to ~2.8 m).
      const fwd = -mv.z; g.zoff = g.zoff || 0; g.scroll = 0;
      if (g.exploring && !g.paused) {
        if (fwd >= 0) { const back = Math.min(g.zoff, fwd * dt); g.zoff -= back; g.scroll = fwd - back / Math.max(dt, 1e-4); }
        else if ((g.walked || 0) > .02) g.scroll = -Math.min(-fwd, (g.walked || 0) / Math.max(dt, 1e-4)); // street scrolls backward toward where he came from
        else g.zoff = Math.min(2.8, g.zoff - fwd * dt);                                                  // at the start line he can only step back a little
      }
      g.mvx = mv.x;
    }
    marker.visible = false;
    const routeLength = routeStops[routeStops.length - 1].distance;
    const progress = THREE.MathUtils.clamp((g.distance || 0) / Math.max(routeLength, 1), 0, 1);
    // Increase road speed gently across the route; each selected level keeps its own clear starting speed.
    const challengeSpeed = g.level.speed * (1 + progress * .12);
    const worldSpeed = g.paused ? 0 : active ? (g.exploring ? (g.hitPause > 0 ? 0 : g.scroll || 0) : (g.hitPause > 0 ? 0 : challengeSpeed)) : .8;
    if (g.exploring && active) g.walked = Math.max(0, (g.walked || 0) + worldSpeed * dt);
    if (!g.paused) g.time += dt * (active ? 1 : .55);
    if (g.tukMessageUntil && g.time >= g.tukMessageUntil) {
      g.tukMessageUntil = 0;
      g.onHud?.((old) => old.tukMessage ? { ...old, tukMessage: null } : old);
    }
    if (world && !g.paused) world.update(dt, worldSpeed);
    if (roadTexture) roadTexture.offset.y = (roadTexture.offset.y + worldSpeed * dt / 100) % 1;
    for (const texture of pavementTextures) texture.offset.y = (texture.offset.y + worldSpeed * dt / 100) % 1;
    for (const mark of markings) { mark.position.z += worldSpeed * dt; if (mark.position.z > 6) mark.position.z -= 84; else if (mark.position.z < -78) mark.position.z += 84; }
    for (const item of moving) {
      item.position.z += worldSpeed * dt;
      if (item.position.z > 10) item.position.z -= 84; else if (item.position.z < -74) item.position.z += 84;
    }
    if (landmark) {
      landmark.position.z += worldSpeed * dt;
      if (landmark.position.z > 9) { landmark.visible = false; }
    }
    if (monument) { monument.position.z += worldSpeed * dt; if (monument.position.z > 8) monument.visible = false; }
    for (const person of pedestrians) animateLimb(person.userData.limbs, g.time * 5 + person.position.z, .42);
    if (active) {
      if (g.running) {
        g.distance = (g.distance || 0) + worldSpeed * dt;
        const reachedStop = routeStops.find((stop, index) => g.distance >= stop.distance && index >= (g.nextStop || 0));
        if (reachedStop) {
          g.location = reachedStop;
          g.locationUntil = g.time + 3.2;
          g.nextStop = routeStops.indexOf(reachedStop) + 1;
        }
      }
      // Keep spawn clocks tied to road movement. Otherwise a collision pause
      // can create several hazards at the same frozen distance.
      if (g.running && worldSpeed > 0) g.spawn -= dt;
      if (g.running && g.bags < g.level.goal && g.spawn <= 0 && obstacles.length < 22) {
        const occupiedLanes = getOccupiedChallengeLanes(obstacles);
        const openLanes = LANES.map((_, lane) => lane).filter((lane) => !occupiedLanes.has(lane));
        if (openLanes.length) {
          const group = makeCollectibleBag();
          const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
          group.position.set(LANES[lane], ROAD_SURFACE_Y, -48); scene.add(group); if (world) patchBend(group);
          obstacles.push({ group, type: 'bag', lane, checked: false, initial: false });
          g.spawn = (Math.max(.62, 1.18 - challengeSpeed / 26) / area.density + Math.random() * .38) * (g.level.bagIntervalScale || 1);
        } else g.spawn = .2;
      }
      if (g.running && worldSpeed > 0) g.trafficSpawn = (g.trafficSpawn ?? 1.2) - dt;
      if (g.running && g.trafficSpawn <= 0 && obstacles.length < 22) {
        const occupiedLanes = getOccupiedChallengeLanes(obstacles);
        const openLanes = LANES.map((_, lane) => lane).filter((lane) => !occupiedLanes.has(lane));
        // Special events follow elapsed road distance, so they still arrive if
        // the player misses a bag; level speed scales the spacing fairly.
        const event = !g.tataSpawned && g.distance >= g.level.speed * 3 ? 'tataTruck'
          : !g.rightEntrySpawned && g.distance >= g.level.speed * 5 ? 'sideEntryRight'
            : !g.rearCarSpawned && g.distance >= g.level.speed * 7 ? 'rearCar'
              : !g.stuntSpawned && g.distance >= g.level.speed * 9 ? 'stuntBike'
                : !g.leftEntrySpawned && g.distance >= g.level.speed * 11 ? 'sideEntryLeft'
                  : !g.corsaSpawned && g.distance >= g.level.speed * 12 ? 'corsaTruck'
                    : !g.bothEntrySpawned && g.distance >= g.level.speed * 13 ? 'sideEntryBoth'
                      : g.distance >= (g.nextCrateAt ?? g.level.speed * 4.5) ? 'roadCrate' : null;
        // A wide crossing event gets a completely clear approach; a shifting Tata uses two lanes at most.
        const canSpawnEvent = event === 'rearCar' ? !occupiedLanes.has(g.lane)
          : event === 'sideEntryBoth' || event === 'tataTruck' ? occupiedLanes.size === 0
          : event === 'corsaTruck' ? occupiedLanes.size === 0
            : event?.startsWith('sideEntry') ? occupiedLanes.size < 2
            : occupiedLanes.size < 2;
        if (openLanes.length && canSpawnEvent) {
          const ramp = Math.min(1, Math.max((g.distance || 0) / 180, (g.bags || 0) / g.level.goal));
          const isStunt = event === 'stuntBike';
          const isSideEntry = event?.startsWith('sideEntry');
          const isRearCar = event === 'rearCar';
          const type = event === 'tataTruck' || event === 'corsaTruck' || event === 'roadCrate' ? event
            : isRearCar ? 'car' : isStunt ? 'bike' : isSideEntry ? ['car', 'microbus', 'tuktuk'][Math.floor(Math.random() * 3)] : TRAFFIC_TYPES[Math.floor(Math.random() * TRAFFIC_TYPES.length)];
          const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
          const group = type === 'roadCrate' ? makeRoadCrate() : CHALLENGE_VEHICLE_TYPES.includes(type)
            ? (type === 'tataTruck' || type === 'corsaTruck' ? createEventVehicle(type) : createVehicle(type, ROUTES[Math.floor(Math.random() * ROUTES.length)]))
            : createVehicle(type);
          if (TRAFFIC_TYPES.includes(type)) group.scale.setScalar({ car: .96, microbus: .92, tuktuk: .96, bike: .96 }[type]);
          const item = { group, type, lane, direction: 1, checked: false, initial: false, stunt: isStunt, sideEntry: isSideEntry };
          if (type === 'tataTruck') {
            item.sourceLane = lane;
            item.targetLane = lane === 0 ? 1 : lane === 2 ? 1 : (Math.random() < .5 ? 0 : 2);
            item.group.position.set(LANES[lane], ROAD_SURFACE_Y, -58);
            g.tataSpawned = true;
          } else if (type === 'corsaTruck') {
            item.crossing = true;
            const openCrossingLanes = [0, 2, 1].filter((candidate) => !occupiedLanes.has(candidate));
            const targetLane = openCrossingLanes[0] ?? lane;
            item.targetX = LANES[targetLane] + (targetLane === 2 ? 2 : -2);
            item.group.rotation.y = item.targetX > item.group.position.x ? Math.PI / 2 : -Math.PI / 2;
            item.group.position.set(item.targetX > 0 ? -8.8 : 8.8, ROAD_SURFACE_Y, -48);
            item.entryRoad = createSideStreetEntry(item.group.position.x < 0 ? -1 : 1, -48);
            scene.add(item.entryRoad); if (world) patchBend(item.entryRoad);
            item.crossSpeed = (item.targetX - item.group.position.x) / ((runner.position.z - item.group.position.z) / (challengeSpeed * 1.32));
            item.crossSpeedBase = challengeSpeed;
            g.corsaSpawned = true;
          } else if (isSideEntry) {
            const fromRight = event === 'sideEntryRight' || (event === 'sideEntryBoth' && Math.random() < .5);
            const startX = fromRight ? 8.8 : -8.8;
            item.targetX = LANES[lane];
            item.group.position.set(startX, ROAD_SURFACE_Y, -54);
            item.entryRoad = createSideStreetEntry(fromRight ? 1 : -1, -54);
            scene.add(item.entryRoad); if (world) patchBend(item.entryRoad);
            item.crossSpeed = (item.targetX - startX) / ((runner.position.z + 54) / (challengeSpeed * 1.32));
            item.crossSpeedBase = challengeSpeed;
            item.group.rotation.y = Math.atan2(item.crossSpeed, challengeSpeed * 1.32);
            if (event === 'sideEntryRight') g.rightEntrySpawned = true;
            else if (event === 'sideEntryLeft') g.leftEntrySpawned = true;
            else {
              g.bothEntrySpawned = true;
              const otherLane = openLanes.find((candidate) => candidate !== lane);
              if (otherLane != null) {
                const otherType = ['car', 'microbus', 'tuktuk'][Math.floor(Math.random() * 3)];
                const otherGroup = createVehicle(otherType, ROUTES[Math.floor(Math.random() * ROUTES.length)]);
                otherGroup.scale.setScalar({ car: .96, microbus: .92, tuktuk: .96 }[otherType]);
                const otherFromRight = !fromRight, otherStartX = otherFromRight ? 8.8 : -8.8, otherStartZ = -66;
                const otherSpeed = (LANES[otherLane] - otherStartX) / ((runner.position.z - otherStartZ) / (challengeSpeed * 1.32));
                otherGroup.position.set(otherStartX, ROAD_SURFACE_Y, otherStartZ);
                otherGroup.rotation.y = Math.atan2(otherSpeed, challengeSpeed * 1.32);
                const otherRoad = createSideStreetEntry(otherFromRight ? 1 : -1, otherStartZ);
                scene.add(otherRoad); if (world) patchBend(otherRoad);
                scene.add(otherGroup); if (world) patchBend(otherGroup);
                obstacles.push({ group: otherGroup, entryRoad: otherRoad, type: otherType, lane: otherLane, direction: 1, checked: false, initial: false, sideEntry: true, targetX: LANES[otherLane], crossSpeed: otherSpeed, crossSpeedBase: challengeSpeed });
              }
            }
          } else if (isRearCar) {
            // A faster car closes in from behind without a warning prompt.
            const rearLane = g.lane;
            item.lane = rearLane;
            item.direction = -1;
            item.rearApproach = true;
            item.group.rotation.y = Math.PI;
            item.group.position.set(LANES[rearLane], ROAD_SURFACE_Y, runner.position.z + 36);
            g.rearCarSpawned = true;
          } else if (type === 'roadCrate') {
            item.group.position.set(LANES[lane], ROAD_SURFACE_Y, -48);
            const crateSpacing = Math.max(54, 82 - (g.level.speed - LEVELS[0].speed) * 6);
            g.nextCrateAt = g.distance + crateSpacing;
          } else {
            item.group.position.set(LANES[lane], ROAD_SURFACE_Y, -54);
            if (isStunt) {
              item.group.rotation.x = -.27; g.stuntSpawned = true;
            }
          }
          scene.add(group); if (world) patchBend(group);
          obstacles.push(item);
          const levelBias = (g.level.speed - LEVELS[0].speed) * .12;
          g.trafficSpawn = event ? 1.7 + Math.random() * .25 : Math.max(1.8, 3.5 - ramp * 1.25 - levelBias) + Math.random() * .35;
        } else g.trafficSpawn = .25;
      }
      g.jump = Math.max(0, g.jump - dt); g.slide = Math.max(0, g.slide - dt);
      if (g.exploring) {
        g.freeX = THREE.MathUtils.clamp((g.freeX || 0) + (g.hitPause > 0 ? 0 : (g.mvx || 0) * dt), -8.1, 8.1);
        g.currentX = THREE.MathUtils.damp(g.currentX || 0, g.freeX, 9, dt);
      } else g.currentX = THREE.MathUtils.damp(g.currentX || 0, LANES[g.lane], 12, dt);
      runner.position.x = g.currentX; runner.position.z = 2.3 + (g.exploring ? g.zoff || 0 : 0);
      const jumping = g.jump > 0; const sliding = g.slide > 0;
      const twist = runner.userData.twist, crashed = !!twist && g.hitPause > 0;
      runner.position.y = crashed ? 0 : jumping ? Math.sin((1 - g.jump / .68) * Math.PI) * 1.25 : sliding && !twist ? -.08 : 0;
      runner.scale.y = sliding && !twist ? .9 : 1;
      if (runner.userData.walkerModel) runner.userData.walkerModel.rotation.x = THREE.MathUtils.damp(runner.userData.walkerModel.rotation.x, sliding ? -.82 : 0, 10, dt);
      if (runner.userData.deliveryBag) { runner.userData.deliveryBag.position.y = THREE.MathUtils.damp(runner.userData.deliveryBag.position.y, sliding ? 1.12 : 1.3, 10, dt); runner.userData.deliveryBag.rotation.x = THREE.MathUtils.damp(runner.userData.deliveryBag.rotation.x, sliding ? -.82 : 0, 10, dt); }
      // Before the run starts, an idle courier turns to follow the mouse / finger with his body and head.
      const lookOn = !!twist && g.exploring && !g.moving && !crashed && !!g.pointer && !document.pointerLockElement;
      const sideDx = (g.exploring ? (g.freeX || 0) : LANES[g.lane]) - runner.position.x; // <0: moving to his left, >0: to his right
      if (twist) twist.update(dt, { side: g.exploring ? 0 : Math.abs(sideDx) > .25 ? Math.sign(sideDx) : 0, paused: g.paused, hitT: crashed ? 1 - g.hitPause / twist.hitTime : null, jumpT: jumping ? 1 - g.jump / .68 : null, slideT: sliding ? 1 - g.slide / .92 : null, walk: g.exploring && !!g.moving && !g.sprinting, idle: g.exploring && !g.moving, speed: challengeSpeed, look: lookOn ? g.pointer : null });
      else if (runner.userData.mixer) runner.userData.mixer.update(dt * 1.55);
      else if (runner.userData.animate) runner.userData.animate(g.time * 13, .85, jumping, sliding);
      else animateLimb(runner.userData.limbs, g.time * 13, sliding ? .12 : jumping ? .25 : .82);
      runner.rotation.x = THREE.MathUtils.damp(runner.rotation.x, g.hitPause > 0 && !twist ? .18 : 0, 8, dt);
      { const ty = g.exploring ? g.heading || 0 : 0, dy = Math.atan2(Math.sin(ty - runner.rotation.y), Math.cos(ty - runner.rotation.y)); runner.rotation.y += dy * (1 - Math.exp(-(g.moving ? 10 : 6) * dt)); }
      const targetLean = g.exploring ? 0 : (LANES[g.lane] - runner.position.x) * -.08;
      runner.rotation.z = THREE.MathUtils.damp(runner.rotation.z, targetLean, 6, dt);
      let closestTrafficDistance = Infinity, closestTrafficX = 0;
      for (const item of obstacles) {
        if (g.exploring && !TRAFFIC_TYPES.includes(item.type)) continue;
        // Oncoming traffic closes the distance faster than road-bound
        // pickups/barriers. Previously the slower vehicles were overtaken by
        // scenery, making bags and barriers appear to sit on top of them.
        const isVehicle = CHALLENGE_VEHICLE_TYPES.includes(item.type);
        const previousZ = item.group.position.z;
        const approachSpeed = isVehicle ? 1.32 : item.type === 'pedestrian' ? 1.05 : 1;
        if (item.rearApproach) {
          const brakeLine = runner.position.z + 1.5;
          if (!item.rearStopped) {
            const nextZ = item.group.position.z + worldSpeed * dt * approachSpeed * item.direction;
            item.group.position.z = Math.max(brakeLine, nextZ);
            if (nextZ <= brakeLine) { item.rearStopped = true; item.rearStoppedAt = g.time; }
          } else if (g.time - item.rearStoppedAt > .8) {
            item.group.position.z += worldSpeed * dt * .82;
          }
        } else item.group.position.z += worldSpeed * dt * approachSpeed * (item.direction || 1);
        if (item.entryRoad) item.entryRoad.position.z += worldSpeed * dt * approachSpeed * (item.direction || 1);
        if (isVehicle) {
          const crossSpeed = item.crossSpeed * challengeSpeed / (item.crossSpeedBase || challengeSpeed);
          if (item.stunt) item.group.rotation.x = -.27 + Math.sin(g.time * 5) * .035;
          if (item.type === 'tataTruck' && item.targetLane != null) {
            const t = THREE.MathUtils.clamp((item.group.position.z + 38) / 24, 0, 1), eased = t * t * (3 - 2 * t);
            item.group.position.x = THREE.MathUtils.lerp(LANES[item.sourceLane], LANES[item.targetLane], eased);
            item.lane = t < .5 ? item.sourceLane : item.targetLane;
          }
          if (item.sideEntry) {
            const remaining = item.targetX - item.group.position.x, step = crossSpeed * dt * (worldSpeed > 0 ? 1 : 0);
            item.group.position.x = remaining * step <= 0 ? item.targetX : item.group.position.x + step;
            item.group.rotation.y = THREE.MathUtils.damp(item.group.rotation.y, 0, 2.8, dt);
          }
          if (item.rearApproach) {
            item.group.position.x = LANES[item.lane];
            item.group.rotation.y = Math.PI;
          }
          if (item.crossing) {
            const endX = item.targetX + Math.sign(item.crossSpeed) * 4.5;
            const crossingStep = crossSpeed * dt * (worldSpeed > 0 ? 1 : 0);
            item.group.position.x = item.crossSpeed > 0 ? Math.min(endX, item.group.position.x + crossingStep) : Math.max(endX, item.group.position.x + crossingStep);
          }
          const distance = Math.hypot(item.group.position.x - runner.position.x, item.group.position.z - runner.position.z);
          if (distance < closestTrafficDistance) { closestTrafficDistance = distance; closestTrafficX = item.group.position.x - runner.position.x; }
          if (distance < 10 && g.trafficAudio && g.time >= (g.nextTrafficHornAt || 0) && g.trafficAudio.honk()) {
            item.headlightFlashUntil = g.time + .72;
            g.nextTrafficHornAt = g.time + 20 + Math.random() * 14;
          }
          const flash = item.headlightFlashUntil > g.time;
          const pulse = flash && Math.floor((g.time - (item.headlightFlashUntil - .72)) * 12) % 2 === 0;
          for (const light of item.group.userData.trafficLights || []) {
            light.intensity = g.nightMode ? (pulse ? 30 : 20) : (pulse ? 3.5 : 0);
          }
        }
        // Before the run starts the street is alive: traffic keeps driving toward the player (same speed per lane so cars never overlap).
        if ((g.exploring && active || g.running) && item.initial && isVehicle) {
          if (item.hold > 0) item.hold -= dt; else item.group.position.z += (item.direction || 1) * (item.lane === 0 ? 5.5 : 7) * dt;
          if ((item.direction || 1) > 0 && item.group.position.z > 12) { item.group.position.z -= 112; item.checked = false; item.tukPhraseHandled = false; }
          else if ((item.direction || 1) < 0 && item.group.position.z < -100) { item.group.position.z = -8; item.checked = false; item.tukPhraseHandled = false; }
        }
        if (g.exploring && active && isVehicle && !item.initial) {
          if (item.hold > 0) item.hold -= dt; else item.group.position.z += (item.direction || 1) * (item.lane === 0 ? 5.5 : 7) * dt;
          if ((item.direction || 1) > 0 && item.group.position.z > 12) { item.group.position.z -= 112; item.checked = false; item.tukPhraseHandled = false; }
          else if ((item.direction || 1) < 0 && item.group.position.z < -100) { item.group.position.z = -8; item.checked = false; item.tukPhraseHandled = false; }
        }
        const crossedPlayer = previousZ <= runner.position.z && item.group.position.z > runner.position.z;
        if (item.type === 'tuktuk' && crossedPlayer && !item.tukPhraseHandled) {
          item.tukPhraseHandled = true;
          const canSpeak = Math.abs(item.group.position.x - runner.position.x) > .72
            && Math.random() < .38 && g.time - (g.lastTukPhraseAt ?? -20) > 9;
          if (canSpeak) {
            g.lastTukPhraseAt = g.time; g.tukMessageUntil = g.time + 3.1;
            const text = TUKTUK_LINES[Math.floor(Math.random() * TUKTUK_LINES.length)];
            g.onHud?.((old) => ({ ...old, tukMessage: { text, id: Math.round(g.time * 1000) } }));
          }
        }
        const actualLane = item.type === 'pedestrian' ? LANES.reduce((best, x, index) => Math.abs(x - item.group.position.x) < Math.abs(LANES[best] - item.group.position.x) ? index : best, 0) : item.lane;
        const bounds = item.group.userData.trafficBounds, rotatedCrossing = item.type === 'corsaTruck';
        const bagPickup = item.type === 'bag' ? item.group.userData.collectRadius : null;
        const halfDepth = bagPickup?.z ?? (bounds ? (rotatedCrossing ? bounds.halfWidth : bounds.halfDepth) * item.group.scale.z : ({ car: 1.72, microbus: 1.9, tuktuk: 1.2, bike: 1.0, roadCrate: .42 }[item.type] || .4));
        const halfWidth = bagPickup?.x ?? (bounds ? (rotatedCrossing ? bounds.halfDepth : bounds.halfWidth) * item.group.scale.x : ({ car: .86, microbus: .9, tuktuk: .68, bike: .62, roadCrate: .5 }[item.type] || .4));
        const overlapsRunner = Math.abs(item.group.position.z - runner.position.z) < halfDepth + (bagPickup ? 0 : .35)
          && Math.abs(item.group.position.x - runner.position.x) < halfWidth + (bagPickup ? 0 : .28);
        if (g.exploring && isVehicle && !item.checked && !(g.hitPause > 0) && overlapsRunner) {
          // Walked into traffic (or it reached him): he is knocked down, the car brakes, then he gets back up.
          item.checked = true; g.hitPause = runner.userData.twist ? runner.userData.twist.hitTime : .42; item.hold = g.hitPause;
          g.freeX = THREE.MathUtils.clamp((g.freeX || 0) + (item.group.position.x <= runner.position.x ? 2.2 : -2.2), -8.1, 8.1);
        }
        if (g.running && !item.initial && !item.checked && overlapsRunner && (item.type === 'bag' || item.type === 'tataTruck' || rotatedCrossing || actualLane === g.lane)) {
          item.checked = true;
          if (item.type === 'bag') { g.bags += 1; item.group.visible = false; }
          else if (g.hitPause > 0) { /* Brief collision recovery prevents stacked hazards from taking multiple hits. */ }
          else if (item.type === 'roadCrate' && runner.position.y > .68) { item.group.visible = false; }
          else if (item.type === 'roadCrate') {
            g.hits += 1; g.hitPause = runner.userData.twist ? runner.userData.twist.hitTime : .42;
            if (!runner.userData.twist) runner.rotation.x = .18;
          }
          else if (item.type === 'tataTruck' && sliding) { /* Slide beneath the real cargo truck. */ }
          else {
            if (item.rearApproach) { item.rearStopped = true; item.rearStoppedAt = g.time; }
            g.hits += 1; g.hitPause = runner.userData.twist ? runner.userData.twist.hitTime : .42;
            const shove = item.group.position.x <= runner.position.x ? 1 : -1;
            g.lane = THREE.MathUtils.clamp(g.lane + shove, 0, LANES.length - 1);
            if (!runner.userData.twist) runner.rotation.x = .18;
          }
        }
        if (item.type === 'bag') { item.group.rotation.y += dt * 1.7; item.group.position.y = .62 + Math.sin(g.time * 2.7 + item.group.position.z) * .08; }
        if (item.type === 'pedestrian') {
          item.group.position.x += dt * (item.group.position.x < 0 ? .45 : -.45);
          animateLimb(item.group.userData.limbs, g.time * 7, .48);
        }
      }
      const statue = (g.exploring || g.running) ? world?.getSaadStatueObstacle?.() : null;
      const statueHalfWidth = statue ? (g.running ? Math.min(statue.halfWidth, 1.6) : statue.halfWidth) : 0;
      const statueDX = statue ? (runner.position.x - statue.x) / (statueHalfWidth + .28) : Infinity;
      const statueDZ = statue ? (runner.position.z - statue.z) / (statue.halfDepth + .36) : Infinity;
      const touchingStatueIsland = statue && statueDX * statueDX + statueDZ * statueDZ < 1;
      if (!touchingStatueIsland) g.saadStatueContact = false;
      else if (active && !g.saadStatueContact && !(g.hitPause > 0)) {
        // The monument/island is static world geometry, so register its hit
        // separately from the streamed traffic obstacles above.
        g.saadStatueContact = true;
        g.hitPause = runner.userData.twist ? runner.userData.twist.hitTime : .42;
        if (g.running) {
          g.hits += 1;
          g.lane = runner.position.x <= statue.x ? 0 : LANES.length - 1;
        } else {
          g.freeX = THREE.MathUtils.clamp((g.freeX || 0) + (runner.position.x <= statue.x ? -2.4 : 2.4), -8.1, 8.1);
          if (g.mv) { g.mv.x = 0; g.mv.z = 0; }
        }
      }
      g.trafficAudio?.update(closestTrafficDistance, closestTrafficX);
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const item = obstacles[i], z = item.group.position.z;
        const passed = item.rearApproach ? z > runner.position.z + 24 : (item.direction || 1) > 0 ? z > 10 : z < -88;
        if (g.exploring || (g.running && item.initial) || !passed) continue;
        const group = item.group; scene.remove(group);
        if (item.entryRoad) { scene.remove(item.entryRoad); item.entryRoad.traverse((object) => { object.geometry?.dispose(); if (object.material && !Array.isArray(object.material)) object.material.dispose(); }); }
        for (const material of group.userData.ownedMaterials || []) material.dispose();
        obstacles.splice(i, 1);
      }
      const routeFinish = routeLength;
      if (g.running && g.hits >= 3) { g.running = false; g.failed = true; }
      else if (g.running && g.bags >= g.level.goal && g.distance >= routeFinish) { g.running = false; g.complete = true; }
      if (monument && monument.visible && !g.stationIslandHit && monument.position.z > 1.05 && monument.position.z < 2.2) g.stationIslandHit = true;
    } else {
      g.trafficAudio?.update(Infinity, 0);
      runner.position.x = Math.sin(g.time * .8) * .18;
      if (runner.userData.twist) runner.userData.twist.update(dt, { paused: g.paused, down: g.failed, idle: true });
      else if (runner.userData.mixer) runner.userData.mixer.update(dt * (g.paused ? 0 : .7));
      else if (runner.userData.animate) runner.userData.animate(g.time * 5, .3);
      else animateLimb(runner.userData.limbs, g.time * 4, .35);
      if (!g.paused) for (const item of obstacles) { item.group.position.z += dt * .28; if (item.group.position.z > 9) item.group.position.z = -55; }
    }
    camera.position.x = THREE.MathUtils.damp(camera.position.x, runner.position.x * (g.exploring ? .68 : .22), 2.5, dt);
    if (g.exploring) cameraTarget.x = THREE.MathUtils.damp(cameraTarget.x, runner.position.x * .5, 2.5, dt);
    else cameraTarget.x = THREE.MathUtils.damp(cameraTarget.x, 0, 2.5, dt);
    // Free-look while exploring: drag / wheel / Q-E orbit the camera around the courier (double-click or R resets).
    {
      const cm = g.cam || (g.cam = { yaw: 0, pitch: .37, dist: 6.9, w: 0, on: false });
      if (g.exploring && g.camKey) { cm.on = true; cm.yaw = THREE.MathUtils.clamp(cm.yaw + g.camKey * 1.3 * dt, -2.6, 2.6); }
      cm.w = THREE.MathUtils.damp(cm.w, g.exploring && cm.on ? 1 : 0, 4, dt);
      if (!cm.on && cm.w < .02) { cm.yaw = 0; cm.pitch = .37; cm.dist = 6.9; }
      camera.position.z = THREE.MathUtils.damp(camera.position.z, world ? 11.2 : 11.6, 4, dt);
      if (!(g.running && !g.paused)) camera.position.y = THREE.MathUtils.damp(camera.position.y, world ? 4.35 : 5.2, 4, dt);
      const tgt = cameraTarget.clone();
      if (cm.w > .001) {
        const px = runner.position.x, pz = runner.position.z, cp = Math.cos(cm.pitch);
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, px + Math.sin(cm.yaw) * cp * cm.dist, cm.w);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.4 + Math.sin(cm.pitch) * cm.dist, cm.w);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, pz + Math.cos(cm.yaw) * cp * cm.dist, cm.w);
        tgt.lerp(new THREE.Vector3(px, 1.35, pz - .3), cm.w);
      }
      camera.lookAt(tgt);
    }
    if (world) { camera.rotateZ(-world.curve * 24); if (g.running && !g.paused) camera.position.y = 4.35 + Math.sin(g.time * 13) * .035; }
    if (rearView) {
      const rearVisible = g.running && obstacles.some((item) => item.rearApproach && item.group.position.z > runner.position.z - 5 && item.group.position.z < runner.position.z + 48);
      rearView.group.visible = !!rearVisible;
      if (rearVisible) {
        rearView.camera.position.set(runner.position.x, 1.55, runner.position.z + .08);
        rearView.camera.lookAt(runner.position.x, 1.3, runner.position.z + 42);
        renderer.setRenderTarget(rearView.target); renderer.clear(); renderer.render(scene, rearView.camera); renderer.setRenderTarget(null);
      }
    }
    if (post) post.render(clock.elapsedTime); else renderer.render(scene, camera);
    if (clock.elapsedTime - hudTime > .12) {
      g.onHud?.((old) => ({
        ...old,
        bags: Math.min(g.bags, g.level.goal), hits: g.hits, running: g.running,
        exploring: g.exploring, paused: g.paused, complete: g.complete, failed: g.failed,
        location: g.locationUntil > g.time ? g.location : null,
        tukMessage: g.tukMessageUntil > g.time ? old.tukMessage : null,
      }));
      hudTime = clock.elapsedTime;
    }
  };
  tick();
  return () => {
    disposed = true; clearTimeout(loadTimer); clearTimeout(loadReportTimer); clearTimeout(variantLoadTimer); cancelAnimationFrame(raf); observer.disconnect(); world?.dispose(); post?.dispose();
    if (gameRef.current.resetRoute === resetRoute) delete gameRef.current.resetRoute;
    if (rearView) {
      camera.remove(rearView.group); scene.remove(camera); scene.remove(rearView.camera);
      rearView.frame.geometry.dispose(); rearView.frame.material.dispose();
      rearView.screen.geometry.dispose(); rearView.screen.material.dispose(); rearView.target.dispose();
    }
    if (streetEnv) { scene.environment = null; streetEnv.dispose(); }
    scene.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) { material.map?.dispose(); material.dispose(); }
    });
    renderer.dispose();
  };
}

export default function BanhaRunner() {
  const canvasRef = useRef(null);
  const musicRef = useRef(null);
  const trafficAudioRef = useRef(null);
  const trafficSoundsEnabledRef = useRef(true);
  const musicEnabledRef = useRef(true);
  const gameRef = useRef({ running: false, exploring: true, paused: false, lane: 1, freeX: 0, currentX: 0, jump: 0, slide: 0, time: 0, bags: 0, hits: 0, spawn: .6, level: LEVELS[1], complete: false, failed: false, nightMode: true });
  const [levelId, setLevelId] = useState('normal');
  const [hud, setHud] = useState({ bags: 0, hits: 0, running: false, exploring: true, paused: false, complete: false, failed: false });
  const [loadPct, setLoadPct] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [trafficSoundsEnabled, setTrafficSoundsEnabled] = useState(true);
  const [nightMode, setNightMode] = useState(true);
  const area = AREAS.find((x) => x.id === 'villas'), level = LEVELS.find((x) => x.id === levelId) || LEVELS[1];
  const { data: marketplace } = useApi('/marketplace?q=&category=all&sort=featured');
  const [cachedStoreNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem('twist-banha-store-names') || '[]'); } catch { return []; }
  });
  const storeNames = useMemo(() => [...new Set((marketplace?.stores || []).map((store) => store.name?.ar || store.name?.en || '').filter(Boolean))], [marketplace]);
  useEffect(() => { if (storeNames.length) { try { localStorage.setItem('twist-banha-store-names', JSON.stringify(storeNames)); } catch { /* storage is optional */ } } }, [storeNames]);
  // Logo + colour of every partner store, so the opening street shows each shop's real branding.
  const storeBrands = useMemo(() => Object.fromEntries((marketplace?.stores || []).map((st) => {
    const name = st.name?.ar || st.name?.en || '';
    const color = st.logoColor && st.logoColor.toLowerCase() !== '#1b1b1b' ? st.logoColor : (st.logo?.color || null);
    return [name, { logo: st.logo?.base ? `${st.logo.base}/original.jpg` : null, color, initials: st.logoInitials || '', departments: st.departments || [] }];
  }).filter(([name]) => name)), [marketplace]);
  const storefrontNames = storeNames.length ? storeNames : (cachedStoreNames.length ? cachedStoreNames : ACTIVE_BANHA_STORE_FALLBACK);

  const unlockTrafficAudio = useCallback(() => {
    try {
      if (!trafficAudioRef.current) trafficAudioRef.current = createTrafficAudio();
      const audio = trafficAudioRef.current;
      if (audio) {
        audio.setEnabled(trafficSoundsEnabledRef.current);
        gameRef.current.trafficAudio = audio;
        void audio.resume();
      }
    } catch { /* Traffic sound is optional when a browser has no Web Audio support. */ }
  }, []);

  const playMusic = useCallback(() => {
    // Keyboard events also reach this handler while the game is paused (notably
    // Escape). Never let a pending/repeated play request undo the pause.
    if (!musicEnabledRef.current || gameRef.current.paused) return;
    const audio = musicRef.current || (musicRef.current = new Audio('/runner/audio/banha-alasal.mp3'));
    audio.loop = true; audio.volume = .28;
    audio.play().catch(() => { /* The browser may wait for the next user gesture before allowing audio. */ });
  }, []);
  const toggleMusic = useCallback(() => {
    if (musicEnabledRef.current) {
      musicEnabledRef.current = false; musicRef.current?.pause(); setMusicEnabled(false);
    } else {
      musicEnabledRef.current = true; setMusicEnabled(true); playMusic();
    }
  }, [playMusic]);
  useEffect(() => () => {
    if (musicRef.current) { musicRef.current.pause(); musicRef.current.currentTime = 0; musicRef.current = null; }
    trafficAudioRef.current?.dispose(); trafficAudioRef.current = null;
  }, []);
  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    if (hud.paused || (!hud.running && !hud.exploring)) audio.pause();
    else if (musicEnabledRef.current && audio.paused && (hud.running || hud.exploring)) playMusic();
  }, [hud.paused, hud.running, hud.exploring, playMusic]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    gameRef.current.onHud = setHud; gameRef.current.onLoad = setLoadPct; setLoadPct(0);
    let disposed = false, cleanup;
    try { cleanup = createScene(canvas, area, gameRef, storefrontNames, storeBrands); }
    catch (error) { console.error('Banha 3D scene could not start:', error); setHud((old) => ({ ...old, sceneError: true, sceneErrorMessage: error?.message || 'unknown' })); }
    return () => { disposed = true; cleanup?.(); };
  }, [area, storefrontNames, storeBrands]);
  const start = useCallback(() => {
    unlockTrafficAudio();
    playMusic();
    try { document.exitPointerLock?.(); } catch { /* ignore */ }
    const g = gameRef.current; g.trafficAudio?.resetHonkCooldown?.(); g.resetRoute?.(); Object.assign(g, { running: true, exploring: false, paused: false, lane: 1, currentX: 0, jump: 0, slide: 0, hitPause: 0, time: 0, distance: 0, nextStop: 0, nextCrateAt: level.speed * 4.5, location: null, locationUntil: 0, tukMessageUntil: 0, lastTukPhraseAt: -20, nextTrafficHornAt: 0, bags: 0, hits: 0, spawn: .45, trafficSpawn: 1.5, stuntSpawned: false, tataSpawned: false, rightEntrySpawned: false, leftEntrySpawned: false, bothEntrySpawned: false, corsaSpawned: false, rearCarSpawned: false, level, complete: false, failed: false, stationIslandHit: true, resetChallenge: true });
    setHud({ bags: 0, hits: 0, running: true, exploring: false, paused: false, complete: false, failed: false, location: null });
  }, [level, playMusic, unlockTrafficAudio]);
  const act = useCallback((action) => {
    const g = gameRef.current; if ((!g.running && !g.exploring) || g.paused) return;
    unlockTrafficAudio();
    playMusic();
    if (g.exploring) {
      if (action === 'left') g.freeX = THREE.MathUtils.clamp((g.freeX || 0) - 1.1, -8.1, 8.1);
      if (action === 'right') g.freeX = THREE.MathUtils.clamp((g.freeX || 0) + 1.1, -8.1, 8.1);
      if (action === 'forward') g.walkForward = true;
      if (action === 'back') g.walkForward = false;
      if (action === 'jump' && g.jump <= 0 && g.slide <= 0) g.jump = .68;
      if (action === 'slide' && g.jump <= 0 && g.slide <= 0) g.slide = .92;
      return;
    }
    if (action === 'left') g.lane = Math.max(0, g.lane - 1);
    if (action === 'right') g.lane = Math.min(2, g.lane + 1);
    if (action === 'jump' && g.jump <= 0 && g.slide <= 0) g.jump = .68;
    if (action === 'slide' && g.jump <= 0 && g.slide <= 0) g.slide = .92;
  }, [playMusic, unlockTrafficAudio]);
  const toggleTrafficSounds = useCallback(() => {
    trafficSoundsEnabledRef.current = !trafficSoundsEnabledRef.current;
    setTrafficSoundsEnabled(trafficSoundsEnabledRef.current);
    unlockTrafficAudio();
    trafficAudioRef.current?.setEnabled(trafficSoundsEnabledRef.current);
  }, [unlockTrafficAudio]);
  const toggleNightMode = useCallback(() => {
    setNightMode((current) => {
      const next = !current;
      gameRef.current.nightMode = next;
      return next;
    });
  }, []);
  const togglePause = () => {
    gameRef.current.paused = !gameRef.current.paused;
    if (gameRef.current.paused) musicRef.current?.pause();
    else if (musicEnabledRef.current) playMusic();
    setHud((x) => ({ ...x, paused: gameRef.current.paused }));
  };
  const toggleFullscreen = async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { /* Embedded previews can block fullscreen. */ }
  };
  useEffect(() => {
    const onMove = (e) => { const g = gameRef.current, c = canvasRef.current, r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }; g.pointer = { x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1)), y: Math.max(-1, Math.min(1, -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1))) }; };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      const g = gameRef.current;
      // Escape pauses the game; don't start music for the key that pauses it.
      if ((g.running || g.exploring) && !g.paused && e.key !== 'Escape') { unlockTrafficAudio(); playMusic(); }
      if (g.exploring) {
        const k = g.k || (g.k = {});
        if (['ArrowLeft', 'KeyA'].includes(e.code)) { e.preventDefault(); k.l = true; }
        if (['ArrowRight', 'KeyD'].includes(e.code)) { e.preventDefault(); k.r = true; }
        if (['ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); k.f = true; }
        if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); k.b = true; }
        if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') k.sprint = true;
        if (e.key === 'Escape') { g.walkForward = false; g.k = {}; }
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) act('jump'); }
        if (e.code === 'KeyC' || e.code === 'ControlLeft') { if (!e.repeat) act('slide'); }
        return;
      }
      const keyMap = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide' };
      const codeMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', Space: 'jump', ArrowDown: 'slide', KeyS: 'slide' };
      const mapped = keyMap[e.key] || codeMap[e.code];
      if (mapped) { e.preventDefault(); act(mapped); }
      if (e.key === 'Escape' && gameRef.current.running) togglePause();
    };
    const onKeyUp = (e) => {
      const g = gameRef.current;
      const k = g.k || (g.k = {});
      if (['ArrowLeft', 'KeyA'].includes(e.code)) { g.moveLeft = false; k.l = false; }
      if (['ArrowRight', 'KeyD'].includes(e.code)) { g.moveRight = false; k.r = false; }
      if (['ArrowUp', 'KeyW'].includes(e.code)) { g.walkForward = false; k.f = false; }
      if (['ArrowDown', 'KeyS'].includes(e.code)) k.b = false;
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') k.sprint = false;
    };
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); document.addEventListener('fullscreenchange', onFullscreen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); document.removeEventListener('fullscreenchange', onFullscreen); };
  }, [act, playMusic, unlockTrafficAudio]);
  useEffect(() => {
    const cam = () => { const g = gameRef.current; return g.cam || (g.cam = { yaw: 0, pitch: .37, dist: 6.9, w: 0, on: false }); };
    const clamp = THREE.MathUtils.clamp;
    let drag = null;
    const ignore = (t) => !!(t && t.closest && t.closest('button,a,section,input,select,textarea'));
    const down = (e) => { if (e.pointerType !== 'mouse' || !gameRef.current.exploring || ignore(e.target)) return; if (e.button === 0) { try { const r = canvasRef.current?.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch { /* pointer lock is optional */ } } if (e.button === 2) drag = { x: e.clientX, y: e.clientY }; };
    const move = (e) => { if (document.pointerLockElement && gameRef.current.exploring) { const c = cam(); c.on = true; c.yaw = clamp(c.yaw - e.movementX * .0035, -2.6, 2.6); c.pitch = clamp(c.pitch + e.movementY * .0035, .05, 1.1); return; } if (!drag) return; const c = cam(); c.on = true; c.yaw = clamp(c.yaw - (e.clientX - drag.x) * .006, -2.6, 2.6); c.pitch = clamp(c.pitch + (e.clientY - drag.y) * .004, .05, 1.1); drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; };
    const blur = () => {
      const g = gameRef.current;
      g.k = {}; g.stick = null; g.walkForward = false; g.moveLeft = false; g.moveRight = false; g.camKey = 0;
      sId = null; sO = null; lId = null; lP = null; drag = null;
      stickEl.style.display = 'none'; knobEl.style.transform = 'translate(-50%,-50%)';
    };
    const onVisibilityChange = () => { if (document.hidden) blur(); };
    const wheel = (e) => { if (!gameRef.current.exploring || ignore(e.target)) return; e.preventDefault(); const c = cam(); c.on = true; c.dist = clamp(c.dist + e.deltaY * .01, 3.2, 16); };
    const dbl = (e) => { if (!ignore(e.target)) cam().on = false; };
    const kd = (e) => { const g = gameRef.current; if (!g.exploring) return; if (e.code === 'KeyQ') g.camKey = -1; if (e.code === 'KeyE') g.camKey = 1; if (e.code === 'KeyR') cam().on = false; };
    const ku = (e) => { if (e.code === 'KeyQ' || e.code === 'KeyE') gameRef.current.camKey = 0; };
    // Touch: left half = virtual joystick (walk, push far to run), right half = drag to look around.
    const stickEl = document.createElement('div'), knobEl = document.createElement('div');
    Object.assign(stickEl.style, { position: 'fixed', width: '110px', height: '110px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.55)', background: 'rgba(8,35,60,.35)', display: 'none', zIndex: '40', pointerEvents: 'none', transform: 'translate(-50%,-50%)' });
    Object.assign(knobEl.style, { position: 'absolute', left: '50%', top: '50%', width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(244,124,30,.92)', transform: 'translate(-50%,-50%)' });
    stickEl.appendChild(knobEl); document.body.appendChild(stickEl);
    let sId = null, sO = null, lId = null, lP = null;
    const tStart = (e) => {
      const g = gameRef.current; if (!g.exploring || ignore(e.target)) return;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth / 2 && sId == null) { sId = t.identifier; sO = { x: t.clientX, y: t.clientY }; stickEl.style.display = 'block'; stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; g.stick = { x: 0, y: 0 }; }
        else if (t.clientX >= window.innerWidth / 2 && lId == null) { lId = t.identifier; lP = { x: t.clientX, y: t.clientY }; }
      }
    };
    const tMove = (e) => {
      const g = gameRef.current; if (!g.exploring) return; let used = false;
      for (const t of e.changedTouches) {
        if (t.identifier === sId && sO) {
          let dx = (t.clientX - sO.x) / 50, dy = (sO.y - t.clientY) / 50; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
          g.stick = m < .12 ? { x: 0, y: 0 } : { x: dx, y: dy }; knobEl.style.transform = 'translate(calc(-50% + ' + dx * 40 + 'px), calc(-50% + ' + -dy * 40 + 'px))'; used = true;
        } else if (t.identifier === lId && lP) {
          const c = cam(); c.on = true; c.yaw = clamp(c.yaw - (t.clientX - lP.x) * .006, -2.6, 2.6); c.pitch = clamp(c.pitch + (t.clientY - lP.y) * .004, .05, 1.1); lP = { x: t.clientX, y: t.clientY }; used = true;
        }
      }
      if (used && e.cancelable) e.preventDefault();
    };
    const tEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sId) { sId = null; sO = null; stickEl.style.display = 'none'; knobEl.style.transform = 'translate(-50%,-50%)'; gameRef.current.stick = null; }
        if (t.identifier === lId) { lId = null; lP = null; }
      }
    };
    window.addEventListener('touchstart', tStart, { passive: true }); window.addEventListener('touchmove', tMove, { passive: false });
    window.addEventListener('touchend', tEnd, { passive: true }); window.addEventListener('touchcancel', tEnd, { passive: true });
    const ctx = (e) => { if (gameRef.current.exploring && !ignore(e.target)) e.preventDefault(); };
    window.addEventListener('contextmenu', ctx); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    window.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('dblclick', dbl); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => {
      stickEl.remove();
      window.removeEventListener('touchstart', tStart); window.removeEventListener('touchmove', tMove); window.removeEventListener('touchend', tEnd); window.removeEventListener('touchcancel', tEnd);
      window.removeEventListener('contextmenu', ctx); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('wheel', wheel); window.removeEventListener('dblclick', dbl); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    let sx = null, sy = null;
    const down = (e) => { sx = e.changedTouches[0].clientX; sy = e.changedTouches[0].clientY; };
    const up = (e) => {
      if (gameRef.current.exploring) { sx = null; sy = null; return; } // exploring: joystick + look-drag instead of swipes
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 25) act(dx < 0 ? 'left' : 'right');
      else if (Math.abs(dy) > 25) act(dy < 0 ? 'jump' : 'slide'); sx = null; sy = null;
    };
    canvas.addEventListener('touchstart', down, { passive: true }); canvas.addEventListener('touchend', up, { passive: true });
    return () => { canvas.removeEventListener('touchstart', down); canvas.removeEventListener('touchend', up); };
  }, [act]);

  const finished = hud.complete || hud.failed;
  const control = (action, Icon, label, hot = false) => <button type="button" aria-label={label} onPointerDown={(e) => { e.preventDefault(); act(action); }} onPointerUp={() => { if (action === 'forward') gameRef.current.walkForward = false; }} onPointerCancel={() => { if (action === 'forward') gameRef.current.walkForward = false; }} disabled={(!hud.running && !hud.exploring) || hud.paused} className={'grid h-[58px] w-[58px] touch-none place-items-center rounded-[21px] border shadow-[0_12px_32px_rgba(1,15,29,.4)] backdrop-blur-xl transition active:scale-90 disabled:opacity-35 sm:h-[68px] sm:w-[68px] ' + (hot ? 'border-[#FFAA5B]/40 bg-[#E9590A]/90 text-white' : 'border-white/25 bg-[#09243A]/78 text-white')}><Icon className="h-6 w-6" strokeWidth={2.7} /></button>;
  return (
    <main dir="rtl" className="fixed inset-0 isolate overflow-hidden bg-[#14212B] text-white" style={{ width: '100vw', height: '100dvh' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label={'لعبة جري في ' + area.name} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-[#06121F]/80 via-[#06121F]/25 to-transparent p-3 sm:p-5">
        <div className="pointer-events-auto flex items-center gap-2.5"><Link to="/" aria-label="العودة للسوق" className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl"><ArrowRight className="h-5 w-5" /></Link><div><p className="text-[10px] font-black tracking-[.16em] text-[#FF9A42]">TWIST • BANHA RUN</p><p className="mt-0.5 text-sm font-black sm:text-base">{area.name}</p></div></div>
        <div className="pointer-events-auto flex gap-2"><button type="button" onClick={toggleNightMode} aria-label={nightMode ? 'تشغيل الوضع النهاري' : 'تشغيل الوضع الليلي'} title={nightMode ? 'الوضع النهاري' : 'الوضع الليلي'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{nightMode ? <Sun className="h-5 w-5 text-amber-300" /> : <Moon className="h-5 w-5" />}</button><button type="button" onClick={toggleMusic} aria-label={musicEnabled ? 'كتم الموسيقى' : 'تشغيل الموسيقى'} title={musicEnabled ? 'كتم الموسيقى' : 'تشغيل الموسيقى'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{musicEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button><button type="button" onClick={toggleTrafficSounds} aria-label={trafficSoundsEnabled ? 'كتم صوت المرور' : 'تشغيل صوت المرور'} title={trafficSoundsEnabled ? 'كتم صوت المرور' : 'تشغيل صوت المرور'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{trafficSoundsEnabled ? <Car className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button><button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button>{hud.running && <button type="button" onClick={togglePause} aria-label={hud.paused ? 'استكمال' : 'إيقاف مؤقت'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{hud.paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}</button>}</div>
      </div>
      {hud.running && <div className="absolute left-1/2 top-[62px] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/20 bg-[#08233C]/75 px-4 py-2 shadow-xl backdrop-blur-xl sm:top-5"><span className="flex items-center gap-1.5 font-black text-[#FF9A42]"><ShoppingBag className="h-4 w-4" />{hud.bags}<span className="text-white/55">/ {level.goal}</span></span><span className="h-5 w-px bg-white/20" /><span className="text-xs font-bold text-white/85">خبطات {hud.hits}/3</span></div>}
      {hud.running && <div className="pointer-events-none absolute bottom-[88px] left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-[#08233C]/75 px-3 py-1.5 text-center text-[10px] font-bold text-white/85 shadow-lg backdrop-blur sm:bottom-24 sm:text-xs">← → تفادى <span className="mx-1 text-white/35">•</span> ↑ اقفز فوق الصندوق <span className="mx-1 text-white/35">•</span> ↓ انزلق تحت الشاحنة</div>}
      {hud.exploring && <div className="absolute left-1/2 top-[62px] flex -translate-x-1/2 flex-col items-center gap-2 rounded-2xl border border-white/20 bg-[#08233C]/90 px-4 py-3 text-center shadow-xl backdrop-blur-xl"><span className="text-xs font-black text-[#FFAA5B]">جولة حرة في سوق بنها</span><span className="text-[11px] text-white/75">لف على المحلات واتحرك براحتك</span><div className="flex items-center gap-1 rounded-xl bg-black/25 p-1">{LEVELS.map((x) => <button type="button" key={x.id} aria-pressed={levelId === x.id} onClick={() => setLevelId(x.id)} className={'rounded-lg px-3 py-1.5 text-[11px] font-black transition ' + (levelId === x.id ? 'bg-[#F8620A] text-white' : 'text-white/65 hover:bg-white/10')}>{x.label}</button>)}</div><span className="text-[10px] text-white/65">اجمع {level.goal} شنط • سرعة المرور بتعلى مع التقدم</span><button type="button" onClick={start} className="rounded-xl bg-[#F8620A] px-4 py-2 text-xs font-black shadow-lg">ابدأ تحدي Twist</button></div>}
      {hud.running && hud.location && <div key={hud.location.name} className="pointer-events-none absolute left-1/2 top-[118px] -translate-x-1/2 animate-[fade-in_0.25s_ease-out] rounded-2xl border border-[#FF9A42]/50 bg-[#08233C]/90 px-5 py-3 text-center shadow-[0_12px_40px_rgba(0,0,0,.38)] backdrop-blur-xl sm:top-[78px]"><p className="text-[10px] font-bold text-white/60">أنت الآن في</p><p className="mt-0.5 text-lg font-black text-[#FFAA5B]">{hud.location.name}</p><p className="text-[11px] text-white/70">{hud.location.detail}</p></div>}
      {hud.tukMessage && <div key={hud.tukMessage.id} className="pointer-events-none absolute left-1/2 top-[220px] z-10 -translate-x-1/2 animate-[fade-in_0.25s_ease-out] rounded-2xl border border-[#FFD277]/45 bg-[#172B35]/90 px-4 py-2.5 text-center shadow-[0_10px_32px_rgba(0,0,0,.35)] backdrop-blur-xl sm:top-[162px]"><p className="text-[10px] font-bold text-[#FFD277]/75">🛺 من التوك توك</p><p className="mt-0.5 whitespace-nowrap text-sm font-black text-white">{hud.tukMessage.text}</p></div>}
      {hud.running && <div className="absolute inset-x-0 bottom-4 flex items-end justify-between px-4 sm:bottom-7 sm:px-8"><div className="flex gap-2.5">{control('left', ChevronLeft, 'تحرك يسار')}{control('right', ChevronRight, 'تحرك يمين')}</div><div className="flex gap-2.5">{control('slide', ChevronDown, 'انزل واتزحلق')}{control('jump', ChevronUp, 'انط', true)}</div></div>}
      {hud.exploring && <div className="pointer-events-none absolute inset-x-0 bottom-3 hidden justify-center sm:flex"><span className="rounded-full border border-white/15 bg-[#08233C]/70 px-4 py-1.5 text-[12px] text-white/80 backdrop-blur">WASD للمشي • Shift للجري • Space للقفز • C للانزلاق • اضغط على الشاشة وحرّك الماوس للكاميرا • Esc للإفلات</span></div>}
      {hud.exploring && <div className="absolute inset-x-0 bottom-4 flex items-end justify-between px-4 sm:bottom-7 sm:px-8"><div className="flex gap-2.5">{control('left', ChevronLeft, 'امشِ يسار')}{control('right', ChevronRight, 'امشِ يمين')}</div><div className="flex gap-2.5">{control('slide', ChevronsDown, 'انزلاق')}{control('jump', ChevronsUp, 'قفز')}{control('forward', ChevronUp, 'امشِ للأمام', true)}</div></div>}
      {!hud.running && !hud.exploring && !finished && <div className="absolute inset-0 grid place-items-center bg-[#06121F]/30 p-4 backdrop-blur-[2px]"><section className="w-full max-w-xl rounded-[30px] border border-white/20 bg-[#09243A]/88 p-5 shadow-[0_30px_100px_rgba(0,0,0,.38)] backdrop-blur-2xl sm:p-8">
        <div className="mb-5 flex items-center justify-between"><span className="text-xs font-black tracking-[.16em] text-[#FF9A42]">TWIST • BANHA RUN</span><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70">تحدي بنها</span></div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">اجري في بنها،<br /><span className="text-[#FF8B35]">واجمع شنط Twist</span></h1><p className="mt-3 max-w-md text-sm leading-6 text-white/70">ابدأ في شارع المتاجر، وعدّي شوارع بنها ونفق سعد زغلول تحت السكة الحديد، ثم شارع فريد ندا والاستاد، وصولًا لكوبري كفر الجزار. أسماء الأماكن هتظهر وأنت بتعدّيها.</p>
        <div className="mt-6 grid gap-4"><fieldset><legend className="text-xs font-bold text-white/60">مستوى التحدي</legend><div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-black/25 p-1">{LEVELS.map((x) => <button type="button" key={x.id} onClick={() => setLevelId(x.id)} className={'h-10 rounded-xl text-xs font-black transition ' + (levelId === x.id ? 'bg-[#F8620A] text-white shadow-lg' : 'text-white/60 hover:bg-white/10')}>{x.label}</button>)}</div></fieldset></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold text-white/65">من شارع المتاجر إلى كوبري كفر الجزار<span className="mx-1 text-white/35">•</span>اجمع {level.goal} شنط</p><button type="button" onClick={start} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F8620A] px-6 font-black shadow-[0_8px_25px_rgba(248,98,10,.3)] transition hover:-translate-y-0.5 hover:bg-[#E45407]"><Play className="h-4 w-4 fill-current" />يلا بينا</button></div>
        <p className="mt-5 text-center text-[11px] text-white/50">اسحب على الشاشة أو استخدم الأسهم: حركة • فوق: اقفز فوق الصندوق • تحت: انزلق تحت الشاحنة</p>
      </section></div>}
      {hud.paused && <div className="absolute inset-0 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"><section className="rounded-[28px] border border-white/15 bg-[#09243A]/95 p-8 text-center shadow-2xl"><Pause className="mx-auto h-8 w-8 text-[#FF9A42]" /><h2 className="mt-3 text-xl font-black">وقفنا هنا</h2><button type="button" onClick={togglePause} className="mt-5 rounded-2xl bg-[#F8620A] px-7 py-3 font-black">كمّل الجري</button></section></div>}
      {finished && <div className="absolute inset-0 grid place-items-center bg-[#06121F]/55 p-4 backdrop-blur-sm"><section className="w-full max-w-sm rounded-[30px] border border-white/15 bg-[#09243A]/95 p-7 text-center shadow-2xl"><span className={'mx-auto grid h-14 w-14 place-items-center rounded-2xl ' + (hud.complete ? 'bg-amber-400/15 text-amber-300' : 'bg-rose-400/15 text-rose-300')}>{hud.complete ? <Trophy className="h-7 w-7" /> : <X className="h-7 w-7" />}</span><h2 className="mt-4 text-2xl font-black">{hud.complete ? 'عاش! خلّصت التحدي' : 'الزحمة لحقتك!'}</h2><p className="mt-2 text-sm text-white/65">جمعت {hud.bags} شنطة في {area.name}</p><p className="mt-2 text-xs text-white/45">مكافآت المتاجر هتتضاف بعد اعتماد الحملات.</p><button type="button" onClick={start} className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F8620A] px-6 font-black"><RotateCcw className="h-4 w-4" /> العب تاني</button></section></div>}
      {loadPct < 100 && !hud.sceneError && <div className="absolute inset-0 z-50 grid place-items-center bg-[#06121F] p-6 text-center"><div className="w-full max-w-sm"><p className="text-[11px] font-black tracking-[.2em] text-[#FF9A42]">TWIST • BANHA RUN</p><h2 className="mt-3 text-2xl font-black text-white">بنجهّز سوق بنها...</h2><p className="mt-1 text-xs text-white/60">{loadPct < 35 ? 'تحميل الشخصية والشوارع' : loadPct < 80 ? 'تحميل العربيات والموتوسيكلات' : 'تجهيز المشهد'}</p><div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={loadPct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-l from-[#FF9A42] to-[#F8620A] transition-[width] duration-300" style={{ width: loadPct + '%' }} /></div><p className="mt-2 text-sm font-black tabular-nums text-[#FFAA5B]">{loadPct}%</p></div></div>}
      {hud.sceneError && <div className="absolute inset-0 grid place-items-center bg-[#071521]/95 p-6 text-center"><div><h2 className="text-xl font-black">مشهد اللعبة مش قادر يشتغل على المتصفح ده</h2><p className="mt-2 text-sm text-white/60">جرّب تفتحها في متصفح بيدعم WebGL.</p>{hud.sceneErrorMessage && <p className="mx-auto mt-3 max-w-md break-words text-xs text-rose-200/75">{hud.sceneErrorMessage}</p>}</div></div>}
    </main>
  );
}
