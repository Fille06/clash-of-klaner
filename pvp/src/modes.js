// LÄGEN: BAS MOT BAS och FÖRSVAR MOT ANFALL mot AI (lag 1v1 – 20v20). Bygger kartan med baserna,
// startar AI-soldaterna (bots.js), räknar biljetter (liv) och avgör vinnaren.
import * as THREE from 'three';
import { E } from './engine.js';
import { PL, initPlayer } from './player.js';
import { initHud, hudFeed, hudPoints } from './hud.js';
import { W, resetWorld } from './world.js';
import { BD, buildPlot, rebuild, normBase, loadSlots, decodeBase } from './builder.js';
import { T, terPhysics, hAt, terRot180 } from './terrain.js';
import { DEF, defStart, defStop } from './defense.js';
import { partsStart, partsStop } from './parts.js';
import { BOTS, botsStart, botsClear, botTargets, botAdd } from './bots.js';
import { aiBase3d } from './aibase.js';
import { DS } from './destruct.js';
import { NET, netBegin, netStop, netTick, netDead, netEnd } from './net.js';

export const MATCH = { on: false, cfg: null, t: 0, over: false, tick: { us: 0, cn: 0, max: 1 }, onEnd: null, wasDead: false };
export const SIZES = [1, 5, 10, 20];
const OFF = -100; // fiendens tomt i bas mot bas (z)

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// inställningsskärm i menyn
export function setupHtml(mode){
  const slots = loadSlots(), slotOpts = slots.map((b, i) => b && b.items.some(x => x.t === 'hq') ? `<option value="slot${i}">Plats ${i + 1} (${b.items.length} delar)</option>` : '').join('');
  const fma = mode === 'fma';
  return `<div class="logo">${fma ? 'FÖRSVAR MOT ANFALL' : 'BAS MOT BAS'}<small>MOT AI · LAG 1 MOT 1 TILL 20 MOT 20</small></div>
  <div class="setup">
    ${fma ? `<label>DIN ROLL <select id="mRole"><option value="defend">FÖRSVARA DIN BAS</option><option value="attack">ANFALLA FIENDENS BAS</option></select></label>` : ''}
    <label id="mOwnL">DIN BAS <select id="mOwn">${slotOpts}<option value="ai">AI-BAS (om du inte byggt någon)</option></select></label>
    <label id="mEnemyL">FIENDENS BAS <select id="mEnemy"><option value="ai">AI-BAS</option><option value="code">BASKOD FRÅN EN VÄN</option></select></label>
    <label id="mCodeL" style="display:none">BASKOD <input id="mCode" placeholder="klistra in baskoden"></label>
    <label>LAGSTORLEK <select id="mSize">${SIZES.map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} MOT ${n}</option>`).join('')}</select></label>
    <label>SVÅRIGHET <select id="mDiff"><option value="latt">LÄTT</option><option value="normal" selected>NORMAL</option><option value="svar">SVÅR</option></select></label>
    <div class="row"><div class="it" id="mGo">STARTA<small>Du och dina AI-kamrater mot AI-fienden</small></div><div class="it" id="mBack">‹ TILLBAKA<small></small></div></div>
    <div class="note" id="mNote"></div>
  </div>`;
}
export function bindSetup(mode, back){
  const $ = id => document.getElementById(id), upd = () => {
    const role = $('mRole') ? $('mRole').value : null;
    if ($('mOwnL')) $('mOwnL').style.display = mode === 'fma' && role === 'attack' ? 'none' : '';
    if ($('mEnemyL')) $('mEnemyL').style.display = mode === 'fma' && role === 'defend' ? 'none' : '';
    $('mCodeL').style.display = $('mEnemy').value === 'code' && $('mEnemyL').style.display !== 'none' ? '' : 'none';
  };
  for (const id of ['mRole', 'mEnemy']) if ($(id)) $(id).onchange = upd; upd();
  $('mBack').onclick = back;
  $('mGo').onclick = async () => {
    const cfg = { mode, role: $('mRole') ? $('mRole').value : 'both', size: +$('mSize').value, diff: $('mDiff').value, own: null, enemy: null };
    const ov = $('mOwn').value; cfg.own = ov.startsWith('slot') ? loadSlots()[+ov.slice(4)] : aiBase3d(Date.now() % 100000, 'normal');
    if ($('mEnemy').value === 'code'){ try { cfg.enemy = await decodeBase($('mCode').value); } catch (e){ $('mNote').textContent = 'Ogiltig baskod'; return; } if (!cfg.enemy.items.some(i => i.t === 'hq')){ $('mNote').textContent = 'Baskoden saknar högkvarter'; return; } }
    else cfg.enemy = aiBase3d(Math.floor(Math.random()*1e6), cfg.diff);
    startMatch(cfg);
  };
}

// lagets AI-soldater: roller och vapen
// sorterna fördelas efter roll: anfallarna får ingenjörer och RPG först (de behövs för att fälla högkvarteret), försvararna gevär och RPG
const ATT_KINDS = ['ing', 'rpg', 'gevar', 'ing', 'gevar', 'rpg'], DEF_KINDS = ['gevar', 'rpg', 'gevar', 'gevar'];
function squad(n, roleFor){ const out = []; let a = 0, d = 0; for (let i = 0; i < n; i++){ const role = roleFor(i, n); out.push({ role, kind: role === 'attack' ? ATT_KINDS[a++ % ATT_KINDS.length] : DEF_KINDS[d++ % DEF_KINDS.length] }); } return out; }

// ONLINE: bygg matchen från serverns startmeddelande. Lag A:s bas ligger alltid på tomt 1 och lag B:s på tomt 2
// (bas mot bas), så alla spelare har samma karta. "Vi" = mitt lag.
export async function startOnline(m){
  const S = m.settings, me = NET.team, other = me === 'A' ? 'B' : 'A';
  const baseOf = async team => { const p = m.players.find(x => x.team === team && x.base); if (p){ try { const b = await decodeBase(p.base); if (b.items.some(i => i.t === 'hq')) return b; } catch (e){} } return aiBase3d((m.seed + (team === 'A' ? 1 : 2)) % 1e6, S.diff); };
  const humans = t => m.players.filter(p => p.team === t).length;
  const cfg = { mode: S.mode, size: S.size, diff: S.diff, net: { me, host: NET.host, humans: { us: humans(me), them: humans(other) } } };
  if (S.mode === 'bmb'){ cfg.role = 'both'; cfg.own = await baseOf(me); cfg.enemy = await baseOf(other); cfg.ownPlot = me === 'A' ? 0 : 1; }
  else { const D = S.defender || 'A'; cfg.role = me === D ? 'defend' : 'attack'; const b = await baseOf(D); if (me === D) cfg.own = b; else cfg.enemy = b; }
  netBegin(); startMatch(cfg);
}

export function startMatch(cfg){
  const bmb = cfg.mode === 'bmb', defend = cfg.mode === 'fma' && cfg.role === 'defend', attack = cfg.mode === 'fma' && cfg.role === 'attack';
  const net = cfg.net || null, flip = bmb && cfg.ownPlot === 1; // online i lag B: vår bas ligger på tomt 2
  defStop(); partsStop(); botsClear(); resetWorld(); T.grid = false;
  let own = normBase(cfg.own), enemy = normBase(cfg.enemy);
  // bas mot bas: basen på tomt 1 (z = 0) vänds 180° så att dess front (+z i byggaren) pekar mot fienden på tomt 2
  if (bmb){ const rot = b => b && { items: b.items.map(i => Object.assign({}, i, { x: -i.x, z: -i.z, rot: ((i.rot || 0) + 2) % 4 }, i.dir != null ? { dir: (i.dir + 180) % 360 } : {})), ter: b.ter ? terRot180(b.ter) : null }; if (flip) enemy = rot(enemy); else own = rot(own); }
  // kartan: bas mot bas = två tomter, annars en tomt med den bas som försvaras
  const home = attack ? enemy : own;
  if (bmb) buildPlot(flip ? enemy.ter : own.ter, { half: 150, plots: [{ x: 0, z: 0 }, { x: 0, z: OFF }], extra: [flip ? own.ter : enemy.ter] });
  else buildPlot(home.ter);
  const budget = BD.budget; BD.budget = 2000;
  const ours = bmb || defend ? own.items.map(i => ({ ...i, side: 'us' })) : [];
  const theirs = bmb || attack ? enemy.items.map(i => ({ ...i, side: 'them' })) : [];
  // samma byggordning hos alla spelare (lag A först) så att byggnadernas nummer stämmer i nätverket
  const first = flip ? theirs : ours, second = flip ? ours : theirs;
  if (first.length) rebuild(first);
  if (second.length) rebuild(second, { dz: bmb ? OFF : 0 });
  BD.budget = budget;
  for (const it of [...ours, ...theirs]) if (it.b) it.b.side = it.side;
  // online: bara värden låter försvaren skjuta på AI-soldater (hos de andra är de skuggor som värden styr)
  terPhysics(); defStart(); DEF.extra = net && !net.host ? () => [] : () => botTargets(null);
  // försvarens räckvidd i lägena: startplatserna ska ligga utom räckhåll (egen bas kan ha prickskytt i framkanten)
  DEF.maxRange = bmb ? 85 : 110;
  // försvaren gör något mindre skada mot AI-soldater i bas mot bas, så att ett anfall kan bryta igenom och högkvarteret avgör
  BOTS.defDmg = bmb ? .6 : 1;
  // online: en spelare som lämnar ersätts av en AI-soldat (värden)
  if (net && net.host) NET.ui.replace = team => botAdd(team, bmb ? 'attack' : team === (defend ? 'us' : 'them') ? 'defend' : 'attack', 'gevar');
  partsStart([...ours, ...theirs].map(i => Object.assign(i, { explosive: !!(BD.CAT[i.t] && BD.CAT[i.t].explosive) })));
  const hqUs = ours.find(i => i.t === 'hq'), hqThem = theirs.find(i => i.t === 'hq');
  // var lagen startar
  const n = cfg.size, spawns = bmb
    // vid sidan av den egna basen (förut bakom den – anfallarna fick gå runt basen och A* gav upp)
    // startplatserna ligger utom räckhåll för fiendens alla vapen (försvarens räckvidd är högst 85 m i bas mot bas)
    ? (flip ? { us: { x: -48, z: OFF - 10, r: 6 }, them: { x: 48, z: 10, r: 6 } } : { us: { x: 48, z: 10, r: 6 }, them: { x: -48, z: OFF - 10, r: 6 } })
    // anfallarna startar utom räckhåll för försvarens längsta vapen (prickskytt 130 m)
    : defend ? { us: { x: 0, z: -26, r: 5 }, them: { x: 0, z: 150, r: 10 } } : { us: { x: 0, z: 150, r: 6 }, them: { x: 0, z: -26, r: 5 } };
  if (defend || attack){ const ds = defend ? spawns.us : spawns.them; ds.x = 0; ds.z = 0; ds.r = 22; }
  const split = (i, k) => (i / Math.max(1, k)) < .6 ? 'attack' : 'defend';
  // AI fyller tomma platser: offline alla utom jag, online räknar värden bort de riktiga spelarna i varje lag
  const nUs = net ? Math.max(0, n - net.humans.us) : n - 1, nThem = net ? Math.max(0, n - net.humans.them) : n;
  botsStart({
    noAi: !!(net && !net.host),
    bounds: bmb ? { x0: -70, x1: 70, z0: OFF - 70, z1: 70 } : { x0: -75, x1: 75, z0: -75, z1: 162 },
    spawns,
    hq: { us: hqUs && hqUs.b, them: hqThem && hqThem.b },
    us: squad(nUs, (i, k) => bmb ? split(i + 1, k + 1) : defend ? 'defend' : 'attack'),
    them: squad(nThem, (i, k) => bmb ? split(i, k) : defend ? 'attack' : 'defend'),
    tickets: { us: n*8, them: n*8 }, diff: cfg.diff,
  });
  // spelaren
  const sp = spawns.us, px = sp.x + (bmb ? 0 : 3) + (net ? (Math.random() - .5)*6 : 0), pz = defend ? 24 : sp.z;
  W.map = 'match'; if (window.G) window.G.state = 'play'; MATCH.id = (MATCH.id || 0) + 1; MATCH.on = true; MATCH.cfg = cfg; MATCH.over = false; MATCH.result = null; MATCH.t = bmb ? 900 : 480; MATCH.wasDead = false;
  MATCH.tick.us = BOTS.tickets.us; MATCH.tick.cn = BOTS.tickets.them; MATCH.tick.max = Math.max(1, n*8);
  const flags = []; if (hqUs) flags.push({ n: 'HQ', x: hqUs.x, z: hqUs.z, y: 8, own: 'us' }); if (hqThem) flags.push({ n: 'FI', x: hqThem.x, z: hqThem.z, y: 8, own: 'cn' });
  document.getElementById('menu').classList.add('hidden'); document.getElementById('hud').classList.remove('hidden');
  if (PL.vm) PL.vm.visible = true; PL.deadT = 0; PL.death = null; PL.lastHit = null; PL.hurtFrom = null;
  initPlayer({ x: px, y: hAt(px, pz) + .3, z: pz, yaw: (bmb && !flip) || attack ? 0 : Math.PI });
  initHud({ flags, tick: MATCH.tick, squad: ['ALFA', 'Du', ...BOTS.list.filter(b => b.team === 'us').slice(0, 4).map(b => b.name)] });
  BOTS.onKill = (b, by) => { if (by === 'Du'){ hudFeed('Du', b.name, 'AK-12'); hudPoints(100, 'FIENDE NEDSKJUTEN'); } };
  BOTS.onEvent = e => { if (e.t === 'hq') hudPoints(0, e.team === 'us' ? 'VÅRT HÖGKVARTER HAR FALLIT' : 'FIENDENS HÖGKVARTER HAR FALLIT'); };
  const goal = bmb ? 'Förstör fiendens högkvarter – försvara ditt eget' : defend ? 'Försvara högkvarteret tills tiden är slut' : 'Förstör fiendens högkvarter';
  PL.msg = goal.toUpperCase(); PL.msgT = 5;
  lockPointer(document.getElementById('c'));
}

export function stopMatch(){ MATCH.on = false; MATCH.id = (MATCH.id || 0) + 1; DEF.maxRange = null; botsClear(); DEF.extra = null; if (NET.on) netStop(); }

export function updateMatch(dt){
  if (!MATCH.on || MATCH.over) return;
  const cfg = MATCH.cfg, bmb = cfg.mode === 'bmb', defend = cfg.mode === 'fma' && cfg.role === 'defend';
  MATCH.t -= dt;
  netTick(dt);
  // spelaren dog: ett liv dras från laget (online räknar värden)
  const dead = PL.deadT > 0;
  if (dead && !MATCH.wasDead){ if (!NET.on || NET.host) BOTS.tickets.us = Math.max(0, BOTS.tickets.us - 1); else netDead(); }
  MATCH.wasDead = dead;
  MATCH.tick.us = BOTS.tickets.us; MATCH.tick.cn = BOTS.tickets.them;
  if (NET.on && !NET.host) return; // värden avgör matchen och skickar resultatet
  const hqUs = BOTS.hq.us, hqThem = BOTS.hq.them;
  // ett lag är slut när det saknar liv och har inga anfallare kvar (försvarare kan inte ta fiendens högkvarter; i försvar/anfall räknas alla)
  const humansAlive = team => (team === 'us' && PL.hp > 0 && !(PL.deadT > 0)) || (BOTS.peers || []).some(p => p.team === team && !p.dead);
  const out = team => BOTS.tickets[team] <= 0 && !BOTS.list.some(b => b.team === team && b.alive && (!bmb || b.role === 'attack')) && !humansAlive(team);
  let win = null, why = '';
  if (hqThem && hqThem.dead){ win = true; why = 'Fiendens högkvarter är förstört'; }
  else if (hqUs && hqUs.dead){ win = false; why = 'Vårt högkvarter har fallit'; }
  else if (out('them')){ win = true; why = 'Fienden har slut på soldater'; }
  else if (out('us')){ win = false; why = 'Vi har slut på soldater'; }
  else if (MATCH.t <= 0){
    if (defend){ win = true; why = 'Försvaret höll'; }
    else if (bmb){ const a = hqUs ? hqUs.frac : 1, b = hqThem ? hqThem.frac : 1; win = a > b ? true : a < b ? false : null; why = 'Tiden är slut – mest kvar av sitt högkvarter vinner'; }
    else { win = false; why = 'Tiden är slut'; }
  }
  // försvar mot anfall: lagen byter sida i halvtid (Filips beslut 2026-11-12). Offline – online avgör värden en halvlek.
  if (why && cfg.mode === 'fma' && !cfg.half && !NET.on){
    MATCH.over = true; PL.msg = `HALVTID – ${win ? 'HALVLEKEN VUNNEN' : win === false ? 'HALVLEKEN FÖRLORAD' : 'OAVGJORD HALVLEK'}. LAGEN BYTER SIDA`; PL.msgT = 4;
    const role = cfg.role === 'defend' ? 'attack' : 'defend', cfg2 = { ...cfg, role, half: 2, half1: { win, why } };
    if (role === 'attack' && !cfg2.enemy) cfg2.enemy = aiBase3d((Date.now() % 1e6) | 0, cfg.diff);
    if (role === 'defend' && !cfg2.own){ const mine = loadSlots().find(b => b && b.items.some(i => i.t === 'hq')); cfg2.own = mine || aiBase3d((Date.now() % 1e6) | 0, cfg.diff); }
    const id = MATCH.id; setTimeout(() => { if (MATCH.on && MATCH.id === id) startMatch(cfg2); }, 3000);
    return;
  }
  if (why && cfg.half === 2 && cfg.half1){ const w1 = cfg.half1.win, w2 = win; why = `Halvlek 1: ${w1 ? 'vunnen' : w1 === false ? 'förlorad' : 'oavgjord'} · Halvlek 2: ${w2 ? 'vunnen' : w2 === false ? 'förlorad' : 'oavgjord'}`; win = w1 === w2 ? w1 : (w1 === null ? w2 : w2 === null ? w1 : null); }
  if (why){ if (NET.on) netEnd(win, why); MATCH.over = true; MATCH.result = { win, why }; { const id = MATCH.id; setTimeout(() => { if (MATCH.id !== id) return; stopMatch(); MATCH.onEnd && MATCH.onEnd(MATCH.result); }, 2500); } PL.msg = (win ? 'SEGER! ' : win === false ? 'FÖRLUST. ' : 'OAVGJORT. ') + why.toUpperCase(); PL.msgT = 4; }
}
export const matchTimeLeft = () => Math.max(0, MATCH.t);
// online: värden meddelade resultatet
export function endFromHost(win, why){ if (!MATCH.on || MATCH.over) return; MATCH.over = true; MATCH.result = { win, why }; PL.msg = (win ? 'SEGER! ' : win === false ? 'FÖRLUST. ' : 'OAVGJORT. ') + why.toUpperCase(); PL.msgT = 4; (id => setTimeout(() => { if (MATCH.id !== id) return; stopMatch(); MATCH.onEnd && MATCH.onEnd(MATCH.result); }, 2500))(MATCH.id); }
// pekarlåset kan nekas (dold flik, inbäddad sida) – fånga felet i stället för ett ohanterat promise-fel
function lockPointer(el){ try { const p = el && el.requestPointerLock && el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e){} }
