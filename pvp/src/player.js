// SPELAREN – förstapersonsstyrning med Rapiers karaktärsstyrning, vapen, raketgevär, granater, sprängladdning (R6) och C4.
import * as THREE from 'three';
import { makeHand, handMats, orient } from './hands.js';
import { E, followSun, tex } from './engine.js';
import { R, PH, ray, own } from './physics.js';
import { fx, P as fxP } from './fx.js';
import { sfx, audioOn } from './audio.js';
import { blast } from './destruct.js';

export const WEAPONS = {
  ak:  { name: 'AK-12', mag: 30, res: 150, rpm: 650, dmg: 34, spread: .0025, kick: .011, modes: ['AUTO', 'SINGEL'], reload: 2.3 },
  rpg: { name: 'RPG-7V2', mag: 1, res: 5, rpm: 30, dmg: 0, spread: 0, kick: .05, modes: ['SINGEL'], reload: 3.2, rocket: true },
  // klassvapen (BF4-klasserna): kpist för ingenjören, kulspruta för understöd, prickskyttegevär och pistol för spanaren, granattillsats för anfall
  pdw: { name: 'UMP-45', mag: 25, res: 125, rpm: 600, dmg: 26, spread: .004, kick: .008, modes: ['AUTO', 'SINGEL'], reload: 2.1 },
  lmg: { name: 'M249', mag: 100, res: 300, rpm: 750, dmg: 28, spread: .006, kick: .012, modes: ['AUTO'], reload: 5.2 },
  sniper: { name: 'SV-98', mag: 5, res: 30, rpm: 45, dmg: 95, spread: .0003, hip: .03, kick: .06, modes: ['SINGEL'], reload: 3.4, scope: true },
  pistol: { name: 'M9', mag: 15, res: 60, rpm: 400, dmg: 24, spread: .004, kick: .01, modes: ['SINGEL'], reload: 1.6 },
  gl: { name: 'M320 HE', mag: 1, res: 5, rpm: 30, dmg: 0, spread: 0, kick: .05, modes: ['SINGEL'], reload: 2.6, launcher: true },
};
export const GADGETS = { gren: { name: 'M67 GRANAT', n: 3 }, breach: { name: 'SPRÄNGLADDNING', n: 3 }, c4: { name: 'C4', n: 3 } };
// BF4:s fyra klasser (läkaren är Anfall – ingen egen klass). Tangenter: 1/2 vapen, X/V/Z prylar, G granat, Q spotta.
// Prylarna: med = förbandslåda, defib = defibrillator, breach = sprängladdning, repair = reparationsverktyg,
// ammo = ammunitionslåda, c4, clay = claymore, sensor = rörelsesensor, beacon = radiofyr (återuppståndelse).
export const CLASSES = {
  anfall:   { name: 'ANFALL', sub: 'LÄKARE', w: ['ak', 'gl'], keys: { X: 'med', V: 'defib' }, gad: { med: 1 } },
  ingenjor: { name: 'INGENJÖR', sub: 'PANSARVÄRN', w: ['pdw', 'rpg'], keys: { X: 'breach', V: 'repair' }, gad: { breach: 3 } },
  understod:{ name: 'UNDERSTÖD', sub: 'AMMUNITION', w: ['lmg', 'pistol'], keys: { X: 'ammo', V: 'c4', Z: 'clay' }, gad: { ammo: 1, c4: 3, clay: 2 } },
  spanare:  { name: 'SPANARE', sub: 'SPANING', w: ['sniper', 'pistol'], keys: { X: 'sensor', V: 'c4', Z: 'beacon' }, gad: { sensor: 2, c4: 2, beacon: 1 } },
};
export const CLASS_KEYS = ['anfall', 'ingenjor', 'understod', 'spanare'];
export const NADES = { frag: { name: 'SPLITTERGRANAT', n: 3 }, smoke: { name: 'RÖKGRANAT', n: 2 }, flash: { name: 'BLÄNDGRANAT', n: 2 } };
export const GAD_NAME = { med: 'FÖRBANDSLÅDA', defib: 'DEFIBRILLATOR', breach: 'SPRÄNGLADDNING', repair: 'REPARERA', ammo: 'AMMOLÅDA', c4: 'C4', clay: 'CLAYMORE', sensor: 'SENSOR', beacon: 'RADIOFYR' };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e){ return null; } };

export const PL = { cls: 'anfall', nextCls: CLASSES[lsGet('ck/klass')] ? lsGet('ck/klass') : 'anfall', nade: NADES[lsGet('ck/granat')] ? lsGet('ck/granat') : 'frag', slots: ['ak', 'gl'], on: false, yaw: 0, pitch: 0, vy: 0, crouch: 0, hp: 100, keys: {}, slot: 'ak', ammo: {}, mode: {}, fireT: 0, rel: 0, kick: 0, sprint: false, charges: [], nades: [], rockets: [], gad: {}, hits: 0, msg: null, bob: 0 };

export function initPlayer(spawn){
  if (!spawn.re) PL.spawn = spawn;
  // återuppståndelse vid gruppens radiofyr (spanaren) om den står kvar
  if (spawn.re && PL.spawnAt){ const s = PL.spawnAt(); if (s) spawn = { ...spawn, ...s }; }
  const w = PH.world;
  if (PL.body){ w.removeRigidBody(PL.body); }
  PL.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + 1, spawn.z));
  PL.col = own(w.createCollider(R.ColliderDesc.capsule(.55, .32), PL.body), { player: true });
  if (!PL.cc){ PL.cc = w.createCharacterController(.02); PL.cc.enableAutostep(.45, .2, true); PL.cc.enableSnapToGround(.35); PL.cc.setMaxSlopeClimbAngle(50*Math.PI/180); PL.cc.setApplyImpulsesToDynamicBodies(true); }
  for (const k in WEAPONS){ PL.ammo[k] = [WEAPONS[k].mag, WEAPONS[k].res]; PL.mode[k] = 0; }
  // klassen väljs vid återuppståndelse (dödsskärmen: 1–4, T granat) och ger vapen och prylar
  PL.cls = CLASSES[PL.nextCls] ? PL.nextCls : 'anfall'; const C = CLASSES[PL.cls]; PL.slots = C.w.slice(); if (PL.onClass) PL.onClass(PL.cls);
  PL.gad = { gren: NADES[PL.nade].n, breach: 0, c4: 0, ...C.gad };
  if (PL.gun && PL.mountExit) PL.mountExit();
  PL.hp = 100; PL.slowK = 1; PL.hurtFrom = null; PL.yaw = spawn.yaw || 0; PL.pitch = 0; PL.vy = 0; PL.on = true; PL.slot = PL.slots[0]; PL.aim = false;
  if (PL.rpgM){ PL.rpgM.visible = PL.slot === 'rpg' || PL.slot === 'gl'; PL.vm.children.forEach(o => { if (o !== PL.rpgM && o !== PL.flash) o.visible = !PL.rpgM.visible; }); }
  if (!PL.vm) makeViewmodel();
}
// tygstruktur (vävt mönster) som normalkarta, och slitage som grovhetskarta – målade i canvas
function canvasTex(draw, n){ const c = document.createElement('canvas'); c.width = c.height = n || 256; draw(c.getContext('2d'), c.width); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const fabricN = () => canvasTex((x, n) => { x.fillStyle = 'rgb(128,128,255)'; x.fillRect(0, 0, n, n); for (let j = 0; j < n; j += 4) for (let i = 0; i < n; i += 4){ const o = ((i + j)/4) % 2; x.fillStyle = o ? 'rgb(150,128,240)' : 'rgb(128,150,240)'; x.fillRect(i, j, 4, 2); x.fillStyle = o ? 'rgb(108,128,240)' : 'rgb(128,108,240)'; x.fillRect(i, j + 2, 4, 2); } });
const wearR = () => canvasTex((x, n) => { x.fillStyle = 'rgb(140,140,140)'; x.fillRect(0, 0, n, n); for (let i = 0; i < 1400; i++){ const v = Math.random() < .5 ? 50 + Math.random()*40 : 150 + Math.random()*90; x.fillStyle = `rgba(${v},${v},${v},.35)`; x.fillRect(Math.random()*n, Math.random()*n, 1 + Math.random()*6, 1 + Math.random()*2); } });
// AK-12 byggt av sidoprofiler (extruderade former med rundade kanter), skena med rödpunktssikte, handskar och ärmar
function prof(pts, w, m, bev){
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const b = bev == null ? .004 : Math.max(bev, .003), g = new THREE.ExtrudeGeometry(sh, { depth: w - 2*b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(w - 2*b)/2); return new THREE.Mesh(g, m);
}
function cyl(r0, r1, len, m, x, y, seg){ const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg || 16), m); o.rotation.z = Math.PI/2; o.position.set(x, y, 0); return o; }
function buildAK(){
  const gun = new THREE.Group();
  const wr = wearR(); wr.repeat.set(4, 4);
  // riktiga material: borstad/slitna metall (Poly Haven metal_plate) och kornig polymer
  const stip = canvasTex((x, n) => { x.fillStyle = 'rgb(128,128,255)'; x.fillRect(0, 0, n, n); for (let i = 0; i < 9000; i++){ const v = 108 + Math.random()*40; x.fillStyle = `rgb(${v},${256 - v},245)`; x.fillRect(Math.random()*n, Math.random()*n, 1.5, 1.5); } }); stip.repeat.set(6, 6);
  const mN = stip.clone(); mN.needsUpdate = true; mN.repeat.set(12, 12);
  const metal = new THREE.MeshStandardMaterial({ color: 0x4e5258, roughness: .85, roughnessMap: wr, normalMap: mN, normalScale: new THREE.Vector2(.15, .15), metalness: .9, envMapIntensity: 2.2 }), dark = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: .9, roughnessMap: wr, normalMap: mN, normalScale: new THREE.Vector2(.12, .12), metalness: .85, envMapIntensity: 2 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x34352f, roughness: .72, metalness: .05, normalMap: stip, normalScale: new THREE.Vector2(.5, .5), envMapIntensity: 1.4 }), lens = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: .05, metalness: .9, emissive: 0x112211 });
  const A = o => { gun.add(o); return o; };
  A(prof([[-.12, -.03], [.16, -.03], [.16, .024], [.12, .034], [-.1, .034], [-.12, .027]], .044, metal));            // låda
  A(prof([[-.37, -.03], [-.12, -.03], [-.12, .018], [-.37, .018], [-.385, .005], [-.385, -.018]], .05, poly, .006)); // handskydd
  A(prof([[-.36, .018], [-.14, .018], [-.14, .04], [-.35, .04]], .036, poly, .004));                                  // övre handskydd
  A(cyl(.0095, .0095, .27, dark, -.5, .012)); A(cyl(.015, .013, .075, dark, -.665, .012, 12));                          // pipa, mynningsbroms
  for (let i = 0; i < 3; i++) A(cyl(.016, .016, .006, metal, -.645 - i*.016, .012, 12));
  A(prof([[-.56, 0], [-.535, 0], [-.535, .064], [-.548, .064], [-.56, .04]], .02, dark, .002));                        // korn
  A(prof([[-.075, -.03], [-.018, -.03], [-.03, -.12], [-.072, -.212], [-.128, -.198], [-.088, -.112]], .03, poly, .004)); // magasin
  A(prof([[.035, -.03], [.078, -.03], [.066, -.132], [.034, -.138], [.034, -.07]], .032, poly, .006));                   // pistolgrepp
  A(prof([[.0, -.03], [.03, -.03], [.03, -.058], [-.005, -.058], [-.01, -.045]], .012, metal, .002));                   // varbygel
  A(prof([[.16, -.028], [.16, .026], [.25, .02], [.42, .022], [.44, -.02], [.43, -.092], [.395, -.1], [.38, -.04], [.25, -.03]], .036, poly, .006)); // kolv
  // skena med räfflor och rödpunktssikte
  A(prof([[-.11, .034], [.12, .034], [.12, .046], [-.11, .046]], .03, dark, .001));
  for (let i = 0; i < 14; i++){ const r = new THREE.Mesh(new THREE.BoxGeometry(.006, .006, .03), dark); r.position.set(-.1 + i*.016, .049, 0); gun.add(r); }
  A(prof([[-.035, .046], [.03, .046], [.03, .06], [-.035, .06]], .034, dark, .003));
  const tube = cyl(.021, .021, .072, metal, 0, .082, 20); A(tube); const gl = cyl(.017, .017, .002, lens, -.037, .082, 20); A(gl);
  A(prof([[-.004, .1], [.012, .1], [.012, .108], [-.004, .108]], .014, dark, .001));
  A(prof([[.07, .03], [.1, .03], [.1, .04], [.07, .04]], .012, metal, .002));                                             // laddhandtag
  // detaljer: utkastaröppning, ventilationsspår i handskyddet, räfflor på magasinet, avtryckare, säkring, kolvplatta
  const hole = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: .6, metalness: .5 });
  { const ep = new THREE.Mesh(new THREE.BoxGeometry(.075, .018, .004), hole); ep.position.set(.02, .012, .0235); gun.add(ep); const bolt = new THREE.Mesh(new THREE.BoxGeometry(.06, .01, .003), metal); bolt.position.set(.02, .012, .0245); gun.add(bolt); }
  for (let i = 0; i < 6; i++) for (const sz of [-1, 1]){ const v = new THREE.Mesh(new THREE.BoxGeometry(.022, .009, .003), hole); v.position.set(-.34 + i*.036, -.004, sz*.0262); gun.add(v); }
  for (let i = 0; i < 5; i++){ const rb = new THREE.Mesh(new THREE.BoxGeometry(.004, .03, .032), poly); rb.position.set(-.05 - i*.009 - i*i*.0012, -.07 - i*.026, 0); rb.rotation.z = -.35 - i*.04; gun.add(rb); }
  { const tr = new THREE.Mesh(new THREE.BoxGeometry(.006, .022, .006), metal); tr.position.set(.012, -.042, 0); tr.rotation.z = .3; gun.add(tr); const sf = new THREE.Mesh(new THREE.BoxGeometry(.04, .006, .003), metal); sf.position.set(.04, .0, .0235); sf.rotation.z = -.2; gun.add(sf);
    const bp = new THREE.Mesh(new THREE.BoxGeometry(.012, .1, .04), new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: .95 })); bp.position.set(.443, -.035, 0); gun.add(bp); }
  gun.rotation.y = -Math.PI/2; gun.scale.setScalar(.78); return gun;
}
// handgrepp (justeras med G.hand i testläge)
export const HP = {
  r: { pose: [[20, 22, 10], [80, 95, 45], [82, 96, 45], [84, 92, 40]], thumb: [30, 45, 50, 40], fy: [0, -.4, -1], bz: [1, 0, -.1], p: [.03, -.068, .088] },
  l: { pose: [[62, 76, 38], [66, 82, 42], [68, 84, 42], [70, 82, 38]], thumb: [25, 30, 35, 30], fy: [.5, .3, -.8], bz: [-.55, -.8, -.1], p: [-.035, -.07, -.13] },
};
function makeViewmodel(){
  const g = PL.vm = new THREE.Group(), gun = buildAK(); g.add(gun);
  const fn = fabricN(); fn.repeat.set(5, 5);
  const camo = canvasTex((x, n) => { x.fillStyle = '#5a5c46'; x.fillRect(0, 0, n, n); const cols = ['#6e6a50', '#47493a', '#7c7458', '#3a3d32']; for (let i = 0; i < 70; i++){ x.fillStyle = cols[i % 4]; x.beginPath(); const cx = Math.random()*n, cy = Math.random()*n; x.ellipse(cx, cy, 8 + Math.random()*26, 5 + Math.random()*14, Math.random()*3, 0, 7); x.fill(); } }); camo.colorSpace = THREE.SRGBColorSpace; camo.repeat.set(2, 2); const glove = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: .82, normalMap: fn, normalScale: new THREE.Vector2(.5, .5) }), sleeve = new THREE.MeshStandardMaterial({ map: camo, roughness: .95, normalMap: fn, normalScale: new THREE.Vector2(1.2, 1.2) });
  // händer med handske (hands.js): höger på pistolgreppet med pekfingret vid avtryckaren, vänster under handskyddet
  const HM = handMats(camo);
  PL.handR = orient(makeHand(HP.r.pose, HP.r.thumb, -1, HM), new THREE.Vector3(...HP.r.fy), new THREE.Vector3(...HP.r.bz), new THREE.Vector3(...HP.r.p)); g.add(PL.handR);
  PL.handL = orient(makeHand(HP.l.pose, HP.l.thumb, 1, HM), new THREE.Vector3(...HP.l.fy), new THREE.Vector3(...HP.l.bz), new THREE.Vector3(...HP.l.p)); g.add(PL.handL);
  g.traverse(o => { if (o.isMesh){ o.castShadow = false; o.renderOrder = 10; } });
  const fl = PL.flash = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd080 })); fl.position.set(0, .012, -.72); fl.visible = false; g.add(fl);
  PL.flashL = new THREE.PointLight(0xffb060, 0, 8, 2); fl.add(PL.flashL);
  const rpg = PL.rpgM = new THREE.Group(); const tube = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .9, 12), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: .7 })); tube.rotation.x = Math.PI/2; tube.position.set(0, 0, -.35); rpg.add(tube);
  const war = new THREE.Mesh(new THREE.ConeGeometry(.07, .22, 12), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: .6 })); war.rotation.x = -Math.PI/2; war.position.set(0, 0, -.9); rpg.add(war); rpg.visible = false; g.add(rpg);
  E.cam.add(g); g.position.set(.22, -.2, -.36); g.rotation.y = .09;
}
export function bindInput(canvas){
  addEventListener('keydown', e => {
    if (!PL.on) return; PL.keys[e.code] = true;
    // [E] bemanna/lämna ett eget stationärt vapen (defense.js); bemannad: övriga tangenter gäller inte
    if (e.code === 'KeyE' && PL.onUse && PL.deadT <= 0) PL.onUse();
    if (PL.gun) return;
    // död: välj klass (1–4) och granat (T) till nästa liv
    if (PL.deadT > 0){ const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (i >= 0){ PL.nextCls = CLASS_KEYS[i]; try { localStorage.setItem('ck/klass', PL.nextCls); } catch (x){} sfx.click(); }
      if (e.code === 'KeyT'){ const L = Object.keys(NADES); PL.nade = L[(L.indexOf(PL.nade) + 1) % L.length]; try { localStorage.setItem('ck/granat', PL.nade); } catch (x){} sfx.click(); } return; }
    if (e.code === 'Digit1') swap(PL.slots[0]); if (e.code === 'Digit2') swap(PL.slots[1]);
    if (e.code === 'KeyQ' && PL.onSpot) PL.onSpot();
    { const g = CLASSES[PL.cls].keys[e.code.slice(3)]; if (e.code.startsWith('Key') && g){ if (g === 'breach' || g === 'c4') placeCharge(g); else if (PL.onGadget) PL.onGadget(g); } }
    if (e.code === 'KeyR') reload(); if (e.code === 'KeyB'){ const W = WEAPONS[PL.slot]; PL.mode[PL.slot] = (PL.mode[PL.slot] + 1) % W.modes.length; sfx.click(); }
    if (e.code === 'KeyG') throwNade(); if (e.code === 'KeyF') detonate();
  });
  addEventListener('keyup', e => { PL.keys[e.code] = false; });
  canvas.addEventListener('mousedown', e => { audioOn(); if (!PL.on) return; if (document.pointerLockElement !== canvas){ { const pl = canvas.requestPointerLock(); if (pl && pl.catch) pl.catch(() => {}); } return; } if (e.button === 0){ PL.trig = true; PL.trigNew = true; } if (e.button === 2) PL.aim = true; });
  addEventListener('mouseup', e => { if (e.button === 0) PL.trig = false; if (e.button === 2) PL.aim = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (document.pointerLockElement !== canvas || !PL.on) return; const s = .0022*(PL.aim ? .55 : 1); PL.yaw -= e.movementX*s; PL.pitch = Math.max(-1.5, Math.min(1.5, PL.pitch - e.movementY*s)); });
}
function swap(k){ if (!k || PL.slot === k) return; PL.slot = k; PL.rel = 0; PL.swapT = .35; PL.rpgM.visible = k === 'rpg' || k === 'gl'; PL.vm.children.forEach(o => { if (o !== PL.rpgM && o !== PL.flash) o.visible = !PL.rpgM.visible; }); }
function reload(){ const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot]; if (PL.rel > 0 || a[0] >= W.mag || a[1] <= 0) return; PL.rel = W.reload; PL.relMax = W.reload; }
const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
export function aimRay(){ E.cam.getWorldPosition(eye); E.cam.getWorldDirection(fwd); return [eye.clone(), fwd.clone()]; }
function fire(dt){
  const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot];
  if (PL.rel > 0 || PL.swapT > 0) return; if (a[0] <= 0){ if (PL.trigNew) { sfx.click(); reload(); } PL.trigNew = false; return; }
  const single = W.modes[PL.mode[PL.slot]] === 'SINGEL'; if (single && !PL.trigNew) return; PL.trigNew = false;
  if (PL.fireT > 0) return; PL.fireT = 60/W.rpm; a[0]--;
  const [o, d] = aimRay(), moving = (PL.speed || 0) > .5, sp = (W.hip && (PL.aimK || 0) < .8 ? W.hip : W.spread*(PL.aim ? .35 : 1))*(moving ? 2.5 : 1)*(1 + PL.heat*2);
  d.x += (Math.random() - .5)*sp*2; d.y += (Math.random() - .5)*sp*2; d.z += (Math.random() - .5)*sp*2; d.normalize();
  PL.kick = 1; PL.pitch += W.kick*(PL.aim ? .6 : 1); PL.yaw += (Math.random() - .5)*W.kick*.5; PL.heat = Math.min(1, (PL.heat || 0) + .08);
  PL.flash.visible = true; PL.flashT = .04; PL.flashL.intensity = 30;
  if (W.rocket){ sfx.rocket(); fireRocket(o, d); if (a[0] <= 0) reload(); return; }
  if (W.launcher){ sfx.shot(); fireGL(o, d); if (a[0] <= 0) reload(); return; }
  sfx.shot();
  const h = ray(o, d, 400, PL.col); if (!h) return;
  const n = h.normal, p = h.point;
  if (h.owner && h.owner.b){
    const c = h.owner, B = c.b; B.hit(c, W.dmg, o); if (NETHOOK.cell) NETHOOK.cell(c, W.dmg);
    if (c.t === 'glass'){ sfx.glass(); return; }
    fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 5, null); fx.dust(p.x, p.y, p.z, .35, 1);
    if (c.alive) fx.decal('hole', p, n, .09 + Math.random()*.05);
  } else if (h.owner && h.owner.target){ h.owner.target.hit(W.dmg, p, 'pl'); PL.hits = .25; }
  else { fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 4, '#5a5650'); fx.dust(p.x, p.y, p.z, .3, 1); fx.decal('hole', p, n, .09); }
}
function fireRocket(o, d){
  const m = new THREE.Mesh(new THREE.ConeGeometry(.06, .3, 8), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, emissive: 0xff8020, emissiveIntensity: .2 }));
  m.position.copy(o).addScaledVector(d, .8); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); E.scene.add(m);
  PL.rockets.push({ m, v: d.clone().multiplyScalar(70), t: 0, o: o.clone() });
}
// granattillsats (M320 HE): granat i båge som exploderar vid träff
function fireGL(o, d){
  const m = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a7a40, roughness: .5 })); m.position.copy(o).addScaledVector(d, .8); E.scene.add(m);
  PL.rockets.push({ m, v: d.clone().multiplyScalar(60), t: 0, o: o.clone(), gl: true });
}
function throwNade(){
  if (PL.gad.gren <= 0) return; PL.gad.gren--; const [o, d] = aimRay();
  const m = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: .7 })); m.castShadow = true; E.scene.add(m);
  const b = PH.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(o.x + d.x*.6, o.y + d.y*.6, o.z + d.z*.6).setCcdEnabled(true));
  PH.world.createCollider(R.ColliderDesc.ball(.06).setDensity(3).setRestitution(.35).setFriction(.8), b);
  b.setLinvel({ x: d.x*16, y: d.y*16 + 3, z: d.z*16 }, true); PL.nades.push({ m, b, t: PL.nade === 'frag' ? 3.2 : 1.8, type: PL.nade });
}
// sprängladdning (R6) fäst på en vägg framför dig, C4 kan fästas överallt (pelare, golv)
function placeCharge(kind){
  if (PL.gad[kind] <= 0) return; const [o, d] = aimRay(), h = ray(o, d, 2.6, PL.col);
  if (!h){ msg('För långt bort – gå närmare en vägg'); return; }
  if (kind === 'breach' && !(h.owner && h.owner.b)){ msg('Sprängladdning fäster bara på väggar och fönster'); return; }
  PL.gad[kind]--; const n = new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z);
  const g = kind === 'breach' ? new THREE.BoxGeometry(.9, 1.4, .05) : new THREE.BoxGeometry(.22, .14, .08);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: kind === 'breach' ? 0x3a3f2a : 0x6a5a3a, roughness: .8 }));
  m.position.set(h.point.x, h.point.y, h.point.z).addScaledVector(n, .03); m.lookAt(m.position.clone().add(n)); m.castShadow = true; E.scene.add(m);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.02, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2010 })); led.position.z = .05; m.add(led);
  PL.charges.push({ kind, m, p: new THREE.Vector3(h.point.x, h.point.y, h.point.z), n }); if (NETHOOK.plant) NETHOOK.plant(kind, PL.charges[PL.charges.length - 1].p.clone().addScaledVector(n, -.3)); sfx.click(); msg(kind === 'breach' ? 'Sprängladdning placerad – [F] spräng' : 'C4 placerad – [F] spräng');
}
function detonate(){
  if (!PL.charges.length) return;
  for (const c of PL.charges){ E.scene.remove(c.m); const p = c.p.clone().addScaledVector(c.n, -.3);
    PL.nextW = c.kind === 'breach' ? 'breach' : 'c4'; if (c.kind === 'breach') explode(p, 1.3, 1700, .7, c.n, true, true, 'pl'); else explode(p, 2.4, 2600, 1.3, c.n, false, true, 'pl'); }
  PL.charges.length = 0;
}
// nätverkskrokar (sätts av net.js): mina sprängningar och skott på byggnader skickas till de andra spelarna
const DEFW = new Set(['mine', 'clay', 'mortar', 'atgm', 'akan']);
export const NETHOOK = { boom: null, cell: null, applying: false, host: null };
export function explode(p, r, dmg, k, n, breach, net, team, seed){
  // online: sprängningens slump styrs av ett frö som följer med i nätverket, så att samma celler förstörs hos alla
  if (seed == null && net && NETHOOK.boom) seed = (Math.random()*2147483647) | 0;
  // vapnet (w) följer med så att servern kan kontrollera sprängningen mot vapnets profil
  // skjutpositionen (o) följer med för RPG så att värden kontrollerar sikten därifrån, inte från där skytten står nu
  const w = PL.nextW, o = PL.nextO; PL.nextW = PL.nextO = null;
  if (net && NETHOOK.boom) NETHOOK.boom(p, r, dmg, k, n, breach, seed, team, w, o);
  // online hos en klient: försvarens skott och minor skadar inte byggnader (bara värdens värld avgör det, se net.js)
  if (net && NETHOOK.host === false && DEFW.has(w)) PL.noBuild = true;
  const noBuild = PL.noBuild; PL.noBuild = false;
  if (noBuild){} else if (seed != null){ let s = (seed >>> 0) || 1; const R0 = Math.random; Math.random = () => (s = (s*16807) % 2147483647)/2147483647; try { blast(p, r, dmg, breach); } finally { Math.random = R0; } } else blast(p, r, dmg, breach); fx.explosion(p.x, p.y, p.z, k); sfx.boom(k, p.distanceTo(E.cam.position));
  const h = ray({ x: p.x, y: p.y + .5, z: p.z }, { x: 0, y: -1, z: 0 }, 1.5); if (h) fx.decal('scorch', h.point, h.normal, 2.4*k);
  // brännmärke bara på en yta som finns kvar efter sprängningen
  if (n){ const o = p.clone().addScaledVector(n, .8), hb = breach ? null : ray(o, { x: -n.x, y: -n.y, z: -n.z }, 1.6); if (hb && hb.owner && hb.owner.b) fx.decal('scorch', hb.point, hb.normal, 1.6*k);
    // sotring runt hålet på väggen som står kvar, och rök som dröjer kvar en stund
    if (breach){ const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, n).normalize();
      for (let i = 0; i < 8; i++){ const a = i/8*6.283 + Math.random()*.4, rr = r*(1.0 + Math.random()*.3), q = p.clone().addScaledVector(n, .9).addScaledVector(side, Math.cos(a)*rr).addScaledVector(up, Math.sin(a)*rr*1.25), h2 = ray(q, { x: -n.x, y: -n.y, z: -n.z }, 1.8); if (h2 && h2.owner && h2.owner.b && h2.owner.t !== 'glass' && h2.toi < 1.05) fx.decal('scorch', h2.point, h2.normal, 2.2 + Math.random()*.8); }
      let t = 0; const iv = setInterval(() => { fxP(0, p.x + n.x*.7 + (Math.random() - .5), p.y - .3 + Math.random(), p.z + n.z*.7 + (Math.random() - .5), { vy: 1 + Math.random(), vx: n.x*.4, vz: n.z*.4, life: 3 + Math.random()*2, s0: .5, s1: 2.6, a: .35, c0: new THREE.Color('#8a8680'), c1: new THREE.Color('#b8b4ac'), drag: .4 }); if ((t += .25) > 6) clearInterval(iv); }, 250); } }
  const d = p.distanceTo(PL.body.translation()); if (d < r*2.4 && team !== 'us'){ PL.hp -= Math.max(0, (1 - d/(r*2.4)))*90*k; PL.dmgT = .6; PL.lastHit = { by: PL.nextCause || 'EXPLOSION', x: p.x, z: p.z }; PL.hurtFrom = { x: p.x, z: p.z, t: 1.2 }; } PL.nextCause = null; PL.shake = Math.max(PL.shake || 0, Math.max(0, 1.4 - d/40)*k);
  // lagets egna sprängningar skadar inte lagkamrater (ingen vådabeskjutning från egna ingenjörer och RPG)
  const ft = team === 'pl' ? 'us' : team;
  for (const t of TARGETS) if (t.alive && t.pos.distanceTo(p) < r*2.2 && !(ft && t.bot && t.bot.team === ft)) t.hit(300, p);
}
export const TARGETS = [];
function msg(s){ PL.msg = s; PL.msgT = 2.2; }
export function updatePlayer(dt){
  if (!PL.on) return;
  // död (BF4): kameran sjunker mot marken, dödsskärm med vem som dödade dig, sedan återuppståndelse
  if (PL.deadT > 0){ PL.deadT -= dt; PL.hp = 0; E.cam.position.y += (PL.deadY - E.cam.position.y)*Math.min(1, dt*3); E.cam.rotation.z += (.35 - E.cam.rotation.z)*Math.min(1, dt*2);
    if (PL.deadT <= 0){ PL.deadT = 0; E.cam.rotation.z = 0; if (PL.vm) PL.vm.visible = true; initPlayer({ ...PL.spawn, re: true }); } return; }
  const k = PL.gun ? {} : PL.keys, w = PH.world;
  // rörelse
  PL.crouch += ((k.KeyC || k.ControlLeft ? 1 : 0) - PL.crouch)*Math.min(1, dt*10);
  PL.sprint = !!k.ShiftLeft && !!k.KeyW && !PL.aim && PL.crouch < .3;
  const sp = (PL.sprint ? 7.4 : PL.crouch > .5 ? 2.2 : PL.aim ? 2.8 : 4.6)*(PL.slowK ?? 1);
  let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), mz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
  const cy = Math.cos(PL.yaw), sy = Math.sin(PL.yaw), vx = (mx*cy - mz*sy)*sp, vz = (-mx*sy - mz*cy)*sp;
  PL.vx = (PL.vx || 0) + (vx - (PL.vx || 0))*Math.min(1, dt*(PL.grounded ? 12 : 2)); PL.vz = (PL.vz || 0) + (vz - (PL.vz || 0))*Math.min(1, dt*(PL.grounded ? 12 : 2));
  PL.vy -= 18*dt; if (PL.grounded && PL.vy < 0) PL.vy = -1; if (k.Space && PL.grounded && PL.crouch < .3){ PL.vy = 5.6; PL.grounded = false; }
  PL.col.setHalfHeight(.55 - .3*PL.crouch);
  PL.cc.computeColliderMovement(PL.col, { x: PL.vx*dt, y: PL.vy*dt, z: PL.vz*dt });
  const mv = PL.cc.computedMovement(), t = PL.body.translation(); PL.grounded = PL.cc.computedGrounded();
  if (mv.y > PL.vy*dt + .001 && PL.vy > 0) PL.vy = 0;
  const nt = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }; PL.body.setNextKinematicTranslation(nt);
  PL.speed = Math.hypot(PL.vx, PL.vz); PL.bob += dt*PL.speed*(PL.sprint ? 1.4 : 1.8);
  // föll ut ur världen: räknas som en vanlig död (dödsskärm, 'dead' online, ammunition fylls på först vid återuppståndelsen)
  if (nt.y < -30 && PL.hp > 0){ PL.hp = 0; PL.dmgT = 1; PL.lastHit = { by: 'FALL' }; }
  // kamera
  const eyeH = 1.55 - .55*PL.crouch, sh = PL.shake || 0; PL.shake = Math.max(0, sh - dt*1.8);
  E.cam.position.set(nt.x + (Math.random() - .5)*sh*.12, nt.y + eyeH - .55 + Math.sin(PL.bob*2)*.025*Math.min(1, PL.speed/4), nt.z + (Math.random() - .5)*sh*.12);
  E.cam.rotation.set(PL.pitch, PL.yaw, 0, 'YXZ');
  const fovT = PL.aim ? (WEAPONS[PL.slot].scope ? 16 : PL.slot === 'rpg' || PL.slot === 'gl' ? 45 : 52) : PL.sprint ? 78 : 70; E.cam.fov += (fovT - E.cam.fov)*Math.min(1, dt*12); E.cam.updateProjectionMatrix();
  // bemannat vapen: kameran och siktet följer vapnet (defense.js)
  if (PL.gun && PL.mountUpdate) PL.mountUpdate(dt);
  followSun(nt);
  // vapen
  PL.fireT = Math.max(0, PL.fireT - dt); PL.heat = Math.max(0, (PL.heat || 0) - dt*1.5); PL.swapT = Math.max(0, (PL.swapT || 0) - dt);
  if (PL.rel > 0){ PL.rel -= dt; if (PL.rel <= 0){ const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot], n = Math.min(W.mag - a[0], a[1]); a[0] += n; a[1] -= n; sfx.click(); } }
  if (PL.trig && !PL.sprint && !PL.gun) fire(dt);
  if (PL.flashT > 0){ PL.flashT -= dt; if (PL.flashT <= 0){ PL.flash.visible = false; PL.flashL.intensity = 0; } }
  PL.kick *= Math.exp(-dt*14);
  const aim = PL.aim ? 1 : 0; PL.aimK = (PL.aimK || 0) + (aim - (PL.aimK || 0))*Math.min(1, dt*12);
  const relA = PL.rel > 0 ? Math.sin(Math.PI*(1 - PL.rel/PL.relMax)) : 0, sw = PL.swapT > 0 ? PL.swapT/.35 : 0;
  PL.vm.position.set(.17*(1 - PL.aimK) + Math.sin(PL.bob)*.01*(1 - PL.aimK), -.172 + .099*PL.aimK + Math.abs(Math.cos(PL.bob))*.008 - relA*.12 - sw*.3 - (PL.sprint ? .05 : 0), -.36 + PL.kick*.04 + PL.aimK*.1);
  PL.vm.rotation.set(PL.kick*.06 + relA*.5, PL.sprint ? .6 : .09*(1 - PL.aimK), PL.sprint ? .25 : relA*.4);
  // raketer
  for (let i = PL.rockets.length - 1; i >= 0; i--){
    const r = PL.rockets[i]; r.t += dt; const step = r.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().normalize();
    const h = ray(r.m.position, dir, len, PL.col);
    if (!r.gl){ fx.smoke(r.m.position.x, r.m.position.y, r.m.position.z, .25, false); fx.fire(r.m.position.x, r.m.position.y, r.m.position.z, .25); }
    if (h || r.t > 4){ const p = h ? new THREE.Vector3(h.point.x, h.point.y, h.point.z) : r.m.position.clone(); E.scene.remove(r.m); PL.rockets.splice(i, 1); PL.nextO = r.o; if (r.gl){ PL.nextW = 'gl'; explode(p, 2.6, 520, .9, h ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : null, false, true, 'pl'); continue; } PL.nextW = 'rpg'; explode(p, 2.2, 1500, 1.2, h ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : null, false, true, 'pl'); continue; }
    r.m.position.add(step); r.v.y -= (r.gl ? 9.8 : 1.5)*dt;
  }
  // granater
  for (let i = PL.nades.length - 1; i >= 0; i--){
    const g = PL.nades[i], tr = g.b.translation(); g.m.position.set(tr.x, tr.y, tr.z); g.t -= dt;
    if (g.t <= 0 && g.type !== 'frag' && PL.onNade){ E.scene.remove(g.m); w.removeRigidBody(g.b); PL.nades.splice(i, 1); PL.onNade(g.type, new THREE.Vector3(tr.x, tr.y + .1, tr.z)); continue; }
    if (g.t <= 0){ E.scene.remove(g.m); w.removeRigidBody(g.b); PL.nades.splice(i, 1); PL.nextW = 'gren'; explode(new THREE.Vector3(tr.x, tr.y + .1, tr.z), 3.2, 340, .8, null, false, true, 'pl'); }
  }
  if (PL.hp < 100) PL.hp = Math.min(100, PL.hp + dt*(PL.dmgT > 0 ? 0 : 6)); PL.dmgT = Math.max(0, (PL.dmgT || 0) - dt);
  if (PL.hp <= 0 && PL.gun && PL.mountExit) PL.mountExit();
  if (PL.hp <= 0){ PL.hp = 0; PL.deadT = 4; PL.deadY = E.cam.position.y - 1.2; const t = PL.body.translation(), L = PL.lastHit || { by: 'OKÄND' }; PL.death = { by: L.by, d: L.x != null ? Math.round(Math.hypot(L.x - t.x, L.z - t.z)) : null }; if (PL.vm) PL.vm.visible = false; PL.msg = null; return; }
  PL.hits = Math.max(0, PL.hits - dt); if (PL.msgT > 0){ PL.msgT -= dt; if (PL.msgT <= 0) PL.msg = null; }
}
// test: bygg om händerna efter att HP ändrats (används för att finjustera greppet)
export function rebuildHands(){
  const g = PL.vm; if (!g) return; for (const k of ['handR', 'handL']) if (PL[k]) g.remove(PL[k]);
  const HM = handMats();
  PL.handR = orient(makeHand(HP.r.pose, HP.r.thumb, -1, HM), new THREE.Vector3(...HP.r.fy), new THREE.Vector3(...HP.r.bz), new THREE.Vector3(...HP.r.p)); g.add(PL.handR);
  PL.handL = orient(makeHand(HP.l.pose, HP.l.thumb, 1, HM), new THREE.Vector3(...HP.l.fy), new THREE.Vector3(...HP.l.bz), new THREE.Vector3(...HP.l.p)); g.add(PL.handL);
}
