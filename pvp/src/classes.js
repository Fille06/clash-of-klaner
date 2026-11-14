// KLASSERNAS PRYLAR (BF4-stil, se Obsidian Artifacts/Battlefield4): förbandslåda och defibrillator (Anfall = läkaren),
// reparationsverktyg (Ingenjör), ammunitionslåda och claymore (Understöd), rörelsesensor och radiofyr (Spanare),
// rök- och bländgranater för alla, och spotting [Q] som markerar fiender för laget.
// Online skickas utplacerade prylar som 'dep' och återupplivning som 'rev' (net.js); varje spelare räknar sin egen hälsa och ammunition.
import * as THREE from 'three';
import { E } from './engine.js';
import { ray } from './physics.js';
import { fx } from './fx.js';
import { sfx } from './audio.js';
import { PL, TARGETS, WEAPONS, NADES, CLASSES, aimRay, NETHOOK } from './player.js';
import { BOTS, botRevive } from './bots.js';
import { DEF, defMake } from './defense.js';
import { SMOKES } from './smoke.js';
import { hAt, T } from './terrain.js';

export const CL = { deps: [], spots: [], flashT: 0, cool: 0 };
const msg = s => { PL.msg = s; PL.msgT = 2.2; };
const mats = {};
const mat = (c, e) => mats[c] || (mats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: .8, emissive: e || 0x000000, emissiveIntensity: e ? .8 : 0 }));
const LIFE = { med: 30, ammo: 40, sensor: 30, beacon: 1e9 };
const RAD = { med: 4.5, ammo: 4.5 };

// ── utplacerade prylar ─────────────────────────────────────────────────────
function depMesh(kind){
  const g = new THREE.Group();
  if (kind === 'med' || kind === 'ammo'){
    const box = new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .34), mat(kind === 'med' ? 0x4a5a3a : 0x5a5030)); box.position.y = .14; box.castShadow = true; g.add(box);
    const c = mat(kind === 'med' ? 0xd8d4c8 : 0xc8a040);
    if (kind === 'med'){ for (const [w, d] of [[.22, .06], [.06, .22]]){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, .01, d), c); m.position.y = .285; g.add(m); } }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(.36, .02, .06), c); m.position.y = .285; g.add(m); }
  } else if (kind === 'sensor'){
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, .22, 8), mat(0x3a3d32)); b.position.y = .11; g.add(b);
    const led = new THREE.Mesh(new THREE.SphereGeometry(.025, 6, 5), mat(0x40ff60, 0x40ff60)); led.position.y = .24; g.add(led); g.userData.led = led;
  } else if (kind === 'beacon'){
    const b = new THREE.Mesh(new THREE.BoxGeometry(.28, .32, .18), mat(0x3a3d32)); b.position.y = .16; b.castShadow = true; g.add(b);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .9, 4), mat(0x202020)); ant.position.set(.08, .75, 0); g.add(ant);
    const led = new THREE.Mesh(new THREE.SphereGeometry(.025, 6, 5), mat(0xff4030, 0xff4030)); led.position.set(-.06, .34, .1); g.add(led); g.userData.led = led;
  }
  return g;
}
export function addDep(kind, p, team, mine, rot){
  if (kind === 'clay'){
    const d = defMake({ t: 'claymore', x: p.x, z: p.z, y: p.y, rot: rot || 0, side: team }, { w: 1, d: 1 }, null); d.armT = 0;
    CL.deps.push({ kind, team, d, mine, alive: true, t: 1e9, p: d.pos }); return;
  }
  const m = depMesh(kind); m.position.copy(p); m.rotation.y = rot || 0; E.scene.add(m);
  const D = { kind, team, m, p: m.position, t: LIFE[kind] || 30, mine, alive: true, tick: 0 };
  // kan förstöras av sprängningar och skott
  D.target = { alive: true, pos: D.p, hit: (dmg) => { if (dmg >= 60) depKill(D); } }; TARGETS.push(D.target);
  CL.deps.push(D);
}
function depKill(D){ if (!D.alive) return; D.alive = false; if (D.target) D.target.alive = false; if (D.m) E.scene.remove(D.m); }
// var placeras saken: på marken framför spelaren (eller dit siktet pekar, för sensorn)
function groundAhead(dist){
  const [o, d] = aimRay(), h = ray(o, d, dist, PL.col); let p;
  if (h) p = new THREE.Vector3(h.point.x, h.point.y, h.point.z); else { const t = PL.body.translation(); p = new THREE.Vector3(t.x - Math.sin(PL.yaw)*1.2, 0, t.z - Math.cos(PL.yaw)*1.2); }
  const g = ray({ x: p.x, y: p.y + .6, z: p.z }, { x: 0, y: -1, z: 0 }, 6, PL.col); p.y = g ? g.point.y : Math.max(hAt(p.x, p.z), T.sea);
  return p;
}

// ── tangenterna X/V/Z ──────────────────────────────────────────────────────
PL.onGadget = (g) => {
  if (!PL.body || PL.deadT > 0 || CL.cool > 0) return;
  if (g === 'repair') return; // hålls nere – sköts i updateClasses
  if (g === 'defib') return defib();
  if (!(PL.gad[g] > 0)){ msg('Slut på ' + ({ med: 'förbandslådor', ammo: 'ammolådor', clay: 'claymore', sensor: 'sensorer', beacon: 'radiofyrar' }[g] || 'prylar')); return; }
  CL.cool = .5;
  if (g === 'beacon'){ for (const D of CL.deps) if (D.kind === 'beacon' && D.mine) depKill(D); } // en egen radiofyr åt gången
  const p = g === 'sensor' ? groundAhead(18) : groundAhead(1.6), rot = g === 'clay' ? ((Math.round((PL.yaw + Math.PI)/(Math.PI/2)) % 4) + 4) % 4 : PL.yaw;
  if (g !== 'sensor' && p.distanceTo(PL.body.translation()) > 4){ msg('För långt bort'); return; }
  PL.gad[g]--; addDep(g, p, 'us', true, rot); sfx.click();
  if (NETHOOK.dep) NETHOOK.dep(g, p, rot);
  msg({ med: 'Förbandslåda utlagd', ammo: 'Ammolåda utlagd', clay: 'Claymore utlagd – riktad framåt', sensor: 'Sensor utkastad', beacon: 'Radiofyr utlagd – gruppen återuppstår här' }[g]);
};
// återuppståndelse vid egen radiofyr
PL.spawnAt = () => { const D = CL.deps.find(x => x.kind === 'beacon' && x.mine && x.alive); if (!D) return null; return { x: D.p.x + .8, y: D.p.y, z: D.p.z }; };

// defibrillator: återupplivar en fallen lagkamrat (AI-soldat eller spelare) inom 2,5 m
function defib(){
  if (!PL.body) return; const t = PL.body.translation(); CL.cool = 1.2;
  const bot = BOTS.list.find(b => b.team === 'us' && !b.alive && (b.proxy || b.respawn > 0) && Math.hypot(b.pos.x - t.x, b.pos.z - t.z) < 2.5);
  if (bot){ if (bot.proxy){ if (NETHOOK.rev) NETHOOK.rev({ bot: bot.id }); } else { botRevive(bot); BOTS.tickets.us++; } sfx.click(); msg('Lagkamrat återupplivad'); return; }
  const peer = (BOTS.peers || []).find(p => p.team === 'us' && p.dead && Math.hypot(p.pos.x - t.x, p.pos.z - t.z) < 2.5);
  if (peer){ if (NETHOOK.rev) NETHOOK.rev({ to: peer.id }); sfx.click(); msg('Lagkamrat återupplivad'); return; }
  msg('Ingen fallen lagkamrat nära');
}
// återupplivad av en lagkamrat (online): reser sig där man föll
PL.revive = () => { if (!(PL.deadT > 0)) return; PL.deadT = 0; PL.hp = 60; E.cam.rotation.z = 0; if (PL.vm) PL.vm.visible = true; msg('Du blev återupplivad'); };

// ── spotting [Q] ───────────────────────────────────────────────────────────
function enemies(){
  const L = [];
  for (const b of BOTS.list) if (b.team === 'them' && b.alive) L.push({ ref: b, p: b.pos, y: 1.2 });
  for (const p of BOTS.peers || []) if (p.team === 'them' && !p.dead) L.push({ ref: p, p: p.pos, y: .3 });
  for (const d of DEF.list) if (d.kind === 'gun' && d.alive && d.it && d.it.side === 'them') L.push({ ref: d, p: d.pos, y: 0 });
  return L;
}
export function spot(ref, p, y, t){ const s = CL.spots.find(x => x.ref === ref); if (s){ s.t = Math.max(s.t, t); return; } CL.spots.push({ ref, p, y, t }); }
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
PL.onSpot = () => {
  if (!PL.body || PL.deadT > 0) return; const [o, d] = aimRay(); let best = null, ba = .06;
  for (const e of enemies()){ _a.set(e.p.x, e.p.y + e.y, e.p.z).sub(o); const L = _a.length(); if (L > 350) continue; _a.multiplyScalar(1/L); const ang = Math.acos(Math.min(1, _a.dot(d))); if (ang > ba) continue;
    const h = ray(o, _a, L, PL.col); if (h && h.toi < L - 1.6) continue; best = e; ba = ang; }
  if (best){ spot(best.ref, best.p, best.y, 8); sfx.click(); msg('Fiende spottad'); if (NETHOOK.spot) NETHOOK.spot(best.p); }
};

// ── rök- och bländgranater ─────────────────────────────────────────────────
export function addSmoke(p){ SMOKES.push({ x: p.x, y: p.y + 1.2, z: p.z, r: 6, t: 22, age: 0, puff: 0 }); }
export function doFlash(p){
  fx.sparks && fx.sparks(p.x, p.y + .2, p.z, 0, 1, 0, 14); sfx.boom && sfx.boom(.35, p.distanceTo(E.cam.position));
  if (PL.body && PL.hp > 0){ const t = PL.body.translation(), dd = Math.hypot(t.x - p.x, t.z - p.z);
    if (dd < 14){ const [o, d] = aimRay(); _b.set(p.x - o.x, p.y + .2 - o.y, p.z - o.z); const L = _b.length(); _b.multiplyScalar(1/L); const h = ray(o, _b, L, PL.col);
      if (!h || h.toi > L - .6) CL.flashT = Math.max(CL.flashT, (_b.dot(d) > .2 ? 3.2 : 1.2)*(1 - dd/16)); } }
  for (const b of BOTS.list) if (b.alive && !b.proxy && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 11) b.blindT = 3;
}
PL.onNade = (type, p) => { if (type === 'smoke') addSmoke(p); else if (type === 'flash') doFlash(p); if (NETHOOK.dep) NETHOOK.dep(type, p, 0); };

// ── online: en annan spelares pryl ─────────────────────────────────────────
export function netDep(kind, p, team, rot){
  if (kind === 'smoke') return addSmoke(p);
  if (kind === 'flash') return doFlash(p);
  if (['med', 'ammo', 'sensor', 'beacon', 'clay'].includes(kind)) addDep(kind, p, team, false, rot);
}

// ── varje bildruta ─────────────────────────────────────────────────────────
export function classesReset(){ for (const D of CL.deps) depKill(D); CL.deps.length = 0; CL.spots.length = 0; SMOKES.length = 0; CL.flashT = 0; }
export function updateClasses(dt){
  CL.cool = Math.max(0, CL.cool - dt); CL.flashT = Math.max(0, CL.flashT - dt);
  // rök
  for (let i = SMOKES.length - 1; i >= 0; i--){ const s = SMOKES[i]; s.age += dt; s.t -= dt; s.puff -= dt;
    if (s.puff <= 0 && s.t > 3){ s.puff = .22; const r = Math.min(1, s.age/1.5)*s.r; for (let k = 0; k < 3; k++){ const a = Math.random()*6.28, q = Math.random()*r*.8; fx.smoke(s.x + Math.cos(a)*q, s.y - 1 + Math.random()*1.5, s.z + Math.sin(a)*q, 1.6, false); } }
    if (s.t <= 0) SMOKES.splice(i, 1); }
  const t = PL.body && PL.hp > 0 && !(PL.deadT > 0) ? PL.body.translation() : null;
  for (let i = CL.deps.length - 1; i >= 0; i--){ const D = CL.deps[i];
    if (D.kind === 'clay'){ if (!D.d.alive){ CL.deps.splice(i, 1); } continue; }
    if (!D.alive){ CL.deps.splice(i, 1); continue; }
    D.t -= dt; if (D.t <= 0){ depKill(D); continue; }
    if (D.m.userData.led) D.m.userData.led.visible = (E.time*2 % 1) < .5;
    const near = t && D.team === 'us' && Math.hypot(t.x - D.p.x, t.z - D.p.z) < RAD[D.kind] && Math.abs(t.y - .9 - D.p.y) < 2.5;
    if (D.kind === 'med'){
      if (near && PL.hp < 100){ PL.hp = Math.min(100, PL.hp + 14*dt); }
      for (const b of BOTS.list) if (b.alive && !b.proxy && b.team === D.team && b.hp < 100 && Math.hypot(b.pos.x - D.p.x, b.pos.z - D.p.z) < RAD.med) b.hp = Math.min(100, b.hp + 14*dt);
    }
    if (D.kind === 'ammo' && near){ D.tick -= dt; if (D.tick <= 0){ D.tick = 2.5; if (resupply()) sfx.click(); } }
    if (D.kind === 'sensor' && D.team === 'us'){ D.tick -= dt; if (D.tick <= 0){ D.tick = .5; for (const e of enemies()) if (Math.hypot(e.p.x - D.p.x, e.p.z - D.p.z) < 22) spot(e.ref, e.p, e.y, 1.2); } }
  }
  // reparationsverktyget: håll [V] vid ett eget vapen
  if (t && PL.cls === 'ingenjor' && PL.keys.KeyV && !PL.gun){ let best = null, bd = 3.4;
    for (const d of DEF.list) if (d.kind === 'gun' && d.alive && (!d.it.side || d.it.side === 'us') && d.hp < d.g.hp){ const dd = Math.hypot(d.pos.x - t.x, d.pos.z - t.z); if (dd < bd){ bd = dd; best = d; } }
    if (best){ best.hp = Math.min(best.g.hp, best.hp + 45*dt); PL.msg = `REPARERAR ${best.g.name} ${Math.round(best.hp/best.g.hp*100)} %`; PL.msgT = .3; if (Math.random() < dt*8) fx.sparks && fx.sparks(best.pos.x, best.pos.y, best.pos.z, 0, 1, 0, 3); }
    else if (!PL.msg){ PL.msg = 'Inget skadat eget vapen nära'; PL.msgT = .3; } }
  // spottade fiender försvinner efter en stund (eller när de dör)
  for (let i = CL.spots.length - 1; i >= 0; i--){ const s = CL.spots[i]; s.t -= dt; const r = s.ref; if (s.t <= 0 || r.alive === false || r.dead) CL.spots.splice(i, 1); }
}
// ammolådan: ett magasin till varje vapen och en granat/pryl per gång
function resupply(){
  let any = false; const C = CLASSES[PL.cls];
  for (const k of PL.slots){ const W = WEAPONS[k], a = PL.ammo[k]; if (a[1] < W.res){ a[1] = Math.min(W.res, a[1] + W.mag); any = true; } }
  if (PL.gad.gren < NADES[PL.nade].n){ PL.gad.gren++; any = true; }
  for (const g of ['breach', 'c4', 'clay', 'sensor']){ const max = (C.gad[g] || 0); if (max && PL.gad[g] < max){ PL.gad[g]++; any = true; } }
  if (any && NETHOOK.resup) NETHOOK.resup();
  return any;
}
