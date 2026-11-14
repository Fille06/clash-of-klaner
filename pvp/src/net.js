// NÄTVERK i 3D: riktiga spelare möts via spelservern (clash-of-klaner-kärnan, 3D-rum).
// Varje webbläsare simulerar sin egen fysik och förstörelse. Det som skickas:
//   st   – min position (12 gånger/s)          boom – sprängning jag orsakade (alla gör samma sprängning)
//   cell – skott som skadade en byggnadscell   hit  – träff på en annan spelare (eller värdens AI-soldat)
//   dead – jag dog (värden räknar liv)          bots/tk/end – från värden: AI-soldaternas läge, poäng, matchslut
// Värden kör AI-soldaterna; de andra visar dem som "skuggor" och skickar sina träffar på dem till värden.
import * as THREE from 'three';
import { E } from './engine.js';
import { R, PH, own } from './physics.js';
import { PL, NETHOOK, explode } from './player.js';
import { DS } from './destruct.js';
import { DEF, GUNS } from './defense.js';
import { ray } from './physics.js';
import { BOTS, botProxySync, soldierModel, disposeModel } from './bots.js';
import { hudFeed } from './hud.js';
import { hAt } from './terrain.js';
import { netDep, CL } from './classes.js';
import { botRevive } from './bots.js';

export const NET = { ws: null, me: null, token: null, room: null, start: null, on: false, host: false, team: 'A', peers: new Map(), applying: false, t: { st: 0, bots: 0, tk: 0 }, ui: {} };
const other = t => (t === 'A' ? 'B' : 'A');
export const absTeam = local => (local === 'us' ? NET.team : other(NET.team));
export const localTeam = abs => (abs === NET.team ? 'us' : 'them');

export function netConnect(url, name){
  return new Promise((resolve, reject) => {
    if (NET.ws){ const old = NET.ws; NET.ws = null; old.onclose = old.onmessage = old.onerror = null; try { old.close(); } catch (e){} }
    let ws; try { ws = new WebSocket(url); } catch (e){ reject(new Error('Ogiltig serveradress')); return; }
    NET.ws = ws; let done = false;
    ws.onopen = () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, name: String(name || 'Soldat').slice(0, 24) }, NET.token ? { token: NET.token } : {})));
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x){ return; } if (m.t === 'welcome'){ NET.me = m.playerId; NET.token = m.token; if (!done){ done = true; resolve(m); } } handle(m); };
    ws.onerror = () => { if (!done){ done = true; reject(new Error('Kunde inte ansluta till servern')); } };
    ws.onclose = () => { if (NET.ws !== ws) return; NET.ws = null; if (NET.on) netStop('Anslutningen bröts'); NET.ui.onClosed && NET.ui.onClosed('Frånkopplad från servern'); };
  });
}
export function netSend(m){ if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(m)); }
const ev = (k, d) => netSend({ t: 'r3Ev', k, d });

function handle(m){
  if (m.t === 'error'){ NET.ui.onError && NET.ui.onError(m.msg); return; }
  if (m.t === 'r3Room'){ NET.room = m.room; NET.ui.onRoom && NET.ui.onRoom(m.room); return; }
  if (m.t === 'r3Closed'){ NET.room = null; if (NET.on) netStop(m.reason); NET.ui.onClosed && NET.ui.onClosed(m.reason); return; }
  if (m.t === 'r3Start'){ NET.start = m; NET.host = m.host === NET.me; NET.team = (m.players.find(p => p.id === NET.me) || {}).team || 'A'; NET.ui.onStart && NET.ui.onStart(m); return; }
  if (m.t !== 'r3Ev' || !NET.on) return;
  const d = m.d || {}, from = m.from;
  switch (m.k){
    case 'st': peerUpdate(from, d); break;
    case 'boom': if (Array.isArray(d.p) && d.p.length === 3 && d.p.every(Number.isFinite) && Number.isFinite(d.r) && Number.isFinite(d.dmg) && hostAccepts(from, d) && !ghost(from)){ if (!fromHost(from) && DEFW_N.has(d.w)) PL.noBuild = true; const n = Array.isArray(d.n) && d.n.length === 3 && d.n.every(Number.isFinite) ? new THREE.Vector3(...d.n) : null; NET.applying = true; NETHOOK.applying = true; try { explode(new THREE.Vector3(...d.p), Math.max(0, Math.min(d.r, 8)), Math.max(0, Math.min(d.dmg, 3000)), Math.max(0, Math.min(d.k || 1, 2)), n, !!d.br, false, d.team === 'A' || d.team === 'B' ? localTeam(d.team) : null, Number.isInteger(d.seed) ? d.seed : null); } finally { NET.applying = false; NETHOOK.applying = false; } } break;
    case 'cell': { const B = DS.list[d.b], c = B && B.cells[d.c]; if (c && Number.isFinite(d.dmg) && !ghost(from) && cellAccepts(from, B, c)) B.hit(c, Math.max(0, Math.min(d.dmg, fromHost(from) ? 200 : CELL_MAX)), null); break; }
    case 'hit': if (Number.isFinite(d.dmg)){ const dmg = Math.max(0, Math.min(d.dmg, 150));
      // värden: bara träffar på motståndarlagets AI-soldater räknas
      if (d.bot && NET.host){ const b = BOTS.list.find(x => x.id === d.bot), info = (NET.start.players || []).find(x => x.id === from), p = NET.peers.get(from); if (b && b.alive && b.target && info && p && b.team !== localTeam(info.team) && Math.hypot(b.pos.x - p.to.x, b.pos.z - p.to.z) < 220) b.target.hit(dmg, null, 'net'); }
      else if (d.to === NET.me && PL.hp > 0 && (fromHost(from) && d.by === 'AI' || hitSeen(from))){ PL.hp -= dmg; PL.dmgT = .8; const p = NET.peers.get(from); PL.lastHit = { by: p ? p.name : (d.by || 'FIENDE'), x: p ? p.pos.x : 0, z: p ? p.pos.z : 0 }; if (p) PL.hurtFrom = { x: p.pos.x, z: p.pos.z, t: 1.2 }; } }
      break;
    // utplacerad pryl (förbandslåda, ammolåda, claymore, sensor, radiofyr, rök, bländ) från en annan spelare
    case 'dep': { const info = (NET.start.players || []).find(x => x.id === from); if (info && ok3(d.p) && typeof d.k === 'string' && !ghost(from)) netDep(d.k, new THREE.Vector3(d.p[0], d.p[1], d.p[2]), localTeam(info.team), Number.isFinite(d.r) ? d.r : 0); break; }
    // återupplivning: till mig (jag reser mig) eller till värdens AI-soldat (värden kontrollerar avståndet)
    case 'rev': { const info = (NET.start.players || []).find(x => x.id === from), p = NET.peers.get(from); if (!info || !p) break;
      if (d.to === NET.me && PL.revive && PL.deadT > 0 && Math.hypot(p.to.x - PL.body.translation().x, p.to.z - PL.body.translation().z) < 4) PL.revive();
      if (NET.host && d.to && d.to !== NET.me){ const tp = NET.peers.get(d.to); if (tp && tp.team === localTeam(info.team) && tp.dead) BOTS.tickets[tp.team] = (BOTS.tickets[tp.team] || 0) + 1; }
      if (NET.host && d.to === NET.me) BOTS.tickets.us = (BOTS.tickets.us || 0) + 1;
      if (NET.host && d.bot){ const b = BOTS.list.find(x => x.id === d.bot); if (b && !b.alive && b.respawn > 0 && b.team === localTeam(info.team) && Math.hypot(b.pos.x - p.to.x, b.pos.z - p.to.z) < 4){ botRevive(b); BOTS.tickets[b.team]++; } }
      break; }
    case 'dead': if (NET.host && (d.team === 'A' || d.team === 'B')){ const lt = localTeam(d.team); BOTS.tickets[lt] = Math.max(0, BOTS.tickets[lt] - 1); } { const p = NET.peers.get(from); if (p) p.dead = true; } break;
    case 'bots': if (!NET.host && Array.isArray(d.l)) botProxySync(d.l.map(r => ({ id: r[0], team: localTeam(r[1]), kind: r[2], x: r[3], z: r[4], yaw: r[5], hp: r[6], alive: !!r[7], moving: !!r[8], fire: !!r[9] }))); break;
    case 'tk': if (!NET.host){ BOTS.tickets.us = d[NET.team] ?? BOTS.tickets.us; BOTS.tickets.them = d[other(NET.team)] ?? BOTS.tickets.them; for (const k of ['A', 'B']) if (d['hq' + k] && BOTS.hq[localTeam(k)]) BOTS.hq[localTeam(k)].dead = true; } break;
    case 'end': if (!NET.host && NET.ui.onEnd){ const w = d.winner === null ? null : d.winner === NET.team; NET.ui.onEnd(w, whyText(d.code, w) || String(d.why || '').slice(0, 120)); } break;
    case 'left': { const nm = NET.peers.get(from)?.name || 'En spelare', info = (NET.start.players || []).find(x => x.id === from); peerRemove(from); hudFeed(nm, '', 'LÄMNADE'); if (NET.host && info && BOTS.on && NET.ui.replace) NET.ui.replace(localTeam(info.team)); } break;
  }
}

// värden avgör matchen och kontrollerar därför sprängningar från de andra mot sin egen värld:
// RPG måste ha fri sikt från skytten, minor/claymore måste finnas där, försvarens skott måste komma från ett försvar som når dit
const _o = new THREE.Vector3(), _dd = new THREE.Vector3();
const ok3 = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const DEFW_N = new Set(['mine', 'clay', 'mortar', 'atgm', 'akan']);
const _dn = new THREE.Vector3(0, -1, 0), _e = new THREE.Vector3();
// ögat på en annan spelare: högst 2,6 m över det som finns under hen (mark, golv, tak) – en falsk höjd ger ingen utsikt
function eyeOf(p, out){
  const x = p.to.x, y = p.to.y, z = p.to.z; _e.set(x, y, z); const h = ray(_e, _dn, 60, p.col);
  const sup = h ? y - h.toi : hAt(x, z); return (out || new THREE.Vector3()).set(x, Math.min(y + 1.04, sup + 2.6), z);
}
// står positionen inne i en hel byggnadscell (mer än 15 cm från dess sidor)?
function solidAt(x, y, z){
  for (const B of DS.list){ const S = B.s, c = S.c, o = B.origin; if (x < o.x || z < o.z || x > o.x + S.w || z > o.z + S.d) continue;
    const fx = (x - o.x)/c, fz = (z - o.z)/c, fy = (y - o.y)/c + 1, i = Math.floor(fx), k = Math.floor(fz), j = Math.floor(fy);
    if (Math.min(fx - i, 1 - fx + i, fz - k, 1 - fz + k)*c < .15) continue;
    const cell = B.grid.get(B.key3(i, j, k)); if (cell && cell.alive) return true; }
  return false;
}
// en spelare som rört sig genom en hel vägg räknas som fuskare i 6 s: skott, sprängningar och träffar avvisas
const ghost = id => { if (fromHost(id)) return false; const p = NET.peers.get(id); return !!(p && p.ghostT > performance.now()); };
function hitSeen(from){ const p = NET.peers.get(from); if (!p || p.dead || ghost(from) || !PL.body) return false; const t = PL.body.translation(); eyeOf(p, _o); _cw.set(t.x, t.y + .5, t.z); return clearLine(_o, _cw, p.col, 1.2); }
const fromHost = id => NET.start && id === NET.start.host;
// fri sikt från o till punkten P (träff på det man siktade på eller strax före räknas som fri)
function clearLine(o, P, col, slack){ _dd.copy(P).sub(o); const L = _dd.length(); if (L < 2) return true; _dd.multiplyScalar(1/L); const h = ray(o, _dd, L, col); return !h || h.toi > L - slack; }
// skott på byggnadsceller från andra spelare: takt som ett automatvapen, vapnets skada, inom räckvidd och med fri sikt
export const CELL_MAX = 40, CELL_RATE = 14;
const _cw = new THREE.Vector3();
function cellAccepts(from, B, c){
  if (from === NET.me || fromHost(from)) return true; // värdens skott kommer från AI-soldaterna
  const p = NET.peers.get(from); if (!p || p.dead) return false;
  const now = performance.now(), w = p.cw || (p.cw = { t: now, n: 0 }); if (now - w.t > 1000){ w.t = now; w.n = 0; } if (++w.n > CELL_RATE) return false;
  B.pos(c, _cw); eyeOf(p, _o); if (_o.distanceTo(_cw) > 400) return false;
  return clearLine(_o, _cw, p.col, B.s.c*1.6);
}
// värden avgör matchen och kontrollerar därför sprängningar från de andra mot sin egen värld:
// RPG måste ha fri sikt från där den avfyrades, minor/claymore måste finnas (eller nyss ha sprängts) där,
// försvarens skott måste träffa nära avsändaren (det var den som försvaret sköt på) från motståndarlagets försvar i dess egen takt
const DEF_GAP = { granat: 3.0, pv: 4.0, akan: .3 }, MOUNT_GAP = { granat: 2.8, pv: 4.0, akan: .25 };
function hostAccepts(from, d){
  if (!NET.host || from === NET.me) return true;
  const p = NET.peers.get(from), P = new THREE.Vector3(d.p[0], d.p[1], d.p[2]), info = (NET.start.players || []).find(x => x.id === from);
  if (d.w === 'ammo' || d.w === 'bot') return false;
  if (d.w === 'rpg'){
    if (!p || p.dead) return false;
    eyeOf(p, _o); if (ok3(d.o) && Math.hypot(d.o[0] - _o.x, d.o[2] - _o.z) < 16 && d.o[1] <= _o.y + .5 && !solidAt(d.o[0], d.o[1], d.o[2])) _o.set(d.o[0], d.o[1], d.o[2]);
    return clearLine(_o, P, p.col, 3);
  }
  if (d.w === 'mine' || d.w === 'clay'){
    if (!p || Math.hypot(p.to.x - P.x, p.to.z - P.z) > 20) return false;
    const kind = d.w === 'mine' ? 'mine' : 'claymore', now = performance.now();
    if (DEF.list.some(x => x.kind === kind && x.alive && Math.hypot(x.pos.x - P.x, x.pos.z - P.z) < 4)) return true;
    const G0 = DEF.gone || [], gi = G0.findIndex(g => g.kind === kind && now - g.t < 2500 && Math.hypot(g.x - P.x, g.z - P.z) < 4); if (gi < 0) return false; G0.splice(gi, 1); return true;
  }
  if (d.w === 'mortar' || d.w === 'atgm' || d.w === 'akan'){
    if (!p || p.dead || !info || Math.hypot(p.to.x - P.x, p.to.z - P.z) > 20) return false;
    const t = d.w === 'mortar' ? 'granat' : d.w === 'atgm' ? 'pv' : 'akan', side = localTeam(info.team), now = performance.now();
    const g = DEF.list.find(x => x.kind === 'gun' && x.alive && x.it && x.it.t === t && x.it.side !== side && Math.hypot(x.pos.x - P.x, x.pos.z - P.z) < GUNS[t].range + 15 && now - (x.netT || 0) > DEF_GAP[t]*1000);
    if (!g) return false; g.netT = now; return true;
  }
  // bemannat vapen: avsändaren står vid ett eget vapen av den typen (och skjuter i dess takt, med fri sikt för direkt eld)
  if (d.w === 'akanM' || d.w === 'atgmM' || d.w === 'mortarM'){
    if (!p || !info) return false;
    const t = d.w === 'mortarM' ? 'granat' : d.w === 'atgmM' ? 'pv' : 'akan', side = localTeam(info.team), now = performance.now();
    const g = DEF.list.find(x => x.kind === 'gun' && x.alive && x.it && x.it.t === t && (x.it.side || 'us') === side && Math.hypot(x.pos.x - p.to.x, x.pos.z - p.to.z) < 4 && now - (x.netM || 0) > MOUNT_GAP[t]*1000);
    if (!g || Math.hypot(P.x - g.pos.x, P.z - g.pos.z) > GUNS[t].range + 15) return false;
    if (t !== 'granat' && !clearLine(g.pos, P, g.col, 3)) return false;
    g.netM = now; return true;
  }
  return true; // C4, sprängladdning och granat kontrolleras av servern (laddning satt / räckvidd / ammunition)
}
// ── andra spelare ─────────────────────────────────────────────────────────
function peerUpdate(id, d){
  if (![d.x, d.y, d.z, d.yaw].every(Number.isFinite)) return;
  let p = NET.peers.get(id);
  if (!p){
    const info = (NET.start.players || []).find(x => x.id === id); if (!info) return;
    const team = localTeam(info.team), M = soldierModel(team, 'gevar'); E.scene.add(M.g);
    p = { id, name: String(info.name).slice(0, 24), team, M, pos: new THREE.Vector3(d.x, d.y, d.z), to: new THREE.Vector3(d.x, d.y, d.z), yaw: d.yaw, dead: false };
    p.body = PH.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(d.x, d.y, d.z));
    // träffar på en fiendespelare skickas till den spelaren (den räknar sin egen hälsa)
    p.target = { alive: true, pos: p.pos, team, peer: id, hit: (dmg, pt, by) => {
      // spelarens egna skott och vårt lags AI träffar fiender; fiendens AI (hos värden) träffar oss; sprängningar räknar varje spelare själv
      const enemy = by === 'pl' || by === 'botUs' ? p.team === 'them' : by === 'botThem' ? p.team === 'us' : false;
      if (enemy) ev('hit', { to: id, dmg: Math.round(dmg), by: by === 'pl' ? undefined : 'AI', w: by === 'pl' ? (PL.gun ? 'mg' : PL.slot) : undefined }); } };
    p.col = own(PH.world.createCollider(R.ColliderDesc.capsule(.55, .35), p.body), { target: p.target, peer: id });
    NET.peers.set(id, p); BOTS.peers = [...NET.peers.values()];
  }
  if (!p.dead && !d.dead){ const ax = p.to.x, ay = p.to.y, az = p.to.z, L = Math.hypot(d.x - ax, d.y - ay, d.z - az), n = Math.min(40, Math.ceil(L/.4));
    if (L < 30) for (let s = 1; s <= n; s++){ const k = s/n; if (solidAt(ax + (d.x - ax)*k, ay + (d.y - ay)*k + .3, az + (d.z - az)*k)){ p.ghostT = performance.now() + 6000; break; } } }
  p.to.set(d.x, d.y, d.z); p.yaw = d.yaw; p.dead = !!d.dead; p.target.alive = !p.dead; p.moving = !!d.mv;
}
function peerRemove(id){ const p = NET.peers.get(id); if (!p) return; disposeModel(p.M); try { PH.world.removeRigidBody(p.body); } catch (e){} NET.peers.delete(id); BOTS.peers = [...NET.peers.values()]; }

// ── i matchen ─────────────────────────────────────────────────────────────
export function netBegin(){
  NET.on = true; NET.peers.clear(); BOTS.peers = [];
  // krokar: mina sprängningar och skott på byggnader skickas till de andra
  // laget skickas med (A/B) så att mottagarna inte skadar avsändarlagets egna soldater
  NETHOOK.plant = (kind, p) => ev('plant', { w: kind, p: [p.x, p.y, p.z].map(v => Math.round(v*100)/100) });
  NETHOOK.boom = (p, r, dmg, k, n, br, seed, team, w, o) => { if (!NET.applying) ev('boom', { w, o: o ? [o.x, o.y, o.z].map(v => Math.round(v*100)/100) : undefined, p: [p.x, p.y, p.z].map(v => Math.round(v*100)/100), r, dmg, k, n: n ? [n.x, n.y, n.z] : null, br: !!br, seed, team: team === 'us' || team === 'pl' ? NET.team : team === 'them' ? other(NET.team) : null }); };
  NETHOOK.host = !!NET.host;
  NETHOOK.dep = (k, p, r) => ev('dep', { k, p: [p.x, p.y, p.z].map(v => Math.round(v*100)/100), r: Math.round((r || 0)*100)/100 });
  NETHOOK.rev = (o) => { ev('rev', o); if (NET.host && o.to){ const tp = NET.peers.get(o.to); if (tp && tp.dead) BOTS.tickets[tp.team] = (BOTS.tickets[tp.team] || 0) + 1; } };
  NETHOOK.resup = () => ev('resup', {});
  ev('cls', { c: PL.cls });
  PL.onClass = c => ev('cls', { c });
  NETHOOK.cell = (c, dmg) => { const bi = DS.list.indexOf(c.b), ci = c.b.cells.indexOf(c); if (bi >= 0 && ci >= 0) ev('cell', { b: bi, c: ci, dmg: Math.round(dmg) }); };
  BOTS.onProxyHit = (id, dmg) => ev('hit', { to: 'host', bot: id, dmg: Math.round(dmg) });
}
export function netStop(reason){
  NET.on = false; NETHOOK.boom = NETHOOK.cell = NETHOOK.plant = NETHOOK.dep = NETHOOK.rev = NETHOOK.resup = null; PL.onClass = null; NETHOOK.host = null; BOTS.onProxyHit = null;
  for (const id of [...NET.peers.keys()]) peerRemove(id);
  if (reason && NET.ui.onStopped) NET.ui.onStopped(reason);
}
export function netTick(dt, matchOver){
  if (!NET.on) return;
  for (const p of NET.peers.values()){ p.pos.lerp(p.to, Math.min(1, dt*12)); p.M.g.position.set(p.pos.x, p.pos.y - .9, p.pos.z); p.M.g.rotation.set(p.dead ? -Math.PI/2 : 0, p.yaw + Math.PI, 0); p.body.setNextKinematicTranslation({ x: p.pos.x, y: p.dead ? -50 : p.pos.y, z: p.pos.z });
    p.ph = (p.ph || 0) + dt*(p.moving ? 9 : 0); const sw = p.moving ? Math.sin(p.ph)*.6 : 0; p.M.legL.rotation.x = sw; p.M.legR.rotation.x = -sw; }
  NET.t.st -= dt;
  if (NET.t.st <= 0 && PL.body){ NET.t.st = 1/12; const t = PL.body.translation(); ev('st', { x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2), yaw: +PL.yaw.toFixed(2), dead: PL.deadT > 0 ? 1 : 0, mv: (PL.speed || 0) > .5 ? 1 : 0 }); }
  if (!NET.host) return;
  NET.t.bots -= dt;
  if (NET.t.bots <= 0){ NET.t.bots = 1/8; ev('bots', { l: BOTS.list.filter(b => !b.proxy).map(b => [b.id, absTeam(b.team), b.kind, +b.pos.x.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(2), Math.round(b.hp), b.alive ? 1 : 0, b.moving ? 1 : 0, b.M.flash.visible ? 1 : 0]) }); }
  NET.t.tk -= dt;
  if (NET.t.tk <= 0){ NET.t.tk = .5; const d = { [NET.team]: BOTS.tickets.us, [other(NET.team)]: BOTS.tickets.them }; for (const k of ['A', 'B']){ const H = BOTS.hq[localTeam(k)]; if (H && H.dead) d['hq' + k] = 1; } ev('tk', d); }
}
export const netDead = () => ev('dead', { team: NET.team });
// slutet skickas som en orsakskod som varje spelare översätter för sitt eget lag (förut fick motståndaren värdens text)
const WHY_CODE = { 'Fiendens högkvarter är förstört': 'hq', 'Vårt högkvarter har fallit': 'hq', 'Fienden har slut på soldater': 'tk', 'Vi har slut på soldater': 'tk', 'Försvaret höll': 'held', 'Tiden är slut': 'time', 'Tiden är slut – mest kvar av sitt högkvarter vinner': 'frac' };
export function whyText(code, win){
  switch (code){
    case 'hq': return win ? 'Fiendens högkvarter är förstört' : 'Vårt högkvarter har fallit';
    case 'tk': return win ? 'Fienden har slut på soldater' : 'Vi har slut på soldater';
    case 'held': return win ? 'Anfallet stoppades – tiden är slut' : 'Försvaret höll – tiden är slut';
    case 'time': return 'Tiden är slut';
    case 'frac': return 'Tiden är slut – mest kvar av sitt högkvarter vinner';
  }
  return null;
}
export const netEnd = (winLocal, why) => ev('end', { winner: winLocal === null ? null : winLocal ? NET.team : other(NET.team), why, code: WHY_CODE[why] || null });
