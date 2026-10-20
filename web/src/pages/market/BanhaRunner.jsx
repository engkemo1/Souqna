import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Maximize2, Minimize2, Pause, Play, RotateCcw, ShoppingBag, Trophy, X } from 'lucide-react';
import * as THREE from 'three';
import { createVillasWorld, patchBend } from './runner/villasWorld.js';
import { makeSedan, makeMicrobus, makeMotorcycle, makeTuktuk, loadRealVehicles } from './runner/vehicles.js';
import { makeHero } from './runner/hero.js';
import { createPost } from './runner/postfx.js';

const AREAS = [
  { id: 'station', name: 'شارع المحطة', clue: 'من ميدان المحطة لوسط البلد', sign: 'محطة بنها', density: 1.2 },
  { id: 'farid-nada', name: 'شارع فريد ندا', clue: 'شارع فريد ندا', sign: 'فريد ندا', density: 1 },
  { id: 'stadium', name: 'شارع الاستاد', clue: 'منطقة الاستاد', sign: 'استاد بنها', density: 1.1 },
  { id: 'villas', name: 'الفلل', clue: 'منطقة الفلل في بنها', sign: 'الفلل', density: .9 },
  { id: 'ahram', name: 'منطقة الأهرام', clue: 'شوارع الأهرام', sign: 'الأهرام', density: 1 },
];
const LEVELS = [
  { id: 'easy', label: 'سهل', goal: 8, speed: 8.5 },
  { id: 'normal', label: 'متوسط', goal: 14, speed: 10.5 },
  { id: 'hard', label: 'صعب', goal: 20, speed: 13 },
];
const ROUTES = ['بنها - القاهرة', 'بنها - طوخ', 'بنها - شبرا', 'بنها البلد'];
const LANES = [-2.15, 0, 2.15];
const mat = (color, roughness = .78) => new THREE.MeshStandardMaterial({ color, roughness });

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
  if (type === 'car') return makeSedan();
  if (type === 'microbus') return makeMicrobus(route);
  if (type === 'bike') return makeMotorcycle();
  if (type === 'tuktuk') return makeTuktuk();
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

function makeObstacle(type, route) {
  if (type === 'bag') {
    const g = new THREE.Group(), bag = addBox(g, [.78, .78, .38], [0, .68, 0], mat('#F46A1B'));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(.54, .22), new THREE.MeshBasicMaterial({ map: labelTexture('TWIST', { bg: '#F46A1B', fontSize: 60 }) }));
    front.position.set(0, .68, .205); g.add(front);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.20, .045, 8, 20, Math.PI), mat('#FFE7C4')); handle.position.set(0, 1.14, 0); g.add(handle);
    return g;
  }
  if (type === 'barrier') {
    const g = new THREE.Group(); addBox(g, [1.45, .58, .32], [0, .42, 0], mat('#E6C568'));
    const strip = addBox(g, [1.46, .16, .34], [0, .42, .18], mat('#C94C3E')); strip.rotation.z = -.20;
    for (const x of [-.57, .57]) addBox(g, [.12, .46, .16], [x, .18, 0], mat('#5C5143'));
    return g;
  }
  if (type === 'banner') {
    const g = new THREE.Group(); addBox(g, [2.3, .48, .16], [0, 2.25, 0], new THREE.MeshStandardMaterial({ map: labelTexture('خلي بالك', { bg: '#126B4D', fontSize: 60 }) }));
    return g;
  }
  if (type === 'pedestrian') return makePerson(['#397E83', '#B75941', '#405C88'][Math.floor(Math.random() * 3)], .95);
  return createVehicle(type, route);
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
  const station = new THREE.Group(); station.position.set(0, 0, -34); scene.add(station);
  const facade = mat('#D7BD98'), trim = mat('#9B7652'), shadow = mat('#684D3D'), glass = mat('#94B8BE');
  addBox(station, [12.8, 4.2, 1.4], [0, 2.1, -1.6], facade);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 1.8, 4), mat('#B99469')); roof.rotation.y = Math.PI / 4; roof.position.set(0, 5.05, -1.5); station.add(roof);
  addBox(station, [5.5, .62, .11], [0, 3.62, -.84], new THREE.MeshStandardMaterial({ map: labelTexture('محطة بنها', { bg: '#087A59', fontSize: 68 }) }));
  addBox(station, [3.9, .28, .12], [0, 3.23, -.83], new THREE.MeshStandardMaterial({ map: labelTexture('BANHA RAILWAY STATION', { bg: '#D7BD98', color: '#594735', fontSize: 34 }) }));
  for (let i = -2; i <= 2; i++) {
    const x = i * 2.15;
    addBox(station, [.22, 2.12, .3], [x - .74, 1.06, -.78], trim);
    const arch = new THREE.Mesh(new THREE.ShapeGeometry(makeArchShape(.67, 1.4)), new THREE.MeshBasicMaterial({ color: 0x263d46, side: THREE.DoubleSide }));
    arch.position.set(x, .03, -.72); station.add(arch);
    addBox(station, [.12, 1.18, .12], [x, .60, -.62], glass);
  }
  addBox(station, [2.6, 1.2, .38], [0, 5.6, -1.4], facade);
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(.58, .58, .18, 28), new THREE.MeshStandardMaterial({ map: makeClockTexture(), roughness: .65 }));
  clock.rotation.x = Math.PI / 2; clock.position.set(0, 5.72, -.97); station.add(clock);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.7, .9, 4), trim); towerRoof.rotation.y = Math.PI / 4; towerRoof.position.set(0, 6.65, -1.4); station.add(towerRoof);
  // Platform canopy and a red/cream Egyptian train.
  addBox(station, [8.5, .18, 4.2], [-8, 3.4, -2], mat('#D4D0C3'));
  const train = new THREE.Group(); train.position.set(-9, 0, -3);
  addBox(train, [3.3, 2.1, 7.8], [0, 1.2, 0], mat('#E5E0D4')); addBox(train, [3.34, .28, 7.82], [0, .45, 0], mat('#AE4538'));
  for (let i = -2; i <= 2; i++) addBox(train, [.48, .68, .06], [1.68, 1.35, i * 1.3], glass);
  station.add(train);
  return station;
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

function createScene(canvas, area, gameRef) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: area.id !== 'villas', alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9DD8EB'); scene.fog = new THREE.Fog('#C9DAD3', 36, 105);
  const camera = new THREE.PerspectiveCamera(54, 1, .1, 150); camera.position.set(0, 4.8, 10.2); camera.lookAt(0, 1.1, -4);
  const hemi = new THREE.HemisphereLight('#E5F4FF', '#74604C', 2.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF0D2', 3.0); sun.position.set(-12, 22, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -15; scene.add(sun);

  // Villas get the new curved, streamed world; every other area keeps the original straight street.
  const world = area.id === 'villas' ? createVillasWorld(scene, camera, { sun, hemi, renderer, envUrl: '/runner/env/sunset_1k.hdr' }) : null;
  const mobile = window.innerWidth < 700;
  if (world) {
    camera.fov = 60; camera.position.set(0, 3.9, 8.7); camera.updateProjectionMatrix();
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
    const island = new THREE.Group(); island.position.set(0, 0, -20); scene.add(island); monument = island;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.95, .28, 32), mat('#D4C3A5')); rim.position.y = .12; island.add(rim);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, .14, 32), mat('#56A9B4')); water.position.y = .29; island.add(water);
    addBox(island, [.55, 2.3, .55], [0, 1.45, 0], mat('#C9B28D'));
    addBox(island, [.85, .18, .12], [0, 2.45, .31], new THREE.MeshStandardMaterial({ map: labelTexture('القليوبية', { bg: '#B99C72', fontSize: 34 }) }));
    const face = new THREE.Mesh(new THREE.CylinderGeometry(.39, .39, .16, 24), new THREE.MeshStandardMaterial({ map: makeClockTexture() })); face.rotation.x = Math.PI / 2; face.position.set(0, 2.75, .35); island.add(face);
    for (let i = 0; i < 4; i++) { const jet = new THREE.Mesh(new THREE.CylinderGeometry(.025, .065, .65, 8), mat('#B7E3E6')); jet.position.set(Math.sin(i * Math.PI / 2) * .82, .57, Math.cos(i * Math.PI / 2) * .82); jet.rotation.z = Math.sin(i * Math.PI / 2) * -.22; island.add(jet); }
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
    const vehicle = createVehicle(type, ROUTES[i % ROUTES.length]); vehicle.scale.setScalar(.58 + (i % 3) * .1);
    vehicle.position.set(LANES[(i + 1) % 3], 0, -12 - i * 8); scene.add(vehicle); if (world) patchBend(vehicle); obstacles.push({ group: vehicle, type, lane: (i + 1) % 3, checked: false, initial: true });
  }
  for (let i = 0; i < 9; i++) {
    const lane = Math.floor(Math.random() * 3), type = i % 4 === 0 ? 'bag' : i % 4 === 1 ? 'barrier' : i % 4 === 2 ? 'pedestrian' : 'banner';
    const obj = makeObstacle(type, ROUTES[i % ROUTES.length]); obj.position.set(LANES[lane], 0, -20 - i * 9); scene.add(obj); if (world) patchBend(obj); obstacles.push({ group: obj, type, lane, checked: false, initial: false });
  }
  const runner = world ? makeHero() : makeRunner(); runner.position.set(0, 0, 2.3); scene.add(runner); if (world) patchBend(runner);
  const cameraTarget = new THREE.Vector3(0, world ? 1.5 : 1.15, world ? -6 : -4);
  // Swap in real GLB vehicles when provided (public/runner/models/*.glb); new spawns use them automatically.
  let disposed = false;
  loadRealVehicles().then((found) => {
    if (disposed || !found.length) return;
    for (const item of obstacles) {
      if (!found.includes(item.type) || !item.initial) continue;
      const old = item.group, fresh = createVehicle(item.type); fresh.position.copy(old.position); fresh.scale.copy(old.scale); fresh.scale.setScalar(old.scale.x);
      scene.remove(old); scene.add(fresh); if (world) patchBend(fresh); item.group = fresh;
    }
  });
  const post = world ? createPost(renderer, scene, camera, { mobile }) : null;
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
  const tick = () => {
    raf = requestAnimationFrame(tick); const dt = Math.min(clock.getDelta(), .045), g = gameRef.current;
    const worldSpeed = g.running && !g.paused ? g.level.speed : .8;
    g.time += dt * (g.running && !g.paused ? 1 : .55);
    if (world) world.update(dt, worldSpeed);
    if (roadTexture) roadTexture.offset.y = (roadTexture.offset.y + worldSpeed * dt / 100) % 1;
    for (const texture of pavementTextures) texture.offset.y = (texture.offset.y + worldSpeed * dt / 100) % 1;
    for (const mark of markings) { mark.position.z += worldSpeed * dt; if (mark.position.z > 6) mark.position.z -= 84; }
    for (const item of moving) {
      item.position.z += worldSpeed * dt;
      if (item.position.z > 10) item.position.z -= 84;
    }
    if (landmark) {
      landmark.position.z += worldSpeed * dt;
      if (landmark.position.z > 9) { landmark.visible = false; }
    }
    if (monument) { monument.position.z += worldSpeed * dt; if (monument.position.z > 8) monument.visible = false; }
    for (const person of pedestrians) animateLimb(person.userData.limbs, g.time * 5 + person.position.z, .42);
    if (g.running && !g.paused) {
      g.spawn -= dt;
      if (g.spawn <= 0 && obstacles.length < 22) {
        const roll = Math.random(), type = roll < .36 ? 'bag' : roll < .50 ? 'barrier' : roll < .57 ? 'banner' : roll < .66 ? 'pedestrian' : ['car', 'microbus', 'tuktuk', 'bike'][Math.floor(Math.random() * 4)];
        const lane = Math.floor(Math.random() * 3), group = makeObstacle(type, ROUTES[Math.floor(Math.random() * ROUTES.length)]);
        group.position.set(LANES[lane], 0, -48); scene.add(group); if (world) patchBend(group); obstacles.push({ group, type, lane, checked: false, initial: false });
        g.spawn = Math.max(.48, 1.18 - g.level.speed / 26) / area.density + Math.random() * .38;
      }
      g.jump = Math.max(0, g.jump - dt); g.slide = Math.max(0, g.slide - dt);
      g.currentX = THREE.MathUtils.damp(g.currentX || 0, LANES[g.lane], 12, dt); runner.position.x = g.currentX;
      const jumping = g.jump > 0; const sliding = g.slide > 0;
      runner.position.y = jumping ? Math.sin((1 - g.jump / .68) * Math.PI) * 1.25 : 0;
      runner.scale.y = sliding ? .52 : 1;
      if (world) runner.userData.animate(g.time * 13, .85, jumping, sliding); else animateLimb(runner.userData.limbs, g.time * 13, sliding ? .12 : jumping ? .25 : .82);
      runner.rotation.z = THREE.MathUtils.damp(runner.rotation.z, (LANES[g.lane] - runner.position.x) * -.08, 6, dt);
      for (const item of obstacles) {
        item.group.position.z += item.initial ? worldSpeed * dt * .72 : worldSpeed * dt * 1.12;
        const actualLane = item.type === 'pedestrian' ? LANES.reduce((best, x, index) => Math.abs(x - item.group.position.x) < Math.abs(LANES[best] - item.group.position.x) ? index : best, 0) : item.lane;
        if (!item.checked && item.group.position.z > 1.05 && item.group.position.z < 2.2 && actualLane === g.lane) {
          item.checked = true;
          if (item.type === 'bag') g.bags += 1;
          else if (item.type === 'barrier' && jumping) { /* jump clears a road barrier */ }
          else if (item.type === 'banner' && sliding) { /* slide under a hanging banner */ }
          else g.hits += 1;
        }
        if (item.type === 'bag') { item.group.rotation.y += dt * 2.5; item.group.position.y = .75 + Math.sin(g.time * 3 + item.group.position.z) * .13; }
        if (item.type === 'pedestrian') {
          item.group.position.x += dt * (item.group.position.x < 0 ? .45 : -.45);
          animateLimb(item.group.userData.limbs, g.time * 7, .48);
        }
      }
      for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].group.position.z > 10) { scene.remove(obstacles[i].group); obstacles.splice(i, 1); }
      if (g.bags >= g.level.goal) { g.running = false; g.complete = true; }
      if (g.hits >= 3) { g.running = false; g.failed = true; }
      if (monument && monument.visible && !g.stationIslandHit && monument.position.z > 1.05 && monument.position.z < 2.2) {
        g.stationIslandHit = true; if (g.lane === 1) g.hits += 1;
      }
    } else {
      runner.position.x = Math.sin(g.time * .8) * .18; if (world) runner.userData.animate(g.time * 5, .3); else animateLimb(runner.userData.limbs, g.time * 4, .35);
      for (const item of obstacles) { item.group.position.z += dt * .28; if (item.group.position.z > 9) item.group.position.z = -55; }
    }
    camera.position.x = THREE.MathUtils.damp(camera.position.x, runner.position.x * .22, 2.5, dt);
    camera.lookAt(cameraTarget);
    if (world) { camera.rotation.z = -world.curve * 24; if (g.running && !g.paused) camera.position.y = 3.9 + Math.sin(g.time * 13) * .035; }
    if (post) post.render(clock.elapsedTime); else renderer.render(scene, camera);
    if (clock.elapsedTime - hudTime > .12) {
      g.onHud?.({ bags: g.bags, hits: g.hits, running: g.running, paused: g.paused, complete: g.complete, failed: g.failed });
      hudTime = clock.elapsedTime;
    }
  };
  tick();
  return () => {
    disposed = true; cancelAnimationFrame(raf); observer.disconnect(); world?.dispose(); post?.dispose();
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
  const gameRef = useRef({ running: false, paused: false, lane: 1, currentX: 0, jump: 0, slide: 0, time: 0, bags: 0, hits: 0, spawn: .6, level: LEVELS[1], complete: false, failed: false });
  const [areaId, setAreaId] = useState(AREAS[0].id), [levelId, setLevelId] = useState('normal');
  const [hud, setHud] = useState({ bags: 0, hits: 0, running: false, paused: false, complete: false, failed: false });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const area = AREAS.find((x) => x.id === areaId) || AREAS[0], level = LEVELS.find((x) => x.id === levelId) || LEVELS[1];

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    try { return createScene(canvas, area, gameRef); }
    catch (error) { console.error('Banha 3D scene could not start:', error); setHud((old) => ({ ...old, sceneError: true })); return undefined; }
  }, [area]);
  const start = useCallback(() => {
    const g = gameRef.current; Object.assign(g, { running: true, paused: false, lane: 1, currentX: 0, jump: 0, slide: 0, time: 0, bags: 0, hits: 0, spawn: .45, level, complete: false, failed: false, stationIslandHit: false });
    g.onHud = setHud; setHud({ bags: 0, hits: 0, running: true, paused: false, complete: false, failed: false });
  }, [level]);
  const act = useCallback((action) => {
    const g = gameRef.current; if (!g.running || g.paused) return;
    if (action === 'left') g.lane = Math.max(0, g.lane - 1);
    if (action === 'right') g.lane = Math.min(2, g.lane + 1);
    if (action === 'jump' && g.jump <= 0 && g.slide <= 0) g.jump = .68;
    if (action === 'slide' && g.jump <= 0 && g.slide <= 0) g.slide = .68;
  }, []);
  const togglePause = () => { gameRef.current.paused = !gameRef.current.paused; setHud((x) => ({ ...x, paused: gameRef.current.paused })); };
  const toggleFullscreen = async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { /* Embedded previews can block fullscreen. */ }
  };
  useEffect(() => {
    const onKey = (e) => {
      const keyMap = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide' };
      if (keyMap[e.key]) { e.preventDefault(); act(keyMap[e.key]); }
      if (e.key === 'Escape' && gameRef.current.running) togglePause();
    };
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey); document.addEventListener('fullscreenchange', onFullscreen);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFullscreen); };
  }, [act]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    let sx = null, sy = null;
    const down = (e) => { sx = e.changedTouches[0].clientX; sy = e.changedTouches[0].clientY; };
    const up = (e) => {
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 25) act(dx < 0 ? 'left' : 'right');
      else if (Math.abs(dy) > 25) act(dy < 0 ? 'jump' : 'slide'); sx = null; sy = null;
    };
    canvas.addEventListener('touchstart', down, { passive: true }); canvas.addEventListener('touchend', up, { passive: true });
    return () => { canvas.removeEventListener('touchstart', down); canvas.removeEventListener('touchend', up); };
  }, [act]);

  const finished = hud.complete || hud.failed;
  const control = (action, Icon, label, hot = false) => <button type="button" aria-label={label} onPointerDown={(e) => { e.preventDefault(); act(action); }} disabled={!hud.running || hud.paused} className={'grid h-[58px] w-[58px] touch-none place-items-center rounded-[21px] border shadow-[0_12px_32px_rgba(1,15,29,.4)] backdrop-blur-xl transition active:scale-90 disabled:opacity-35 sm:h-[68px] sm:w-[68px] ' + (hot ? 'border-[#FFAA5B]/40 bg-[#E9590A]/90 text-white' : 'border-white/25 bg-[#09243A]/78 text-white')}><Icon className="h-6 w-6" strokeWidth={2.7} /></button>;
  return (
    <main dir="rtl" className="fixed inset-0 isolate overflow-hidden bg-[#14212B] text-white" style={{ width: '100vw', height: '100dvh' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label={'لعبة جري في ' + area.name} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-[#06121F]/80 via-[#06121F]/25 to-transparent p-3 sm:p-5">
        <div className="pointer-events-auto flex items-center gap-2.5"><Link to="/" aria-label="العودة للسوق" className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl"><ArrowRight className="h-5 w-5" /></Link><div><p className="text-[10px] font-black tracking-[.16em] text-[#FF9A42]">TWIST • BANHA RUN</p><p className="mt-0.5 text-sm font-black sm:text-base">{area.name}</p></div></div>
        <div className="pointer-events-auto flex gap-2"><button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button>{hud.running && <button type="button" onClick={togglePause} aria-label={hud.paused ? 'استكمال' : 'إيقاف مؤقت'} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/20 bg-[#09243A]/70 backdrop-blur-xl">{hud.paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}</button>}</div>
      </div>
      {hud.running && <div className="absolute left-1/2 top-[62px] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/20 bg-[#08233C]/75 px-4 py-2 shadow-xl backdrop-blur-xl sm:top-5"><span className="flex items-center gap-1.5 font-black text-[#FF9A42]"><ShoppingBag className="h-4 w-4" />{hud.bags}<span className="text-white/55">/ {level.goal}</span></span><span className="h-5 w-px bg-white/20" /><span className="text-xs font-bold text-white/85">خبطات {hud.hits}/3</span></div>}
      {hud.running && <div className="absolute inset-x-0 bottom-4 flex items-end justify-between px-4 sm:bottom-7 sm:px-8"><div className="flex gap-2.5">{control('left', ChevronLeft, 'تحرك يسار')}{control('right', ChevronRight, 'تحرك يمين')}</div><div className="flex gap-2.5">{control('slide', ChevronDown, 'انزل واتزحلق')}{control('jump', ChevronUp, 'انط', true)}</div></div>}
      {!hud.running && !finished && <div className="absolute inset-0 grid place-items-center bg-[#06121F]/30 p-4 backdrop-blur-[2px]"><section className="w-full max-w-xl rounded-[30px] border border-white/20 bg-[#09243A]/88 p-5 shadow-[0_30px_100px_rgba(0,0,0,.38)] backdrop-blur-2xl sm:p-8">
        <div className="mb-5 flex items-center justify-between"><span className="text-xs font-black tracking-[.16em] text-[#FF9A42]">TWIST • BANHA RUN</span><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70">تحدي بنها</span></div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">اجري في بنها،<br /><span className="text-[#FF8B35]">واجمع شنط Twist</span></h1><p className="mt-3 max-w-md text-sm leading-6 text-white/70">اختار شارعك، اتحرك بين الحارات، انط فوق الحواجز وانزل تحت اللافتات. خلي بالك من الميكروباصات والتكاتك والناس!</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-white/60">الشارع<select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-[#102C44] px-4 text-sm font-bold text-white outline-none focus:border-[#FF8B35]">{AREAS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><fieldset><legend className="text-xs font-bold text-white/60">مستوى التحدي</legend><div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-black/25 p-1">{LEVELS.map((x) => <button type="button" key={x.id} onClick={() => setLevelId(x.id)} className={'h-10 rounded-xl text-xs font-black transition ' + (levelId === x.id ? 'bg-[#F8620A] text-white shadow-lg' : 'text-white/60 hover:bg-white/10')}>{x.label}</button>)}</div></fieldset></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold text-white/65">{area.clue}<span className="mx-1 text-white/35">•</span>اجمع {level.goal} شنط</p><button type="button" onClick={start} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F8620A] px-6 font-black shadow-[0_8px_25px_rgba(248,98,10,.3)] transition hover:-translate-y-0.5 hover:bg-[#E45407]"><Play className="h-4 w-4 fill-current" />يلا بينا</button></div>
        <p className="mt-5 text-center text-[11px] text-white/50">اسحب على الشاشة أو استخدم الأسهم: حركة • فوق: نط • تحت: انزلاق</p>
      </section></div>}
      {hud.paused && <div className="absolute inset-0 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"><section className="rounded-[28px] border border-white/15 bg-[#09243A]/95 p-8 text-center shadow-2xl"><Pause className="mx-auto h-8 w-8 text-[#FF9A42]" /><h2 className="mt-3 text-xl font-black">وقفنا هنا</h2><button type="button" onClick={togglePause} className="mt-5 rounded-2xl bg-[#F8620A] px-7 py-3 font-black">كمّل الجري</button></section></div>}
      {finished && <div className="absolute inset-0 grid place-items-center bg-[#06121F]/55 p-4 backdrop-blur-sm"><section className="w-full max-w-sm rounded-[30px] border border-white/15 bg-[#09243A]/95 p-7 text-center shadow-2xl"><span className={'mx-auto grid h-14 w-14 place-items-center rounded-2xl ' + (hud.complete ? 'bg-amber-400/15 text-amber-300' : 'bg-rose-400/15 text-rose-300')}>{hud.complete ? <Trophy className="h-7 w-7" /> : <X className="h-7 w-7" />}</span><h2 className="mt-4 text-2xl font-black">{hud.complete ? 'عاش! خلّصت التحدي' : 'الزحمة لحقتك!'}</h2><p className="mt-2 text-sm text-white/65">جمعت {hud.bags} شنطة في {area.name}</p><p className="mt-2 text-xs text-white/45">مكافآت المتاجر هتتضاف بعد اعتماد الحملات.</p><button type="button" onClick={start} className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F8620A] px-6 font-black"><RotateCcw className="h-4 w-4" /> العب تاني</button></section></div>}
      {hud.sceneError && <div className="absolute inset-0 grid place-items-center bg-[#071521]/95 p-6 text-center"><div><h2 className="text-xl font-black">مشهد اللعبة مش قادر يشتغل على المتصفح ده</h2><p className="mt-2 text-sm text-white/60">جرّب تفتحها في متصفح بيدعم WebGL.</p></div></div>}
    </main>
  );
}
