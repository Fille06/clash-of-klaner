// Start: laddning, meny (lobby) och huvudloop.
import * as THREE from 'three';
import { E, initEngine, loadSky, render, followSun } from './engine.js';
import { initPhysics, stepPhysics } from './physics.js';
import { initFx, updateFx, fx } from './fx.js';
import { DS, updateDestruct } from './destruct.js';
import { PL, initPlayer, bindInput, updatePlayer } from './player.js';
import { initHud, updateHud, hudFeed, hudPoints } from './hud.js';
import { MAP, buildTraining } from './map.js';
import { sfx, audioOn } from './audio.js';
import { W, markPersistent, resetWorld } from './world.js';
import { BD, startBuilder, stopBuilder, bindBuilder, updateBuilder, loadSlots, buildPlot, rebuild, normBase } from './builder.js';
import { T, terPhysics, terUpdate, hAt } from './terrain.js';
import { DEF, defStart, defStop, updateDefense } from './defense.js';
import { DEV, devTick, bindDev, setDev } from './dev.js';
import { updateProps } from './props.js';
import { partsStart, partsStop, updateParts } from './parts.js';
import { updateBots, BOTS } from './bots.js';
import { MATCH, setupHtml, bindSetup, updateMatch, stopMatch } from './modes.js';
import { onlineScreen } from './online.js';
import { NET } from './net.js';

const G = window.G = { state: 'menu', E, PL, DS, MAP, fx, THREE, T };
const $ = id => document.getElementById(id);
const bar = (f, s) => { $('lbar').style.width = (f*100) + '%'; $('lmsg').textContent = s; };

async function boot(){
  try {
    bar(.1, 'Startar grafikmotorn'); initEngine($('c'));
    bar(.3, 'Startar fysiken'); await initPhysics();
    bar(.5, 'Laddar himmel och ljus'); await loadSky('kloofendal_48d_partly_cloudy_puresky_2k.hdr');
    bar(.7, 'Bygger kartan'); initFx(); markPersistent(); buildTraining(); W.map = 'training';
    bar(.95, 'Klart'); bindInput($('c')); bindBuilder($('c')); bindDev();
    BD.onMenu = () => { stopBuilder(); menu('main'); }; BD.onTest = base => testBase(base);
    DEF.onKill = d => { hudFeed('Du', { gun: d.g && d.g.name, mine: 'MINA', wire: 'TAGGTRÅD' }[d.kind] || 'FÖRSVAR', d.kind === 'mine' ? 'MINA' : 'AK-12'); if (d.kind === 'gun') hudPoints(150, 'FÖRSVAR FÖRSTÖRT'); };
    DS.onCollapse = (b, n) => { sfx.rumble(); hudFeed('Du', 'HÖGHUSET', 'RAS'); hudPoints(500, 'BYGGNAD FÖRSTÖRD'); };
    setTimeout(() => $('load').classList.add('hidden'), 250);
    menu('main'); requestAnimationFrame(loop);
  } catch (e){ console.error(e); bar(1, 'Fel: ' + e.message); }
}
// MENY – lobbyn. Bara Övning är spelbar i fas A, resten byggs i kommande faser.
const MENUS = {
  main: [['SPELA', 'Bas mot bas · Försvar mot anfall · Övning', () => menu('play')], ['BASBYGGAREN', 'Bygg din bas med byggpoäng – allt går att spränga', () => build()], ['MINA BASER', 'Sparade baser – bygg vidare eller testa', () => menu('bases')], ['INSTÄLLNINGAR', 'Grafik, ljud, styrning', null]],
  get bases(){ const s = loadSlots(); return s.map((b, i) => [`PLATS ${i + 1}`, b ? `${b.items.length} byggnader${b.ter ? ' · egen terräng' : ''} – klicka för att bygga vidare` : 'Tom', b ? () => build(b) : null]).concat(s.map((b, i) => [`TESTA PLATS ${i + 1} ›`, b ? 'Gå in i basen och spräng den' : '', b ? () => testBase(b) : null]).filter(x => x[2]), [['‹ TILLBAKA', '', () => menu('main')]]); },
  play: [['BAS MOT BAS', 'Båda lagen har sin bas – förstör fiendens högkvarter, försvara ditt eget', () => setup('bmb')], ['FÖRSVAR MOT ANFALL', 'Försvara din bas eller anfall fiendens – mot AI-soldater', () => setup('fma')], ['SPELA ONLINE', 'Mot riktiga spelare via en spelserver – AI fyller tomma platser', () => onlineScreen(() => menu('play'))], ['ÖVNING', 'Testa vapen, sprängning och ras', () => start()], ['‹ TILLBAKA', '', () => menu('main')]],
};
function build(items){ $('menu').classList.add('hidden'); $('hud').classList.add('hidden'); G.state = 'build'; PL.on = false; if (PL.vm) PL.vm.visible = false; W.map = 'plot'; startBuilder(items); }
// testa en bas: byggtomten med dina byggnader, du går in till fots
function testBase(base){
  base = normBase(base);
  if (!base || !base.items.some(i => i.t === 'hq')) return; // en bas utan högkvarter går inte att spela
  stopBuilder(); resetWorld(); T.grid = false; buildPlot(base.ter); const its = base.items.map(i => ({ ...i })); rebuild(its); terPhysics(); defStart(); partsStart(its.map(i => Object.assign(i, { explosive: !!(BD.CAT && BD.CAT[i.t] && BD.CAT[i.t].explosive) }))); MAP.roads = []; MAP.blocks = []; W.map = 'plot';
  const hq = its.find(i => i.t === 'hq');
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); G.state = 'play'; if (PL.vm) PL.vm.visible = true;
  const sz = BD.plot/2 + 8; initPlayer({ x: 0, y: hAt(0, sz) + .3, z: sz, yaw: 0 }); initHud({ flags: hq ? [{ n: 'HQ', x: hq.x, z: hq.z, y: 8, own: 'us' }] : [], tick: { us: 400, cn: 400, max: 400 }, squad: ['ALFA', 'Du'] });
  lockPointer($('c'));
}
function setup(mode){ const m = $('menu'); m.classList.remove('hidden'); m.innerHTML = setupHtml(mode); bindSetup(mode, () => menu('play')); }
MATCH.onEnd = r => { menu('main'); const m = $('menu'), box = document.createElement('div'); box.className = 'result ' + (r.win ? 'win' : r.win === false ? 'loss' : ''); box.innerHTML = `<b>${r.win ? 'SEGER' : r.win === false ? 'FÖRLUST' : 'OAVGJORT'}</b><small>${r.why}</small>`; m.insertBefore(box, m.children[1]); };
function menu(k){
  G.state = 'menu'; defStop(); partsStop(); if (MATCH.on) stopMatch(); PL.on = false; $('hud').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock();
  const m = $('menu'); m.classList.remove('hidden');
  m.innerHTML = `<div class="logo">CLASH OF KLANER<small>SPELARE MOT SPELARE</small></div><div class="list">${MENUS[k].map((it, i) => `<div class="it ${it[2] ? '' : 'dis'}" data-i="${i}">${it[0]}<small>${it[1]}</small></div>`).join('')}</div>
    <div class="info">ÖPPEN BETA · FÖRSTÖRELSE · RAPIER-FYSIK · THREE.JS · TRYCK 0 FÖR UTVECKLARLÄGE</div>`;
  m.querySelectorAll('.it').forEach(el => el.onclick = () => { audioOn(); const f = MENUS[k][+el.dataset.i][2]; if (f) f(); });
}
function start(){
  defStop(); if (W.map !== 'training'){ resetWorld(); buildTraining(); W.map = 'training'; }
  if (PL.vm) PL.vm.visible = true;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); G.state = 'play';
  initPlayer(MAP.spawn); initHud({ flags: MAP.flags, tick: { us: 400, cn: 400, max: 400 }, squad: ['ALFA', 'Du', 'Tom plats', 'Tom plats', 'Tom plats'] });
  lockPointer($('c'));
}
addEventListener('keydown', e => { if (e.code === 'Escape' && G.state === 'play') setTimeout(() => menu('main'), 0); if (e.code === 'Escape' && G.state === 'build'){ stopBuilder(); menu('main'); } });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.state === 'play') PL.trig = false; });

let last = performance.now(), menuA = 0;
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last)/1000); last = now; frame(dt);
}
// test: kör n bilder direkt (fungerar även när fliken är dold och webbläsaren pausar animationen)
G.run = (sec, dt = 1/60) => { const t0 = performance.now(); for (let i = 0; i < sec/dt; i++) frame(dt, i < sec/dt - 1); return Math.round(performance.now() - t0); };
// test: spara bilden till tester/shots/<namn>.jpg via servern i Blender
G.shot = async (name) => { G.run(.02); const c = $('c'), o = document.createElement('canvas'); o.width = 960; o.height = Math.round(960*c.height/c.width); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); const r = await fetch('/save?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', .85) }); return r.status; };
G.DEF = DEF; G.DEV = DEV; G.BOTS = BOTS; G.MATCH = MATCH; G.setup = setup; G.NET = NET; G.dev = setDev; G.build = build; G.BD = BD; G.testBase = b => testBase(b); G.start = (k) => { menu('play'); const its = [...document.querySelectorAll('#menu .it')]; (k != null ? its[k] : its.find(e => e.textContent.startsWith('ÖVNING'))).click(); };
G.tp = (x, z, yaw, pitch) => { PL.body.setTranslation({ x, y: 1.2, z }, true); PL.yaw = yaw || 0; PL.pitch = pitch || 0; };
function frame(dt, skipDraw){
  if (G.state === 'menu' && W.map === 'training'){ // långsam kameraåkning runt höghuset bakom menyn
    menuA += dt*.05; E.cam.position.set(Math.sin(menuA)*52, 9 + Math.sin(menuA*.7)*3, -34 + Math.cos(menuA)*52); E.cam.lookAt(0, 14, -34); followSun(E.cam.position);
  }
  devTick();
  if (G.state === 'build') updateBuilder(dt);
  updatePlayer(dt); stepPhysics(dt); updateDestruct(dt); updateFx(dt); terUpdate(dt); updateDefense(dt); updateProps(dt); updateParts(dt); updateBots(dt); updateMatch(dt); updateHud(dt); if (!skipDraw) render(dt);
  if (dt > 0) G.fps = (G.fps || 60)*.95 + (1/dt)*.05;
}
boot();
// pekarlåset kan nekas (dold flik, inbäddad sida) – fånga felet i stället för ett ohanterat promise-fel
function lockPointer(el){ try { const p = el && el.requestPointerLock && el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e){} }
