// SPELAREN – förstapersonsstyrning med Rapiers karaktärsstyrning, vapen, raketgevär, granater, sprängladdning (R6) och C4.
import * as THREE from 'three';
import { E, followSun } from './engine.js';
import { R, PH, ray, own } from './physics.js';
import { fx, P as fxP } from './fx.js';
import { sfx, audioOn } from './audio.js';
import { blast } from './destruct.js';

export const WEAPONS = {
  ak:  { name: 'AK-12', mag: 30, res: 150, rpm: 650, dmg: 34, spread: .0025, kick: .011, modes: ['AUTO', 'SINGEL'], reload: 2.3 },
  rpg: { name: 'RPG-7V2', mag: 1, res: 5, rpm: 30, dmg: 0, spread: 0, kick: .05, modes: ['SINGEL'], reload: 3.2, rocket: true },
};
export const GADGETS = { gren: { name: 'M67 GRANAT', n: 3 }, breach: { name: 'SPRÄNGLADDNING', n: 3 }, c4: { name: 'C4', n: 3 } };

export const PL = { on: false, yaw: 0, pitch: 0, vy: 0, crouch: 0, hp: 100, keys: {}, slot: 'ak', ammo: {}, mode: {}, fireT: 0, rel: 0, kick: 0, sprint: false, charges: [], nades: [], rockets: [], gad: {}, hits: 0, msg: null, bob: 0 };

export function initPlayer(spawn){
  if (!spawn.re) PL.spawn = spawn;
  const w = PH.world;
  if (PL.body){ w.removeRigidBody(PL.body); }
  PL.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + 1, spawn.z));
  PL.col = own(w.createCollider(R.ColliderDesc.capsule(.55, .32), PL.body), { player: true });
  if (!PL.cc){ PL.cc = w.createCharacterController(.02); PL.cc.enableAutostep(.45, .2, true); PL.cc.enableSnapToGround(.35); PL.cc.setMaxSlopeClimbAngle(50*Math.PI/180); PL.cc.setApplyImpulsesToDynamicBodies(true); }
  for (const k in WEAPONS){ PL.ammo[k] = [WEAPONS[k].mag, WEAPONS[k].res]; PL.mode[k] = 0; }
  for (const k in GADGETS) PL.gad[k] = GADGETS[k].n;
  PL.hp = 100; PL.slowK = 1; PL.hurtFrom = null; PL.yaw = spawn.yaw || 0; PL.pitch = 0; PL.vy = 0; PL.on = true; PL.slot = 'ak';
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
  const wr = wearR(); wr.repeat.set(4, 4); const metal = new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 1, roughnessMap: wr, metalness: .9, envMapIntensity: 2.2 }), dark = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 1, roughnessMap: wr, metalness: .85, envMapIntensity: 2.2 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x3a3b35, roughness: .58, metalness: .05, envMapIntensity: 1.6 }), lens = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: .05, metalness: .9, emissive: 0x112211 });
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
  gun.rotation.y = -Math.PI/2; gun.scale.setScalar(.78); return gun;
}
function makeViewmodel(){
  const g = PL.vm = new THREE.Group(), gun = buildAK(); g.add(gun);
  const fn = fabricN(); fn.repeat.set(5, 5);
  const camo = canvasTex((x, n) => { x.fillStyle = '#5a5c46'; x.fillRect(0, 0, n, n); const cols = ['#6e6a50', '#47493a', '#7c7458', '#3a3d32']; for (let i = 0; i < 70; i++){ x.fillStyle = cols[i % 4]; x.beginPath(); const cx = Math.random()*n, cy = Math.random()*n; x.ellipse(cx, cy, 8 + Math.random()*26, 5 + Math.random()*14, Math.random()*3, 0, 7); x.fill(); } }); camo.colorSpace = THREE.SRGBColorSpace; camo.repeat.set(2, 2); const glove = new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: .82, normalMap: fn, normalScale: new THREE.Vector2(.5, .5) }), sleeve = new THREE.MeshStandardMaterial({ map: camo, roughness: .95, normalMap: fn, normalScale: new THREE.Vector2(1.2, 1.2) });
  // högerhand på greppet, vänsterhand under handskyddet, ärmar mot kameran
  const hand = (x, y, z, rx, rz, slv) => { const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.set(rx, 0, rz); g.add(h);
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(.026, .05, 4, 10), glove); palm.rotation.x = Math.PI/2; h.add(palm);
    for (let i = 0; i < 4; i++){ const f = new THREE.Mesh(new THREE.CapsuleGeometry(.009, .03, 3, 6), glove); f.position.set(-.024, -.01 + i*.0, -.03 + i*.018); f.rotation.z = .9; h.add(f); }
    if (slv){ const s = new THREE.Mesh(new THREE.CylinderGeometry(.04, .048, .26, 12), sleeve); s.rotation.x = Math.PI/2; s.position.set(.01, -.01, .16); h.add(s); const cuff = new THREE.Mesh(new THREE.TorusGeometry(.04, .008, 6, 14), glove); cuff.position.set(.01, -.01, .035); h.add(cuff); } return h; };
  hand(.005, -.066, .05, -.25, .15, true); hand(-.03, -.045, -.2, .1, -.85, true);
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
    if (e.code === 'Digit1') swap('ak'); if (e.code === 'Digit2') swap('rpg');
    if (e.code === 'KeyR') reload(); if (e.code === 'KeyB'){ const W = WEAPONS[PL.slot]; PL.mode[PL.slot] = (PL.mode[PL.slot] + 1) % W.modes.length; sfx.click(); }
    if (e.code === 'KeyG') throwNade(); if (e.code === 'KeyX') placeCharge('breach'); if (e.code === 'KeyV') placeCharge('c4'); if (e.code === 'KeyF') detonate();
  });
  addEventListener('keyup', e => { PL.keys[e.code] = false; });
  canvas.addEventListener('mousedown', e => { audioOn(); if (!PL.on) return; if (document.pointerLockElement !== canvas){ canvas.requestPointerLock(); return; } if (e.button === 0){ PL.trig = true; PL.trigNew = true; } if (e.button === 2) PL.aim = true; });
  addEventListener('mouseup', e => { if (e.button === 0) PL.trig = false; if (e.button === 2) PL.aim = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (document.pointerLockElement !== canvas || !PL.on) return; const s = .0022*(PL.aim ? .55 : 1); PL.yaw -= e.movementX*s; PL.pitch = Math.max(-1.5, Math.min(1.5, PL.pitch - e.movementY*s)); });
}
function swap(k){ if (PL.slot === k) return; PL.slot = k; PL.rel = 0; PL.swapT = .35; PL.rpgM.visible = k === 'rpg'; PL.vm.children.forEach(o => { if (o !== PL.rpgM && o !== PL.flash) o.visible = k !== 'rpg'; }); }
function reload(){ const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot]; if (PL.rel > 0 || a[0] >= W.mag || a[1] <= 0) return; PL.rel = W.reload; PL.relMax = W.reload; }
const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
export function aimRay(){ E.cam.getWorldPosition(eye); E.cam.getWorldDirection(fwd); return [eye.clone(), fwd.clone()]; }
function fire(dt){
  const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot];
  if (PL.rel > 0 || PL.swapT > 0) return; if (a[0] <= 0){ if (PL.trigNew) { sfx.click(); reload(); } PL.trigNew = false; return; }
  const single = W.modes[PL.mode[PL.slot]] === 'SINGEL'; if (single && !PL.trigNew) return; PL.trigNew = false;
  if (PL.fireT > 0) return; PL.fireT = 60/W.rpm; a[0]--;
  const [o, d] = aimRay(), moving = (PL.speed || 0) > .5, sp = W.spread*(PL.aim ? .35 : 1)*(moving ? 2.5 : 1)*(1 + PL.heat*2);
  d.x += (Math.random() - .5)*sp*2; d.y += (Math.random() - .5)*sp*2; d.z += (Math.random() - .5)*sp*2; d.normalize();
  PL.kick = 1; PL.pitch += W.kick*(PL.aim ? .6 : 1); PL.yaw += (Math.random() - .5)*W.kick*.5; PL.heat = Math.min(1, (PL.heat || 0) + .08);
  PL.flash.visible = true; PL.flashT = .04; PL.flashL.intensity = 30;
  if (W.rocket){ sfx.rocket(); fireRocket(o, d); if (a[0] <= 0) reload(); return; }
  sfx.shot();
  const h = ray(o, d, 400, PL.col); if (!h) return;
  const n = h.normal, p = h.point;
  if (h.owner && h.owner.b){
    const c = h.owner, B = c.b; B.hit(c, W.dmg, o);
    if (c.t === 'glass'){ sfx.glass(); return; }
    fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 5, null); fx.dust(p.x, p.y, p.z, .35, 1);
    if (c.alive) fx.decal('hole', p, n, .09 + Math.random()*.05);
  } else if (h.owner && h.owner.target){ h.owner.target.hit(W.dmg, p); PL.hits = .25; }
  else { fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 4, '#5a5650'); fx.dust(p.x, p.y, p.z, .3, 1); fx.decal('hole', p, n, .09); }
}
function fireRocket(o, d){
  const m = new THREE.Mesh(new THREE.ConeGeometry(.06, .3, 8), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, emissive: 0xff8020, emissiveIntensity: .2 }));
  m.position.copy(o).addScaledVector(d, .8); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); E.scene.add(m);
  PL.rockets.push({ m, v: d.clone().multiplyScalar(70), t: 0 });
}
function throwNade(){
  if (PL.gad.gren <= 0) return; PL.gad.gren--; const [o, d] = aimRay();
  const m = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: .7 })); m.castShadow = true; E.scene.add(m);
  const b = PH.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(o.x + d.x*.6, o.y + d.y*.6, o.z + d.z*.6).setCcdEnabled(true));
  PH.world.createCollider(R.ColliderDesc.ball(.06).setDensity(3).setRestitution(.35).setFriction(.8), b);
  b.setLinvel({ x: d.x*16, y: d.y*16 + 3, z: d.z*16 }, true); PL.nades.push({ m, b, t: 3.2 });
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
  PL.charges.push({ kind, m, p: new THREE.Vector3(h.point.x, h.point.y, h.point.z), n }); sfx.click(); msg(kind === 'breach' ? 'Sprängladdning placerad – [F] spräng' : 'C4 placerad – [F] spräng');
}
function detonate(){
  if (!PL.charges.length) return;
  for (const c of PL.charges){ E.scene.remove(c.m); const p = c.p.clone().addScaledVector(c.n, -.3);
    if (c.kind === 'breach') explode(p, 1.3, 1700, .7, c.n, true); else explode(p, 2.4, 2600, 1.3, c.n); }
  PL.charges.length = 0;
}
export function explode(p, r, dmg, k, n, breach){
  blast(p, r, dmg, breach); fx.explosion(p.x, p.y, p.z, k); sfx.boom(k, p.distanceTo(E.cam.position));
  const h = ray({ x: p.x, y: p.y + .5, z: p.z }, { x: 0, y: -1, z: 0 }, 1.5); if (h) fx.decal('scorch', h.point, h.normal, 2.4*k);
  // brännmärke bara på en yta som finns kvar efter sprängningen
  if (n){ const o = p.clone().addScaledVector(n, .8), hb = breach ? null : ray(o, { x: -n.x, y: -n.y, z: -n.z }, 1.6); if (hb && hb.owner && hb.owner.b) fx.decal('scorch', hb.point, hb.normal, 1.6*k);
    // sotring runt hålet på väggen som står kvar, och rök som dröjer kvar en stund
    if (breach){ const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, n).normalize();
      for (let i = 0; i < 8; i++){ const a = i/8*6.283 + Math.random()*.4, rr = r*(1.0 + Math.random()*.3), q = p.clone().addScaledVector(n, .9).addScaledVector(side, Math.cos(a)*rr).addScaledVector(up, Math.sin(a)*rr*1.25), h2 = ray(q, { x: -n.x, y: -n.y, z: -n.z }, 1.8); if (h2 && h2.owner && h2.owner.b && h2.owner.t !== 'glass' && h2.toi < 1.05) fx.decal('scorch', h2.point, h2.normal, 2.2 + Math.random()*.8); }
      let t = 0; const iv = setInterval(() => { fxP(0, p.x + n.x*.7 + (Math.random() - .5), p.y - .3 + Math.random(), p.z + n.z*.7 + (Math.random() - .5), { vy: 1 + Math.random(), vx: n.x*.4, vz: n.z*.4, life: 3 + Math.random()*2, s0: .5, s1: 2.6, a: .35, c0: new THREE.Color('#8a8680'), c1: new THREE.Color('#b8b4ac'), drag: .4 }); if ((t += .25) > 6) clearInterval(iv); }, 250); } }
  const d = p.distanceTo(PL.body.translation()); if (d < r*2.4){ PL.hp -= Math.max(0, (1 - d/(r*2.4)))*90*k; PL.dmgT = .6; } PL.shake = Math.max(PL.shake || 0, Math.max(0, 1.4 - d/40)*k);
  for (const t of TARGETS) if (t.alive && t.pos.distanceTo(p) < r*2.2) t.hit(300, p);
}
export const TARGETS = [];
function msg(s){ PL.msg = s; PL.msgT = 2.2; }
export function updatePlayer(dt){
  if (!PL.on) return;
  const k = PL.keys, w = PH.world;
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
  if (nt.y < -30) initPlayer({ ...PL.spawn, re: true });
  // kamera
  const eyeH = 1.55 - .55*PL.crouch, sh = PL.shake || 0; PL.shake = Math.max(0, sh - dt*1.8);
  E.cam.position.set(nt.x + (Math.random() - .5)*sh*.12, nt.y + eyeH - .55 + Math.sin(PL.bob*2)*.025*Math.min(1, PL.speed/4), nt.z + (Math.random() - .5)*sh*.12);
  E.cam.rotation.set(PL.pitch, PL.yaw, 0, 'YXZ');
  const fovT = PL.aim ? (PL.slot === 'rpg' ? 45 : 52) : PL.sprint ? 78 : 70; E.cam.fov += (fovT - E.cam.fov)*Math.min(1, dt*12); E.cam.updateProjectionMatrix();
  followSun(nt);
  // vapen
  PL.fireT = Math.max(0, PL.fireT - dt); PL.heat = Math.max(0, (PL.heat || 0) - dt*1.5); PL.swapT = Math.max(0, (PL.swapT || 0) - dt);
  if (PL.rel > 0){ PL.rel -= dt; if (PL.rel <= 0){ const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot], n = Math.min(W.mag - a[0], a[1]); a[0] += n; a[1] -= n; sfx.click(); } }
  if (PL.trig && !PL.sprint) fire(dt);
  if (PL.flashT > 0){ PL.flashT -= dt; if (PL.flashT <= 0){ PL.flash.visible = false; PL.flashL.intensity = 0; } }
  PL.kick *= Math.exp(-dt*14);
  const aim = PL.aim ? 1 : 0; PL.aimK = (PL.aimK || 0) + (aim - (PL.aimK || 0))*Math.min(1, dt*12);
  const relA = PL.rel > 0 ? Math.sin(Math.PI*(1 - PL.rel/PL.relMax)) : 0, sw = PL.swapT > 0 ? PL.swapT/.35 : 0;
  PL.vm.position.set(.22*(1 - PL.aimK) + Math.sin(PL.bob)*.01*(1 - PL.aimK), -.2 + .127*PL.aimK + Math.abs(Math.cos(PL.bob))*.008 - relA*.12 - sw*.3 - (PL.sprint ? .05 : 0), -.36 + PL.kick*.04 + PL.aimK*.1);
  PL.vm.rotation.set(PL.kick*.06 + relA*.5, PL.sprint ? .6 : .09*(1 - PL.aimK), PL.sprint ? .25 : relA*.4);
  // raketer
  for (let i = PL.rockets.length - 1; i >= 0; i--){
    const r = PL.rockets[i]; r.t += dt; const step = r.v.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().normalize();
    const h = ray(r.m.position, dir, len, PL.col);
    fx.smoke(r.m.position.x, r.m.position.y, r.m.position.z, .25, false); fx.fire(r.m.position.x, r.m.position.y, r.m.position.z, .25);
    if (h || r.t > 4){ const p = h ? new THREE.Vector3(h.point.x, h.point.y, h.point.z) : r.m.position.clone(); E.scene.remove(r.m); PL.rockets.splice(i, 1); explode(p, 2.2, 1500, 1.2, h ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : null); continue; }
    r.m.position.add(step); r.v.y -= 1.5*dt;
  }
  // granater
  for (let i = PL.nades.length - 1; i >= 0; i--){
    const g = PL.nades[i], tr = g.b.translation(); g.m.position.set(tr.x, tr.y, tr.z); g.t -= dt;
    if (g.t <= 0){ E.scene.remove(g.m); w.removeRigidBody(g.b); PL.nades.splice(i, 1); explode(new THREE.Vector3(tr.x, tr.y + .1, tr.z), 3.2, 340, .8); }
  }
  if (PL.hp < 100) PL.hp = Math.min(100, PL.hp + dt*(PL.dmgT > 0 ? 0 : 6)); PL.dmgT = Math.max(0, (PL.dmgT || 0) - dt);
  if (PL.hp <= 0){ msg('Du dog – återuppstår'); initPlayer({ ...PL.spawn, re: true }); }
  PL.hits = Math.max(0, PL.hits - dt); if (PL.msgT > 0){ PL.msgT -= dt; if (PL.msgT <= 0) PL.msg = null; }
}
