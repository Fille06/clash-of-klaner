// AI-SOLDATER i 3D: anfaller och försvarar baser i lägena BAS MOT BAS och FÖRSVAR MOT ANFALL.
// Två lag: 'us' (spelarens lag) och 'them'. Soldaterna går på marken med vägfinning (A*) i ett 1 m-rutnät
// där byggnadernas bottenceller blockerar – spränger man ett hål i en mur kan de gå igenom det.
// Är basen helt inmurad sätter anfallarna sprängladdningar på muren. De skjuter med fri sikt (strålar i fysiken)
// på spelaren, andra soldater, fiendens försvar och byggnader.
import * as THREE from 'three';
import { E } from './engine.js';
import { R, PH, own, ray } from './physics.js';
import { fx } from './fx.js';
import { sfx } from './audio.js';
import { PL, TARGETS, explode, NETHOOK } from './player.js';
import { DS } from './destruct.js';
import { DEF, defTrigger, clayInCone } from './defense.js';
import { T, hAt } from './terrain.js';

export const BOTS = { peers: [], onProxyHit: null, list: [], on: false, nav: null, navT: 0, hq: {}, spawns: {}, rally: {}, tickets: { us: 0, them: 0 }, diff: 'normal', onKill: null, onEvent: null, seq: 0 };
const DIFF = { latt: { spread: .055, react: .9, dmg: 10 }, normal: { spread: .035, react: .55, dmg: 13 }, svar: { spread: .02, react: .3, dmg: 16 } };
const KINDS = {
  gevar: { name: 'GEVÄR', rpm: 480, burst: [3, 6], pause: .6, range: 75 },
  rpg:   { name: 'RPG', rpm: 12, burst: [1, 1], pause: 4, range: 70, rocket: true },
  ing:   { name: 'INGENJÖR', rpm: 520, burst: [3, 5], pause: .7, range: 55, charges: 2 },
};
const SPEED = 3.6, EYE = 1.5, RADIUS = .35;
const NAMES = ['Ek', 'Gran', 'Björk', 'Lind', 'Alm', 'Rönn', 'Asp', 'Sten', 'Berg', 'Holm', 'Dahl', 'Lund', 'Falk', 'Örn', 'Varg', 'Lo', 'Björn', 'Storm', 'Hök', 'Uggla'];

// ── modell ────────────────────────────────────────────────────────────────
const MATS = {};
function mat(c){ return MATS[c] || (MATS[c] = new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05 })); }
// frigör en soldatmodell helt (geometrier och mynningsflammans material) – förut läckte ~230 geometrier per match
export function disposeModel(M){ if (!M || !M.g) return; E.scene.remove(M.g); M.g.traverse(o => { if (o.isMesh){ o.geometry.dispose(); if (o === M.flash) o.material.dispose(); } }); }
export function soldierModel(team, kind){
  const g = new THREE.Group(), uni = team === 'us' ? 0x4a5a3c : 0x8a7a58, band = team === 'us' ? 0x3a8ae0 : 0xd8463a;
  const box = (w, h, d, c, x, y, z, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-.12, .85, 0); legR.position.set(.12, .85, 0); g.add(legL, legR);
  box(.16, .85, .18, uni, 0, -.42, 0, legL); box(.16, .85, .18, uni, 0, -.42, 0, legR);
  box(.18, .1, .26, 0x2a241c, 0, -.85, .04, legL); box(.18, .1, .26, 0x2a241c, 0, -.85, .04, legR);
  box(.46, .62, .28, uni, 0, 1.18, 0); box(.5, .4, .32, 0x3c4232, 0, 1.25, 0); // väst
  box(.47, .08, .29, band, 0, 1.0, 0); // lagfärg
  const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), mat(0xc49a7a)); head.position.set(0, 1.62, 0); head.castShadow = true; g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(.155, 10, 6, 0, Math.PI*2, 0, Math.PI/1.8), mat(team === 'us' ? 0x3c4a30 : 0x7a6a48)); helm.position.set(0, 1.65, 0); g.add(helm);
  const arms = new THREE.Group(); arms.position.set(0, 1.35, 0); g.add(arms);
  box(.12, .5, .12, uni, -.26, -.18, .14, arms).rotation.x = -1.1; box(.12, .5, .12, uni, .26, -.18, .14, arms).rotation.x = -1.1;
  const gun = kind === 'rpg' ? box(.12, .12, 1.1, 0x4a5a3a, .1, -.05, .45, arms) : box(.06, .1, .8, 0x1e1e1e, .1, -.08, .45, arms);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.06, .25, 6, 1, true).rotateX(Math.PI/2), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: .9 })); flash.position.set(.1, -.06, kind === 'rpg' ? 1.05 : .9); flash.visible = false; arms.add(flash);
  return { g, legL, legR, arms, flash, gun };
}

// ── navigering ────────────────────────────────────────────────────────────
// rutnät 1 m över hela matchområdet; 0 = fritt, 255 = blockerat. own[i] = lag som äger byggnaden ('us'/'them') för sprängning.
function buildNav(){
  const B = BOTS.bounds, W = B.x1 - B.x0, H = B.z1 - B.z0, n = W*H;
  const cost = new Uint8Array(n), owner = new Int16Array(n).fill(-1);
  const idx = (x, z) => { const i = Math.floor(x - B.x0), k = Math.floor(z - B.z0); return i < 0 || k < 0 || i >= W || k >= H ? -1 : k*W + i; };
  for (let k = 0; k < H; k++) for (let i = 0; i < W; i++){ const x = B.x0 + i + .5, z = B.z0 + k + .5, h = hAt(x, z); if (h < T.sea - .5) cost[k*W + i] = 6; }
  for (const t of T.treeList || []){ const i = idx(t[0], t[2]); if (i >= 0) cost[i] = 255; }
  DS.list.forEach((b, bi) => {
    if (!b.cells) return;
    for (const c of b.cells){ if (!c.alive || c.j > 2) continue; const p = b.pos(c), i = idx(p.x, p.z); if (i >= 0){ cost[i] = 255; owner[i] = bi; } }
  });
  for (const d of DEF.list) if (d.kind === 'hinder' && d.alive){ const i = idx(d.pos.x, d.pos.z); if (i >= 0) cost[i] = 255; }
  BOTS.nav = { cost, owner, W, H, idx };
}
class Heap { constructor(){ this.k = []; this.v = []; this.n = 0; }
  push(key, val){ const k = this.k, v = this.v; let i = this.n++; k[i] = key; v[i] = val; while (i > 0){ const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; } }
  pop(){ const k = this.k, v = this.v, top = v[0]; this.n--; if (this.n > 0){ k[0] = k[this.n]; v[0] = v[this.n]; let i = 0; for (;;){ const l = 2*i + 1, r = l + 1; let m = i; if (l < this.n && k[l] < k[m]) m = l; if (r < this.n && k[r] < k[m]) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } } return top; } }
// A* från (x,z) till närmaste målruta. breachTeam: lag vars byggnader får sprängas igenom (kostar mycket).
function findPath(sx, sz, goals, breachTeam){
  const N = BOTS.nav; if (!N) return null; const { W, H, cost, owner } = N;
  const start = N.idx(sx, sz); if (start < 0) return null;
  const goalSet = new Set(goals.filter(g => g >= 0)); if (!goalSet.size) return null;
  // avstånd till målområdets omslutande rektangel (oktil), viktat ×1,6: snabb sökning även när vägen måste sprängas genom murar
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity; for (const g of goalSet){ const x = g % W, z = Math.floor(g/W); bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
  const hfn = i => { const x = i % W, z = Math.floor(i/W), dx = x < bx0 ? bx0 - x : x > bx1 ? x - bx1 : 0, dz = z < bz0 ? bz0 - z : z > bz1 ? z - bz1 : 0; return (Math.max(dx, dz) + .41*Math.min(dx, dz))*1.6; };
  const g = new Float32Array(W*H).fill(Infinity), from = new Int32Array(W*H).fill(-1), heap = new Heap(); heap.push(hfn(start), start); g[start] = 0;
  let iter = 0;
  while (heap.n && iter++ < 90000){
    const cur = heap.pop();
    if (goalSet.has(cur)){ const path = []; for (let c = cur; c !== start && c >= 0; c = from[c]) path.push(c); path.reverse(); return path.map(i => ({ x: (i % W) + BOTS.bounds.x0 + .5, z: Math.floor(i/W) + BOTS.bounds.z0 + .5, i })); }
    const cx = cur % W, cz = Math.floor(cur/W);
    for (const [dx, dz, st] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]){
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; const ni = nz*W + nx;
      let c = cost[ni]; if (c === 255){ const o = owner[ni]; if (o < 0 || !breachTeam || DS.list[o].side !== breachTeam) continue; c = 14; }
      if (dx && dz && (cost[cz*W + nx] === 255 || cost[nz*W + cx] === 255)) continue;
      const ng = g[cur] + st*(1 + c); if (ng < g[ni]){ g[ni] = ng; from[ni] = cur; heap.push(ng + hfn(ni), ni); }
    }
  }
  return null;
}
// rutor runt en byggnads fotavtryck (mål för anfall)
function ringCells(b, r){ const N = BOTS.nav, S = b.s, out = []; for (let z = S.z - S.d/2 - r; z <= S.z + S.d/2 + r; z += 1) for (let x = S.x - S.w/2 - r; x <= S.x + S.w/2 + r; x += 1){ const inside = Math.abs(x - S.x) < S.w/2 + .2 && Math.abs(z - S.z) < S.d/2 + .2; if (!inside){ const i = N.idx(x, z); if (i >= 0 && N.cost[i] !== 255) out.push(i); } } return out; }

// ── soldater ──────────────────────────────────────────────────────────────
function spawnPoint(team){
  const s = BOTS.spawns[team], N = BOTS.nav;
  for (let k = 0; k < 40; k++){ const x = s.x + (Math.random() - .5)*s.r*2, z = s.z + (Math.random() - .5)*s.r*2, i = N ? N.idx(x, z) : -1; if (!N || (i >= 0 && N.cost[i] !== 255)) return new THREE.Vector3(x, hAt(x, z), z); }
  return new THREE.Vector3(s.x, hAt(s.x, s.z), s.z);
}
export function botAdd(team, role, kind, name){
  const K = KINDS[kind] || KINDS.gevar, M = soldierModel(team, kind), p = spawnPoint(team);
  const b = { id: `b${++BOTS.seq}`, team, role, kind, K, name: name || `${team === 'us' ? 'Alfa' : 'Fiende'} ${NAMES[BOTS.seq % NAMES.length]}`, M, pos: p, yaw: 0, hp: 100, alive: true, respawn: 0, path: null, pathT: 0, cool: 0, shots: 0, scanT: Math.random()*.3, tgt: null, seen: 0, charges: K.charges || 0, plant: null, phase: 0 };
  M.g.position.copy(p); E.scene.add(M.g);
  b.body = PH.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + .9, p.z));
  // spelarens kulor skadar inte egna allierade (ingen vådabeskjutning), sprängningar gör det
  b.target = { alive: true, pos: b.pos, bot: b, hit: (dmg, p, by) => { if (by === 'pl' && b.team === 'us') return; hurt(b, dmg, by === 'pl' ? 'Du' : null); } };
  b.col = own(PH.world.createCollider(R.ColliderDesc.capsule(.55, RADIUS), b.body), { target: b.target, botId: b.id });
  TARGETS.push(b.target); BOTS.list.push(b); return b;
}
function hurt(b, dmg, by){
  if (!b.alive) return; b.hp -= dmg; b.hurtT = 4;
  if (b.hp <= 0) kill(b, by);
}
function kill(b, by){
  b.alive = false; b.target.alive = false; b.hp = 0; b.M.g.rotation.x = -Math.PI/2; b.M.g.position.y += .2; b.M.flash.visible = false;
  try { b.body.setNextKinematicTranslation({ x: b.pos.x, y: -50, z: b.pos.z }); b.body.setTranslation({ x: b.pos.x, y: -50, z: b.pos.z }, true); } catch (e){}
  if (BOTS.tickets[b.team] > 0){ BOTS.tickets[b.team]--; b.respawn = 6; } else b.respawn = -1;
  BOTS.onKill && BOTS.onKill(b, by);
}
function respawn(b){
  b.push = false; b.wait = 0; b.rallyFor = null;
  const p = spawnPoint(b.team); b.pos.copy(p); b.hp = 100; b.alive = true; b.target.alive = true; b.path = null; b.tgt = null; b.plant = null; b.charges = b.K.charges || 0;
  b.M.g.rotation.set(0, 0, 0); b.M.g.position.copy(p); b.body.setTranslation({ x: p.x, y: p.y + .9, z: p.z }, true);
}
// SKUGGOR: hos de andra spelarna visas värdens AI-soldater som skuggor (ingen egen AI). Träffar på dem skickas till värden.
export function botProxySync(list){
  const seen = new Set();
  for (const r of list){
    if (typeof r.id !== 'string' || !Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
    let b = BOTS.list.find(x => x.id === r.id);
    if (!b){ b = botAdd(r.team === 'us' ? 'us' : 'them', 'proxy', KINDS[r.kind] ? r.kind : 'gevar'); b.id = r.id; b.proxy = true; b.target.hit = (dmg, p, by) => { if (by === 'pl' && b.team === 'them' && BOTS.onProxyHit) BOTS.onProxyHit(b.id, dmg); }; b.to = new THREE.Vector3(); b.pos.set(r.x, hAt(r.x, r.z), r.z); }
    seen.add(b.id); b.to.set(r.x, hAt(r.x, r.z), r.z); b.yaw = r.yaw; b.hp = r.hp; b.moving = r.moving;
    if (r.fire){ b.M.flash.visible = true; b.flashT = .06; }
    if (b.alive !== r.alive){ b.alive = r.alive; b.target.alive = r.alive; b.M.g.rotation.x = r.alive ? 0 : -Math.PI/2; if (r.alive) b.pos.copy(b.to); }
  }
  for (const b of BOTS.list.slice()) if (b.proxy && !seen.has(b.id)){ disposeModel(b.M); try { PH.world.removeRigidBody(b.body); } catch (e){} b.target.alive = false; BOTS.list.splice(BOTS.list.indexOf(b), 1); }
}
export function botsClear(){ for (const b of BOTS.list){ disposeModel(b.M); try { PH.world.removeRigidBody(b.body); } catch (e){} b.target.alive = false; } BOTS.list.length = 0; BOTS.on = false; BOTS.nav = null; for (const t of BOTS.tracers || []) E.scene.remove(t.m); BOTS.tracers = []; }

// mål för fiendens försvar (anropas av defense.js via DEF.extra): soldater som är fiender till försvarets ägare
export function botTargets(side){
  const L = [];
  for (const b of BOTS.list) if (b.alive && b.team !== side) L.push({ id: b.id, x: b.pos.x, y: b.pos.y + 1.1, z: b.pos.z, hp: b.hp, v: b.moving ? SPEED : 0, crouch: 0, col: b.col, onHit: (dmg) => hurt(b, dmg*(BOTS.defDmg || 1), 'FÖRSVAR'), team: b.team });
  return L;
}

// ── syn och eld ───────────────────────────────────────────────────────────
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function enemiesOf(b){
  const out = [];
  for (const o of BOTS.list) if (o.alive && o.team !== b.team) out.push({ kind: 'bot', ref: o, x: o.pos.x, y: o.pos.y + 1.2, z: o.pos.z, col: o.col });
  if (PL.on && PL.body && PL.hp > 0 && b.team === 'them'){ const t = PL.body.translation(); out.push({ kind: 'pl', x: t.x, y: t.y + .3, z: t.z, col: PL.col }); }
  for (const p of BOTS.peers) if (!p.dead && p.team !== b.team) out.push({ kind: 'peer', ref: p, x: p.pos.x, y: p.pos.y, z: p.pos.z, col: p.col });
  for (const d of DEF.list) if (d.kind === 'gun' && d.alive && d.it.side && d.it.side !== b.team) out.push({ kind: 'def', ref: d, x: d.pos.x, y: d.pos.y, z: d.pos.z, col: d.col });
  return out;
}
function canSee(b, t){
  _o.set(b.pos.x, b.pos.y + EYE, b.pos.z); _d.set(t.x - _o.x, t.y - _o.y, t.z - _o.z); const L = _d.length(); if (L < .1) return true; _d.multiplyScalar(1/L);
  _o.addScaledVector(_d, .5); const h = ray(_o, _d, L, b.col); if (!h) return true;
  if (t.kind === 'pl') return !!(h.owner && h.owner.player);
  if (t.col && h.col && h.col.handle === t.col.handle) return true;
  return h.toi > L - 1.2;
}
let TRM = null; const TRG = new THREE.CylinderGeometry(.015, .015, 1, 4).rotateX(Math.PI/2).translate(0, 0, .5);
function tracer(o, dir, len){ TRM = TRM || new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }); const m = new THREE.Mesh(TRG, TRM); m.position.copy(o); m.lookAt(o.clone().add(dir)); m.scale.set(1, 1, 3); E.scene.add(m); (BOTS.tracers || (BOTS.tracers = [])).push({ m, dir: dir.clone(), left: len }); }
function shoot(b, t){
  const D = DIFF[BOTS.diff] || DIFF.normal, o = new THREE.Vector3(b.pos.x, b.pos.y + 1.35, b.pos.z), dist = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
  b.M.flash.visible = true; b.flashT = .05;
  if (b.K.rocket){
    const dir = new THREE.Vector3(t.x - o.x, t.y - o.y, t.z - o.z).normalize(), h = ray(o.clone().addScaledVector(dir, .8), dir, 120, b.col);
    const to = h ? new THREE.Vector3(h.point.x, h.point.y, h.point.z) : o.clone().addScaledVector(dir, 70);
    BOTS.shells.push({ t: to.distanceTo(o)/60, p: to, n: h ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : null, by: b.name, team: b.team });
    sfx.rocket && sfx.rocket(); return;
  }
  const sp = D.spread*(t.kind === 'pl' && PL.crouch > .5 ? .8 : 1)*(b.moving ? 1.6 : 1);
  const dir = new THREE.Vector3(t.x - o.x + (Math.random() - .5)*sp*dist*2, t.y - o.y + (Math.random() - .5)*sp*dist*2, t.z - o.z + (Math.random() - .5)*sp*dist*2).normalize();
  const start = o.clone().addScaledVector(dir, .9), h = ray(start, dir, b.K.range + 10, b.col);
  sfx.mg && sfx.mg(o.distanceTo(E.cam.position)); if (b.shots % 2 === 0) tracer(start, dir, h ? h.toi : 70);
  if (!h) return; const p = h.point, n = h.normal;
  if (h.owner && h.owner.player){ if (b.team === 'them'){ PL.hp -= D.dmg; PL.dmgT = .8; PL.hurtFrom = { x: b.pos.x, z: b.pos.z, t: 1.2 }; PL.lastHit = { by: b.name, x: b.pos.x, z: b.pos.z }; PL.shake = Math.max(PL.shake || 0, .1); } return; }
  if (h.owner && h.owner.target){ const tg = h.owner.target; if (tg.bot && tg.bot.team === b.team) return; if (tg.peer){ tg.hit(D.dmg, p, b.team === 'us' ? 'botUs' : 'botThem'); return; } tg.hit(D.dmg*(tg.bot ? 1 : 1.5), p); return; }
  if (h.owner && h.owner.b){ const c = h.owner; c.b.hit(c, D.dmg*1.6, o); if (NETHOOK.cell) NETHOOK.cell(c, D.dmg*1.6); if (c.t !== 'glass'){ fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 2, null); if (c.alive) fx.decal('hole', p, n, .08); } }
  else fx.dust(p.x, p.y, p.z, .3, 1);
}

// samlingspunkt för ett lags anfall: på linjen fiendens högkvarter → egen startplats, strax utom försvarens räckvidd
function rallyPoint(team, hqB){
  const sp = BOTS.spawns[team], S = hqB.s, dx = sp.x - S.x, dz = sp.z - S.z, L = Math.hypot(dx, dz) || 1, d = Math.min((DEF.maxRange || 85) + 8, L - 6);
  return { x: S.x + dx/L*d, z: S.z + dz/L*d, key: team + Math.round(d) };
}
// ── beslut ────────────────────────────────────────────────────────────────
function goalFor(b){
  const enemyTeam = b.team === 'us' ? 'them' : 'us';
  if (b.role === 'attack' && BOTS.hq[enemyTeam] && !BOTS.hq[enemyTeam].dead) return { b: BOTS.hq[enemyTeam].b, attack: true };
  const own = BOTS.hq[b.team]; if (own && !own.dead) return { b: own.b, attack: false };
  return null;
}
function think(b, dt){
  const D = DIFF[BOTS.diff] || DIFF.normal;
  // ingenjören fyller på en laddning var tolfte sekund (som ammunitionslådan i BF4)
  if (b.K.charges && b.charges < b.K.charges){ b.resup = (b.resup ?? 12) - dt; if (b.resup <= 0){ b.charges++; b.resup = 12; } }
  b.scanT -= dt;
  if (b.scanT <= 0){ b.scanT = .3 + Math.random()*.15;
    let best = null, bd = Infinity;
    // anfallare pressar mot högkvarteret: de tar bara strid med fiender på nära håll (förut fastnade båda lagen i eldstrid på mitten)
    // (men besvarar eld på full räckvidd en stund efter att ha blivit beskjutna)
    b.hurtT = Math.max(0, (b.hurtT || 0) - .35); const reach = b.role === 'attack' && !(b.hurtT > 0) ? Math.min(b.K.range, 45) : b.K.range;
    for (const t of enemiesOf(b)){ const d = Math.hypot(t.x - b.pos.x, t.z - b.pos.z); if (d > (t.kind === 'def' ? b.K.range : reach) || d > bd) continue; if (canSee(b, t)){ best = t; bd = d; } }
    if (best && (!b.tgt || b.tgt.ref !== best.ref || b.tgt.kind !== best.kind)) b.seen = 0;
    b.tgt = best;
  }
  // skjut på synligt mål
  if (b.tgt){
    const t = b.tgt; b.yaw = Math.atan2(t.x - b.pos.x, t.z - b.pos.z); b.seen += dt; b.cool -= dt;
    if (b.seen > D.react && b.cool <= 0){ b.shots++; b.cool = 60/b.K.rpm; if (b.shots >= (b.burstN || (b.burstN = b.K.burst[0] + Math.floor(Math.random()*(b.K.burst[1] - b.K.burst[0] + 1))))){ b.shots = 0; b.burstN = 0; b.cool = b.K.pause*(.7 + Math.random()*.6); } shoot(b, t); }
  }
  // sätter sprängladdning
  if (b.plant){ const P0 = b.plant; P0.t -= dt; b.moving = false;
    // backa bort från laddningen (minst 6 m) under stubintiden
    const away = Math.hypot(b.pos.x - P0.p.x, b.pos.z - P0.p.z); if (away < 7){ const sp = SPEED*dt; b.pos.x += P0.n.x*sp; b.pos.z += P0.n.z*sp; b.pos.y = Math.max(hAt(b.pos.x, b.pos.z), T.sea - 1.2); b.yaw = Math.atan2(-P0.n.x, -P0.n.z); b.moving = true; }
    if (P0.t <= 0){ const P = b.plant; b.plant = null; PL.nextCause = P.c4 ? 'C4' : 'SPRÄNGLADDNING'; if (P.c4) explode(P.p, 2.6, 2800, 1.3, P.n, false, true, b.team); else explode(P.p, 2.2, 1500, 1, P.n, true, true, b.team); BOTS.navT = 0; BOTS.onEvent && BOTS.onEvent({ t: 'blast', p: P.p }); } return; }
  // rörelse mot målet
  const G = goalFor(b); if (!G){ b.moving = false; return; }
  const near = Math.max(Math.abs(G.b.s.x - b.pos.x) - G.b.s.w/2, Math.abs(G.b.s.z - b.pos.z) - G.b.s.d/2, 0);
  if (G.attack){
    // inom räckhåll av fiendens högkvarter: stanna och skjut på det (RPG spränger hål)
    if (!(b.charges > 0) && near < (b.K.rocket ? 45 : 22) && !b.tgt){ const hq = { kind: 'hq', x: G.b.s.x, y: G.b.origin.y + 2, z: G.b.s.z }; if (canSee(b, hq) || near < 6){ b.tgt = null; b.yaw = Math.atan2(hq.x - b.pos.x, hq.z - b.pos.z); b.cool -= dt; if (b.cool <= 0){ b.cool = b.K.rocket ? b.K.pause : .18; shoot(b, hq); } b.moving = false; return; } }
  } else if (near < 14 + (b.post || 0)){ b.moving = false; return; }
  if (b.tgt && !G.attack){ b.moving = false; return; }
  // ANFALL I VÅGOR (som BF4): anfallarna samlas först utom räckhåll för fiendens försvar och går fram tillsammans
  const R = G.attack && !b.push ? rallyPoint(b.team, G.b) : null;
  if (R){ const dR = Math.hypot(b.pos.x - R.x, b.pos.z - R.z);
    if (dR < 7){ b.moving = false; b.wait = (b.wait || 0) + dt; b.yaw = Math.atan2(G.b.s.x - b.pos.x, G.b.s.z - b.pos.z);
      const grp = BOTS.list.filter(o => o.alive && o.team === b.team && o.role === 'attack' && !o.push && Math.hypot(o.pos.x - R.x, o.pos.z - R.z) < 7);
      if (grp.length >= Math.min(3, BOTS.list.filter(o => o.alive && o.team === b.team && o.role === 'attack').length) || b.wait > 14){ for (const o of grp){ o.push = true; o.pathT = 0; o.wait = 0; } }
      return; }
    if (b.rallyFor !== R.key){ b.rallyFor = R.key; b.pathT = 0; } }
  b.pathT -= dt;
  if (R && b.pathT <= 0){ b.pathT = 2 + Math.random(); const N = BOTS.nav, cells = []; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++){ const i = N.idx(R.x + dx, R.z + dz); if (i >= 0 && N.cost[i] !== 255) cells.push(i); } b.path = findPath(b.pos.x, b.pos.z, cells, null); b.pi = 0; if (!b.path){ b.push = true; b.pathT = 0; } }
  else if (b.pathT <= 0 || (b.path && b.pi >= b.path.length && b.pathT > 1)){ b.pathT = 2 + Math.random(); const ring = ringCells(G.b, G.attack ? 2 : 8), mine = ring.filter((c, k) => k % 5 === (b.k5 ?? (b.k5 = (parseInt(String(b.id).slice(1)) || 0) % 5))); b.path = findPath(b.pos.x, b.pos.z, mine.length ? mine : ring, G.attack ? (b.team === 'us' ? 'them' : 'us') : null); b.pi = 0; if (!b.path) b.pathT = 3 + Math.random()*2; }
  const P = b.path;
  // framme vid fiendens högkvarter: ingenjören sätter laddningen på högkvarterets vägg
  if (P && b.pi >= P.length && G.attack && b.charges > 0 && near < 4){ b.charges--; const n = new THREE.Vector3(b.pos.x - G.b.s.x, 0, b.pos.z - G.b.s.z).normalize();
    // laddningen sätts vid närmaste cell som står kvar på de två nedersta våningarna, så att sprängningarna äter sig in i byggnaden
    let best = null, bd = Infinity; const q = new THREE.Vector3(), cols = G.b.cells.some(c => c.alive && c.t === 'col' && c.j === 1);
    // bärande pelare i bottenvåningen först (då rasar byggnaden), annars närmaste cell som står kvar
    for (const c of G.b.cells){ if (!c.alive || c.j > (G.b.s.fh || 6) || c.t === 'slab' || (cols && !(c.t === 'col' && c.j === 1))) continue; G.b.pos(c, q); const d = (q.x - b.pos.x)**2 + (q.z - b.pos.z)**2 + (q.y - b.pos.y - 1)**2*.3; if (d < bd){ bd = d; best = q.clone(); } }
    const p = best || new THREE.Vector3(G.b.s.x + n.x*(G.b.s.w/2 + .2), hAt(b.pos.x, b.pos.z) + 1, G.b.s.z + n.z*(G.b.s.d/2 + .2)); b.plant = { t: 2.5, p, n, c4: true }; BOTS.onEvent && BOTS.onEvent({ t: 'plant', p }); return; }
  if (!P || b.pi >= P.length){ b.moving = false; if (P && G.attack && b.charges > 0 && near >= 4) b.pathT = Math.min(b.pathT, .5); return; }
  const nx = P[b.pi], N = BOTS.nav;
  // nästa ruta är en fiendemur: sätt sprängladdning (ingenjör) eller skjut sönder den
  if (N.cost[nx.i] === 255){
    const o = N.owner[nx.i], B = DS.list[o];
    if (b.charges > 0){ b.charges--; const p = new THREE.Vector3(nx.x, hAt(nx.x, nx.z) + 1, nx.z), n = new THREE.Vector3(b.pos.x - nx.x, 0, b.pos.z - nx.z).normalize(); b.plant = { t: 2.5, p: p.addScaledVector(n, .3), n }; BOTS.onEvent && BOTS.onEvent({ t: 'plant', p }); return; }
    if (B){ b.yaw = Math.atan2(nx.x - b.pos.x, nx.z - b.pos.z); b.cool -= dt; if (b.cool <= 0){ b.cool = b.K.rocket ? b.K.pause : .15; shoot(b, { kind: 'wall', x: nx.x, y: hAt(nx.x, nx.z) + 1, z: nx.z }); } }
    b.moving = false; return;
  }
  const dx = nx.x - b.pos.x, dz = nx.z - b.pos.z, d = Math.hypot(dx, dz);
  if (d < .35){ b.pi++; return; }
  const sp = SPEED*(T.sea > hAt(b.pos.x, b.pos.z) ? .5 : 1)*(b.tgt && b.role !== 'attack' ? .5 : b.tgt ? .8 : 1)*dt;
  b.pos.x += dx/d*Math.min(sp, d); b.pos.z += dz/d*Math.min(sp, d); b.pos.y = Math.max(hAt(b.pos.x, b.pos.z), T.sea - 1.2);
  if (!b.tgt) b.yaw = Math.atan2(dx, dz); b.moving = true;
}

// ── uppdatering ───────────────────────────────────────────────────────────
export function updateBots(dt){
  for (let i = (BOTS.tracers || []).length - 1; i >= 0; i--){ const t = BOTS.tracers[i], s = Math.min(t.left, 300*dt); t.m.position.addScaledVector(t.dir, s); t.left -= s; if (t.left <= 0){ E.scene.remove(t.m); BOTS.tracers.splice(i, 1); } }
  if (!BOTS.on) return;
  if (BOTS.noAi){ for (const b of BOTS.list) if (b.proxy){ b.pos.lerp(b.to, Math.min(1, dt*10)); b.phase += dt*(b.moving ? 9 : 0); const sw = b.moving ? Math.sin(b.phase)*.6 : 0; b.M.legL.rotation.x = sw; b.M.legR.rotation.x = -sw; b.M.g.position.copy(b.pos); if (b.alive) b.M.g.rotation.y = b.yaw; b.body.setNextKinematicTranslation({ x: b.pos.x, y: b.alive ? b.pos.y + .9 : -50, z: b.pos.z }); if (b.flashT > 0){ b.flashT -= dt; if (b.flashT <= 0) b.M.flash.visible = false; } } return; }
  BOTS.navT -= dt; if (BOTS.navT <= 0){ BOTS.navT = 1.5; buildNav(); for (const k in BOTS.hq){ const H = BOTS.hq[k]; if (H.b && !H.dead){ // högkvarterets liv = bottenvåningens bärande väggar och pelare (taket och bjälklagen räknas inte)
        if (!H.base){ const fh = H.b.s.fh || 6; H.base = H.b.cells.filter(c => c.j <= fh && c.t !== 'slab' && c.t !== 'glass'); if (!H.base.length) H.base = H.b.cells; }
        const alive = H.base.reduce((a, c) => a + (c.alive ? 1 : 0), 0); H.frac = alive/H.base.length; if (H.b.collapsed > H.b.cells.length*.3 || H.frac < .55){ H.dead = true; BOTS.onEvent && BOTS.onEvent({ t: 'hq', team: k }); } } } }
  for (let i = BOTS.shells.length - 1; i >= 0; i--){ const s = BOTS.shells[i]; s.t -= dt; if (s.t <= 0){ BOTS.shells.splice(i, 1); PL.nextCause = s.by; explode(s.p, 2.2, 1100, 1, s.n, !!s.n, true, s.team); BOTS.navT = Math.min(BOTS.navT, .3); } }
  for (const b of BOTS.list){
    if (b.proxy){ b.pos.lerp(b.to, Math.min(1, dt*10)); b.phase += dt*(b.moving ? 9 : 0); const sw = b.moving ? Math.sin(b.phase)*.6 : 0; b.M.legL.rotation.x = sw; b.M.legR.rotation.x = -sw; b.M.g.position.copy(b.pos); if (b.alive) b.M.g.rotation.y = b.yaw; b.body.setNextKinematicTranslation({ x: b.pos.x, y: b.alive ? b.pos.y + .9 : -50, z: b.pos.z }); if (b.flashT > 0){ b.flashT -= dt; if (b.flashT <= 0) b.M.flash.visible = false; } continue; }
    if (!b.alive){ if (b.respawn > 0){ b.respawn -= dt; if (b.respawn <= 0) respawn(b); } continue; }
    think(b, dt);
    // fiendens minor, claymore och snubbeltråd utlöses av soldater också
    for (const d of DEF.list){ if (!d.alive || !d.it || !d.it.side || d.it.side === b.team) continue;
      if ((d.kind === 'mine' && Math.hypot(b.pos.x - d.pos.x, b.pos.z - d.pos.z) < 1.1) || (d.kind === 'claymore' && (d.armT || 0) > .5 && clayInCone(d, b.pos.x, b.pos.z)) || (d.kind === 'snubbel' && Math.abs(b.pos.x - d.pos.x) < d.w/2 + .2 && Math.abs(b.pos.z - d.pos.z) < d.d/2 + .3)) defTrigger(d);
      if (d.kind === 'wire' && Math.abs(b.pos.x - d.pos.x) < d.w/2 + .2 && Math.abs(b.pos.z - d.pos.z) < d.d/2 + .3){ hurt(b, 8*dt, 'TAGGTRÅD'); b.pos.x -= Math.sin(b.yaw)*SPEED*.7*dt; b.pos.z -= Math.cos(b.yaw)*SPEED*.7*dt; }
    }
    // modell och kolliderare följer
    b.phase += dt*(b.moving ? 9 : 0); const sw = b.moving ? Math.sin(b.phase)*.6 : 0;
    b.M.legL.rotation.x = sw; b.M.legR.rotation.x = -sw; b.M.g.position.copy(b.pos); b.M.g.rotation.y = b.yaw;
    b.body.setNextKinematicTranslation({ x: b.pos.x, y: b.pos.y + .9, z: b.pos.z });
    if (b.flashT > 0){ b.flashT -= dt; if (b.flashT <= 0) b.M.flash.visible = false; }
  }
}

/**
 * Startar AI för en match.
 * o = { bounds: {x0,x1,z0,z1}, spawns: {us: {x,z,r}, them: {x,z,r}}, hq: {us: Building|null, them: Building|null},
 *       us: [{role, kind}], them: [{role, kind}], tickets: {us, them}, diff }
 */
export function botsStart(o){
  botsClear(); BOTS.noAi = !!o.noAi; BOTS.bounds = o.bounds; BOTS.spawns = o.spawns; BOTS.diff = o.diff || 'normal'; BOTS.tickets = { ...o.tickets }; BOTS.shells = [];
  BOTS.hq = {}; for (const k of ['us', 'them']) if (o.hq[k]) BOTS.hq[k] = { b: o.hq[k], dead: false, frac: 1 };
  if (!BOTS.noAi){ buildNav(); BOTS.navT = 1.5; for (const k of ['us', 'them']) for (const s of o[k] || []) botAdd(k, s.role, s.kind); }
  BOTS.list.forEach((b, i) => { b.post = (i % 4)*3; });
  BOTS.on = true;
}
BOTS.dbg = { findPath: (...a) => findPath(...a), ringCells: (...a) => ringCells(...a) }; // felsökning i testläge
