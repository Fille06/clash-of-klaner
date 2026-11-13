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
import { BOTS, botProxySync, soldierModel, disposeModel } from './bots.js';
import { hudFeed } from './hud.js';

export const NET = { ws: null, me: null, token: null, room: null, start: null, on: false, host: false, team: 'A', peers: new Map(), applying: false, t: { st: 0, bots: 0, tk: 0 }, ui: {} };
const other = t => (t === 'A' ? 'B' : 'A');
export const absTeam = local => (local === 'us' ? NET.team : other(NET.team));
export const localTeam = abs => (abs === NET.team ? 'us' : 'them');

export function netConnect(url, name){
  return new Promise((resolve, reject) => {
    let ws; try { ws = new WebSocket(url); } catch (e){ reject(new Error('Ogiltig serveradress')); return; }
    NET.ws = ws; let done = false;
    ws.onopen = () => ws.send(JSON.stringify(Object.assign({ t: 'hello', v: 1, name: String(name || 'Soldat').slice(0, 24) }, NET.token ? { token: NET.token } : {})));
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x){ return; } if (m.t === 'welcome'){ NET.me = m.playerId; NET.token = m.token; if (!done){ done = true; resolve(m); } } handle(m); };
    ws.onerror = () => { if (!done){ done = true; reject(new Error('Kunde inte ansluta till servern')); } };
    ws.onclose = () => { NET.ws = null; if (NET.on) netStop('Anslutningen bröts'); NET.ui.onClosed && NET.ui.onClosed('Frånkopplad från servern'); };
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
    case 'boom': if (Array.isArray(d.p) && d.p.length === 3 && d.p.every(Number.isFinite) && Number.isFinite(d.r) && Number.isFinite(d.dmg)){ const n = Array.isArray(d.n) && d.n.length === 3 && d.n.every(Number.isFinite) ? new THREE.Vector3(...d.n) : null; NET.applying = true; try { explode(new THREE.Vector3(...d.p), Math.max(0, Math.min(d.r, 8)), Math.max(0, Math.min(d.dmg, 3000)), Math.max(0, Math.min(d.k || 1, 2)), n, !!d.br, false, d.team === 'A' || d.team === 'B' ? localTeam(d.team) : null, Number.isInteger(d.seed) ? d.seed : null); } finally { NET.applying = false; } } break;
    case 'cell': { const B = DS.list[d.b], c = B && B.cells[d.c]; if (c && Number.isFinite(d.dmg)) B.hit(c, Math.max(0, Math.min(d.dmg, 200)), null); break; }
    case 'hit': if (Number.isFinite(d.dmg)){ const dmg = Math.max(0, Math.min(d.dmg, 150));
      // värden: bara träffar på motståndarlagets AI-soldater räknas
      if (d.bot && NET.host){ const b = BOTS.list.find(x => x.id === d.bot), info = (NET.start.players || []).find(x => x.id === from); if (b && b.alive && b.target && info && b.team !== localTeam(info.team)) b.target.hit(dmg, null, 'net'); }
      else if (d.to === NET.me && PL.hp > 0){ PL.hp -= dmg; PL.dmgT = .8; const p = NET.peers.get(from); PL.lastHit = { by: p ? p.name : (d.by || 'FIENDE'), x: p ? p.pos.x : 0, z: p ? p.pos.z : 0 }; if (p) PL.hurtFrom = { x: p.pos.x, z: p.pos.z, t: 1.2 }; } }
      break;
    case 'dead': if (NET.host && (d.team === 'A' || d.team === 'B')){ const lt = localTeam(d.team); BOTS.tickets[lt] = Math.max(0, BOTS.tickets[lt] - 1); } { const p = NET.peers.get(from); if (p) p.dead = true; } break;
    case 'bots': if (!NET.host && Array.isArray(d.l)) botProxySync(d.l.map(r => ({ id: r[0], team: localTeam(r[1]), kind: r[2], x: r[3], z: r[4], yaw: r[5], hp: r[6], alive: !!r[7], moving: !!r[8], fire: !!r[9] }))); break;
    case 'tk': if (!NET.host){ BOTS.tickets.us = d[NET.team] ?? BOTS.tickets.us; BOTS.tickets.them = d[other(NET.team)] ?? BOTS.tickets.them; for (const k of ['A', 'B']) if (d['hq' + k] && BOTS.hq[localTeam(k)]) BOTS.hq[localTeam(k)].dead = true; } break;
    case 'end': if (!NET.host && NET.ui.onEnd){ const w = d.winner === null ? null : d.winner === NET.team; NET.ui.onEnd(w, whyText(d.code, w) || String(d.why || '').slice(0, 120)); } break;
    case 'left': { const nm = NET.peers.get(from)?.name || 'En spelare'; peerRemove(from); hudFeed(nm, '', 'LÄMNADE'); } break;
  }
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
      if (enemy) ev('hit', { to: id, dmg: Math.round(dmg), by: by === 'pl' ? undefined : 'AI' }); } };
    p.col = own(PH.world.createCollider(R.ColliderDesc.capsule(.55, .35), p.body), { target: p.target, peer: id });
    NET.peers.set(id, p); BOTS.peers = [...NET.peers.values()];
  }
  p.to.set(d.x, d.y, d.z); p.yaw = d.yaw; p.dead = !!d.dead; p.target.alive = !p.dead; p.moving = !!d.mv;
}
function peerRemove(id){ const p = NET.peers.get(id); if (!p) return; disposeModel(p.M); try { PH.world.removeRigidBody(p.body); } catch (e){} NET.peers.delete(id); BOTS.peers = [...NET.peers.values()]; }

// ── i matchen ─────────────────────────────────────────────────────────────
export function netBegin(){
  NET.on = true; NET.peers.clear(); BOTS.peers = [];
  // krokar: mina sprängningar och skott på byggnader skickas till de andra
  // laget skickas med (A/B) så att mottagarna inte skadar avsändarlagets egna soldater
  NETHOOK.boom = (p, r, dmg, k, n, br, seed, team) => { if (!NET.applying) ev('boom', { p: [p.x, p.y, p.z].map(v => Math.round(v*100)/100), r, dmg, k, n: n ? [n.x, n.y, n.z] : null, br: !!br, seed, team: team === 'us' ? NET.team : team === 'them' ? other(NET.team) : null }); };
  NETHOOK.cell = (c, dmg) => { const bi = DS.list.indexOf(c.b), ci = c.b.cells.indexOf(c); if (bi >= 0 && ci >= 0) ev('cell', { b: bi, c: ci, dmg: Math.round(dmg) }); };
  BOTS.onProxyHit = (id, dmg) => ev('hit', { to: 'host', bot: id, dmg: Math.round(dmg) });
}
export function netStop(reason){
  NET.on = false; NETHOOK.boom = NETHOOK.cell = null; BOTS.onProxyHit = null;
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
