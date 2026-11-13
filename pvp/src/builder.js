// BASBYGGAREN (fas B) – bygg din bas på en tomt med byggpoäng och forma marken under (höjder, skog, vatten).
// Allt du bygger är förstörbara cellbyggnader. Spara i tre platser, dela med baskod, testa basen direkt i spelet.
import * as THREE from 'three';
import { E, pbr } from './engine.js';
import { R, PH } from './physics.js';
import { addBuilding, DS } from './destruct.js';
import { resetWorld } from './world.js';
import { DEF, defMake, defDispose, defShowFan, defRefreshFan, GUNS, SECTORS, PRIOS, MODES } from './defense.js';
import { partMake, partDispose } from './parts.js';
import { T, buildTerrain, terRefresh, terBrush, terRay, terPreset, terSave, terPhysics, hAt, footHeight, footWater, flattenFoot, TER_ED, terValid, terSetup } from './terrain.js';

export const CATALOG = {
  hq:     { name: 'HÖGKVARTER', cost: 0,   max: 1, spec: { w: 10, d: 10, floors: 3, wall: 'conc', c: .5, fh: 6, cols: 6 } },
  bunker: { name: 'BUNKER',     cost: 120, spec: { w: 6, d: 5, floors: 1, wall: 'conc', c: .5, fh: 6, win: false, inner: false, cols: 0 } },
  house:  { name: 'TEGELHUS',   cost: 160, spec: { w: 10, d: 8, floors: 2, wall: 'brick', c: .5, fh: 6 } },
  tower:  { name: 'VAKTTORN',   cost: 140, spec: { w: 4, d: 4, floors: 4, wall: 'conc', c: .5, fh: 6, inner: false, cols: 0 } },
  barr:   { name: 'KASERN',     cost: 200, spec: { w: 14, d: 7, floors: 1, wall: 'soft', c: .5, fh: 6 } },
  wall:   { name: 'MUR 6 M',    cost: 30,  spec: { w: 6, d: 1, floors: 1, wall: 'conc', c: .5, fh: 6, win: false, inner: false, cols: 0, door: false } },
  wallb:  { name: 'TEGELMUR',   cost: 20,  spec: { w: 6, d: 1, floors: 1, wall: 'brick', c: .5, fh: 4, win: false, inner: false, cols: 0, door: false } },
  port:   { name: 'PORT',       cost: 45,  spec: { w: 6, d: 1, floors: 1, wall: 'conc', c: .5, fh: 8, win: false, inner: false, cols: 0, door: false, gate: 3 } },
  // försvar
  mg:     { name: 'MG-NÄSTE',   cost: 90,  def: true, spec: { w: 3, d: 3, floors: 1, wall: 'sand', c: .5, fh: 2, win: false, inner: false, cols: 0, door: false, open: true } },
  sand:   { name: 'SANDSÄCKAR', cost: 12,  def: true, spec: { w: 4, d: 1, floors: 1, wall: 'sand', c: .5, fh: 3, win: false, inner: false, cols: 0, door: false, open: true } },
  mine:   { name: 'MINA',       cost: 25,  def: true, obj: true, spec: { w: 1, d: 1, floors: 1, fh: 1, c: .5 } },
  wire:   { name: 'TAGGTRÅD',   cost: 15,  def: true, obj: true, spec: { w: 6, d: 1, floors: 1, fh: 2, c: .5 } },
};
CATALOG.tower.def = true;
// ── 15 NYA BYGGNADER ──────────────────────────────────────────────────────
Object.assign(CATALOG, {
  garage:    { name: 'GARAGE',            cost: 110, spec: { w: 8,  d: 6,  floors: 1, wall: 'conc',  c: .5, fh: 6, gate: 4, win: false, cols: 0 } },
  verkstad:  { name: 'VERKSTAD',          cost: 150, spec: { w: 10, d: 8,  floors: 1, wall: 'brick', c: .5, fh: 7, gate: 5 } },
  hangar:    { name: 'HANGAR',            cost: 260, spec: { w: 16, d: 12, floors: 1, wall: 'gate',  c: .5, fh: 10, gate: 8, win: false, inner: false, cols: 0 } },
  lager:     { name: 'LAGERHUS',          cost: 140, spec: { w: 12, d: 8,  floors: 1, wall: 'brick', c: .5, fh: 7, inner: false } },
  stab:      { name: 'STABSBYGGNAD',      cost: 240, spec: { w: 10, d: 10, floors: 3, wall: 'conc',  c: .5, fh: 6, cols: 6 } },
  sjukhus:   { name: 'FÄLTSJUKHUS',       cost: 150, spec: { w: 12, d: 6,  floors: 1, wall: 'soft',  c: .5, fh: 6 } },
  mass:      { name: 'MÄSS',              cost: 130, spec: { w: 10, d: 6,  floors: 1, wall: 'brick', c: .5, fh: 6 } },
  barack:    { name: 'BOSTADSBARACK',     cost: 170, spec: { w: 8,  d: 5,  floors: 2, wall: 'soft',  c: .5, fh: 6, cols: 0 } },
  ammo:      { name: 'AMMUNITIONSFÖRRÅD', cost: 90,  explosive: true, spec: { w: 6, d: 4, floors: 1, wall: 'conc', c: .5, fh: 5, win: false, inner: false, cols: 0 } },
  radarhus:  { name: 'RADARHUS',          cost: 160, spec: { w: 6,  d: 6,  floors: 2, wall: 'conc',  c: .5, fh: 6, inner: false, cols: 0 } },
  kontroll:  { name: 'KONTROLLTORN',      cost: 220, spec: { w: 6,  d: 6,  floors: 5, wall: 'conc',  c: .5, fh: 6, inner: false, cols: 0 } },
  hoghus:    { name: 'HÖGHUS',            cost: 420, ground: true, spec: { w: 10, d: 10, floors: 8, wall: 'frame', c: .5, fh: 6, win: true, curtain: true, inner: false, cols: 4, keyCols: true } },
  plattform: { name: 'BETONGPLATTFORM',   cost: 70,  spec: { w: 8,  d: 8,  floors: 1, wall: 'conc',  c: .5, fh: 6, stilts: true, win: false, inner: false, cols: 0, door: false } },
  stalvagg:  { name: 'STÅLVÄGG',          cost: 45,  spec: { w: 6,  d: 1,  floors: 1, wall: 'gate',  c: .5, fh: 6, win: false, inner: false, cols: 0, door: false } },
  mur12:     { name: 'MUR 12 M',          cost: 55,  spec: { w: 12, d: 1,  floors: 1, wall: 'conc',  c: .5, fh: 6, win: false, inner: false, cols: 0, door: false } },
});
// ── 15 NYA FÖRSVAR ────────────────────────────────────────────────────────
const NEST = (w, d) => ({ w, d, floors: 1, wall: 'sand', c: .5, fh: 2, win: false, inner: false, cols: 0, door: false, open: true });
Object.assign(CATALOG, {
  tungmg:      { name: 'TUNG KULSPRUTA',     cost: 130, def: true, spec: NEST(3, 3) },
  dubbelmg:    { name: 'DUBBEL-MG',          cost: 160, def: true, spec: NEST(3, 3) },
  prick:       { name: 'PRICKSKYTTETORN',    cost: 170, def: true, spec: { w: 3, d: 3, floors: 3, wall: 'conc', c: .5, fh: 6, inner: false, cols: 0, win: false } },
  akan:        { name: 'AUTOMATKANON',       cost: 220, def: true, spec: NEST(4, 4) },
  granat:      { name: 'GRANATKASTARE',      cost: 180, def: true, spec: NEST(3, 3) },
  eld:         { name: 'ELDKASTARE',         cost: 120, def: true, spec: NEST(3, 3) },
  pv:          { name: 'PANSARVÄRNSPJÄS',    cost: 200, def: true, spec: NEST(3, 3) },
  bvarn:       { name: 'BETONGVÄRN MED MG',  cost: 150, def: true, spec: { w: 4, d: 4, floors: 1, wall: 'conc', c: .5, fh: 5, win: false, inner: false, cols: 0 } },
  betonghinder:{ name: 'BETONGHINDER',       cost: 15,  def: true, spec: { w: 3, d: 1, floors: 1, wall: 'conc', c: .5, fh: 2, win: false, inner: false, cols: 0, door: false, open: true } },
  sandvarn:    { name: 'SANDSÄCKSVÄRN',      cost: 30,  def: true, spec: { w: 4, d: 4, floors: 1, wall: 'sand', c: .5, fh: 3, win: false, inner: false, cols: 0, door: false, open: true } },
  hinder:      { name: 'PANSARHINDER',       cost: 10,  def: true, obj: true, ground: true, h: 1.3, spec: { w: 2, d: 2, floors: 1, fh: 1, c: .5 } },
  claymore:    { name: 'CLAYMORE',           cost: 30,  def: true, obj: true, ground: true, h: .3, spec: { w: 1, d: 1, floors: 1, fh: 1, c: .5 } },
  snubbel:     { name: 'SNUBBELTRÅD',        cost: 10,  def: true, obj: true, ground: true, h: .5, spec: { w: 6, d: 1, floors: 1, fh: 1, c: .5 } },
  stralk:      { name: 'STRÅLKASTARE',       cost: 25,  def: true, obj: true, h: 3.2, spec: { w: 1, d: 1, floors: 1, fh: 1, c: .5 } },
  minfalt:     { name: 'MINFÄLT',            cost: 80,  def: true, obj: true, ground: true, h: .1, spec: { w: 4, d: 4, floors: 1, fh: 1, c: .5 } },
});
CATALOG.mine.ground = CATALOG.wire.ground = true; CATALOG.mine.h = .1; CATALOG.wire.h = 1;
CATALOG.hq.ground = true;
// ── 15 NYA MARKDELAR (4 penslar i TOOLS + 11 delar att placera) ──────────
const MARK = (name, cost, w, d, h, o = {}) => ({ name, cost, mark: true, obj: true, h, spec: { w, d, floors: 1, fh: 1, c: .5 }, ...o });
Object.assign(CATALOG, {
  vag:    MARK('VÄG', 5, 6, 3, .1, { ground: true, flat: true }),
  grus:   MARK('GRUSVÄG', 3, 6, 3, .1, { ground: true, flat: true }),
  bro:    MARK('BRO', 60, 12, 4, 1.5, { ground: true, water: true }),
  ramp:   MARK('RAMP', 25, 4, 8, 3),
  trappa: MARK('TRAPPA', 20, 2, 6, 3),
  sten:   MARK('STENBLOCK', 8, 2, 2, 1.5),
  stock:  MARK('STOCKHÖG', 10, 4, 2, 1.3),
  staket: MARK('STAKET', 6, 6, 1, 1.3),
  buske:  MARK('BUSKAGE', 4, 3, 3, 1.6),
  vrak:   MARK('FORDONSVRAK', 15, 5, 2, 1.9),
  flagga: MARK('FLAGGSTÅNG', 5, 1, 1, 8),
});
const HAS = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const isPart = t => typeof t === 'string' && HAS(CATALOG, t);
// markverktyg (gratis – terrängen kostar inga byggpoäng)
export const TOOLS = { hoj: 'HÖJ', sank: 'SÄNK', plana: 'PLANA', jamna: 'JÄMNA', vatten: 'VATTEN', skog: 'SKOG', roj: 'RÖJ', dike: 'DIKE', vall: 'VALL', terrass: 'TERRASS', krater: 'KRATER', radera: '⌫ RADERA MARK' };
const TABS = { mark: 'MARK', bygg: 'BYGGNADER', forsvar: 'FÖRSVAR', arkiv: 'SPARA / LADDA' };
const PRESETS = { kulle: 'KULLE', plata: 'PLATÅ', sjo: 'SJÖ', dal: 'DAL' };
export const BD = { CAT: null, on: false, items: [], sel: 'hq', rot: 0, budget: 2000, plot: 64, rad: 6, cam: { a: .8, p: .75, d: 70, x: 0, z: 0 }, ghost: null, hover: null, slot: 0, keys: {}, undo: [], redo: [] };
T.plot = BD.plot/2; BD.CAT = CATALOG;
const KEY = 'ckpvp_bases';
// en sparad bas: { items: [{t,x,z,rot}], ter: {h,f,sea} }. Äldre sparningar var bara en lista med byggnader.
export const normBase = b => !b ? null : Array.isArray(b) ? { items: cleanItems(b), ter: null } : { items: cleanItems(b.items || []), ter: terValid(b.ter) ? b.ter || null : null };
export const loadSlots = () => { try { const s = JSON.parse(localStorage.getItem(KEY)) || [null, null, null]; return s.map(normBase); } catch (e){ return [null, null, null]; } };
const saveSlots = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e){ return false; } };
// up = 1: står på taket av något annat (stapling). Höjden räknas ut när basen byggs upp.
const plain = items => items.map(({ t, x, z, rot, dir, sec, pri, mode, up }) => Object.assign(GUNS[t] ? { t, x, z, rot, dir: dir || 0, sec: sec || (GUNS[t].top || GUNS[t].indirect ? 360 : 120), pri: pri || 'nar', mode: mode || 'fri' } : { t, x, z, rot }, up ? { up } : {}));
// baskod: komprimerad (deflate) JSON i base64 med prefix "2:"; gamla koder (utan terräng) går också att ladda
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
// packa upp/packa med en gräns (en baskod får inte kunna packas upp till många MB och frysa sidan)
const MAX_CODE_BYTES = 512*1024;
async function pipe(data, stream){
  const r = new Blob([data]).stream().pipeThrough(stream).getReader(), parts = []; let n = 0;
  for (;;){ const { done, value } = await r.read(); if (done) break; n += value.length; if (n > MAX_CODE_BYTES){ r.cancel(); throw new Error('Baskoden är för stor'); } parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts){ out.set(p, o); o += p.length; } return out;
}
export async function encodeBase(base){
  const j = JSON.stringify({ i: base.items.map(i => (GUNS[i.t] ? [i.t, i.x, i.z, i.rot, i.dir, i.sec, i.pri, i.mode] : [i.t, i.x, i.z, i.rot]).concat(i.up ? [i.up] : [])), t: base.ter });
  try { return '2:' + toB64(await pipe(new TextEncoder().encode(j), new CompressionStream('deflate-raw'))); } catch (e){ return '3:' + btoa(unescape(encodeURIComponent(j))); }
}
export async function decodeBase(s){
  s = String(s).trim(); if (s.length > MAX_CODE_BYTES) throw new Error('Baskoden är för lång');
  const fromJ = j => ({ items: cleanItems(j.i.map(a => { const g = GUNS[a[0]], lv = g ? a[8] : a[4], up = Number.isInteger(lv) && lv >= 1 && lv <= 4 ? { up: lv } : {};
    return Object.assign(g ? { t: a[0], x: a[1], z: a[2], rot: a[3], dir: a[4], sec: a[5], pri: a[6], mode: a[7] } : { t: a[0], x: a[1], z: a[2], rot: a[3] }, up); })), ter: j.t || null });
  if (s.startsWith('2:')){ const b = atob(s.slice(2)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return fromJ(JSON.parse(new TextDecoder().decode(await pipe(u, new DecompressionStream('deflate-raw'))))); }
  if (s.startsWith('3:')) return fromJ(JSON.parse(decodeURIComponent(escape(atob(s.slice(2))))));
  return { items: cleanItems(JSON.parse(decodeURIComponent(escape(atob(s)))).map(([t, x, z, rot]) => ({ t, x, z, rot }))), ter: null };
}
// rensa en inläst bas: okända delar, felaktiga tal och dubbletter tas bort (baskoder kan komma från vem som helst)
export function cleanItems(list){
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const i of list.slice(0, 600)){
    if (!i || !isPart(i.t) || !Number.isFinite(i.x) || !Number.isFinite(i.z) || Math.abs(i.x) > 64 || Math.abs(i.z) > 64) continue;
    const it = { t: i.t, x: +i.x, z: +i.z, rot: ((i.rot | 0) % 4 + 4) % 4 };
    if (GUNS[i.t]){ it.dir = Number.isFinite(i.dir) ? ((i.dir % 360) + 360) % 360 : 0; it.sec = SECTORS.includes(i.sec) ? i.sec : undefined; it.pri = HAS(PRIOS, i.pri) ? i.pri : 'nar'; it.mode = HAS(MODES, i.mode) ? i.mode : 'fri'; }
    if (Number.isInteger(i.up) && i.up >= 1 && i.up <= 4) it.up = i.up; else if (i.up === true) it.up = 1;
    out.push(it);
  }
  return out;
}
const used = () => BD.items.reduce((a, i) => a + CATALOG[i.t].cost, 0);
const dims = (t, rot) => { const s = CATALOG[t].spec; return rot % 2 ? [s.d, s.w] : [s.w, s.d]; };
const isTool = k => HAS(TOOLS, k);
// ── STAPLING ──────────────────────────────────────────────────────────────
// Byggnader och de flesta delar kan stå på taket av andra byggnader. Taket måste täcka hela fotavtrycket,
// allt som bär måste ha samma takhöjd och tåla last (inte öppna nästen, vapen eller små föremål).
// it.up = staplingsnivå (1 = på en byggnad som står på marken, 2 = på en som själv är staplad …).
export const MAX_LEVELS = 4, MAX_STACK_H = 36;
export const heightOf = t => { const C = CATALOG[t]; return C.obj ? (C.h || 1) : C.spec.floors*C.spec.fh*C.spec.c; };
const roofOf = it => it.y + heightOf(it.t);
const canHold = it => { const C = CATALOG[it.t]; return !C.obj && !C.spec.open && !GUNS[it.t] && C.stack !== false; };
const rectHit = (a, b) => a[0] < b[2] - .01 && b[0] < a[2] - .01 && a[1] < b[3] - .01 && b[1] < a[3] - .01;
const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
// vad står under fotavtrycket r? Ger { y, on, level } eller null (ingen byggnad under) eller { bad: orsak }
function supportFor(r, pool){
  const solid = pool.filter(i => i.y != null && !CATALOG[i.t].flat && rectHit(r, footOf(i)));
  if (!solid.length) return null;
  const top = Math.max(...solid.map(roofOf)), S = solid.filter(i => Math.abs(roofOf(i) - top) < .05);
  const weak = S.find(i => !canHold(i)); if (weak) return { bad: `${CATALOG[weak.t].name} tål inget ovanpå` };
  for (let zz = r[1] + .25; zz < r[3]; zz += .5) for (let xx = r[0] + .25; xx < r[2]; xx += .5) if (!S.some(i => inRect(footOf(i), xx, zz))) return { bad: 'Måste stå helt på ett tak (eller helt på marken)' };
  return { y: top, on: S, level: 1 + Math.max(...S.map(i => i.up || 0)) };
}
// får delen t stå här? { ok, up, y, on, level, why }
function fits(t, x, z, rot, skip){
  const C = CATALOG[t], [w, d] = dims(t, rot), P = BD.plot/2, r = [x - w/2, z - d/2, x + w/2, z + d/2];
  if (r[0] < -P - .01 || r[2] > P + .01 || r[1] < -P - .01 || r[3] > P + .01) return { ok: false, why: 'Utanför tomten' };
  const pool = BD.items.filter(i => i !== skip);
  if (C.flat && pool.some(i => CATALOG[i.t].flat && rectHit(r, footOf(i)))) return { ok: false, why: 'Krockar med en annan väg' };
  const sup = supportFor(r, pool);
  if (!sup) return { ok: true, up: false };
  if (sup.bad) return { ok: false, why: sup.bad };
  if (C.ground || C.flat) return { ok: false, why: `${C.name} måste stå på marken` };
  if (sup.level > MAX_LEVELS) return { ok: false, why: `Max ${MAX_LEVELS} nivåer på varandra` };
  if (sup.y + heightOf(t) - hAt(x, z) > MAX_STACK_H) return { ok: false, why: `För högt – max ${MAX_STACK_H} m` };
  return { ok: true, up: true, y: sup.y, on: sup.on, level: sup.level };
}
// koppla en staplad byggnad till byggnaderna under (så att den rasar med dem i spelet)
function link(it){ if (it.b) it.b.setSupport(it.on ? it.on.map(o => o.b).filter(Boolean) : null); }
// allt som står på it, rekursivt
function stackAbove(it){ const out = []; const walk = x => { for (const o of BD.items) if (o.on && o.on.includes(x) && !out.includes(o)){ out.push(o); walk(o); } }; walk(it); return out; }

// tomten: terräng (höjdkarta, skog, vatten) och en kantlinje som följer marken, omgiven av kullar
// match = { half, plots, extra }: större karta med flera tomter (bas mot bas). Utan match: vanlig byggtomt.
export function buildPlot(ter, match){
  if (match) terSetup(match.half, match.plots); else terSetup(80, [{ x: 0, z: 0 }]);
  buildTerrain(ter, match && match.extra);
  BD.edge = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x9ee0ff, transparent: true, opacity: .7 })); E.scene.add(BD.edge); edgeLine();
  let s = 5; const r = () => (s = (s*16807) % 2147483647)/2147483647, rock = pbr('rocky_terrain_02', { tri: 6 });
  const R0 = match ? match.half + 25 : 110;
  for (let i = 0; i < 22; i++){ const a = i/22*6.283, d = R0 + r()*110, h = 12 + r()*30, m = new THREE.Mesh(new THREE.ConeGeometry(25 + r()*30, h, 9), rock); m.position.set(Math.cos(a)*d, h/2 - 2, Math.sin(a)*d); m.castShadow = m.receiveShadow = true; E.scene.add(m); }
}
function edgeLine(){ const P = BD.plot/2, pts = []; for (const [ax, az, bx, bz] of [[-P, -P, P, -P], [P, -P, P, P], [P, P, -P, P], [-P, P, -P, -P]]) for (let t = 0; t < 1; t += 1/P) pts.push(new THREE.Vector3(ax + (bx - ax)*t, 0, az + (bz - az)*t)); pts.push(pts[0].clone()); for (const p of pts) p.y = Math.max(hAt(p.x, p.z), T.sea) + .08; BD.edge.geometry.setFromPoints(pts); }
// sockel av betong under varje byggnad (döljer skarven mot sluttande mark)
let PLM = null;
function placeBuilding(it){
  const C = CATALOG[it.t], [w, d] = dims(it.t, it.rot);
  if (C.mark){ if (it.y == null) it.y = hAt(it.x, it.z); it.prop = partMake(it, C); return null; }
  if (C.obj){ if (it.y == null) it.y = hAt(it.x, it.z); it.def = defMake(it, C.spec, null); return null; }
  if (it.y == null) it.y = footHeight(it.x, it.z, w, d);
  const sp = Object.assign({}, C.spec, { x: it.x, z: it.z, w, d, y: it.y });
  it.b = addBuilding(sp); if (GUNS[it.t]) it.def = defMake(it, C.spec, it.b);
  if (it.up) return it.b; // staplad: ingen sockel, står på taket
  PLM = PLM || pbr('concrete_wall_004', { tri: 2 });
  const pl = new THREE.Mesh(new THREE.BoxGeometry(w + .5, 3, d + .5), PLM); pl.position.set(it.x, it.y - 1.48, it.z); pl.castShadow = pl.receiveShadow = true; E.scene.add(pl); it.plinth = pl;
  return it.b;
}
const footOf = it => { const [w, d] = dims(it.t, it.rot); return [it.x - w/2, it.z - d/2, it.x + w/2, it.z + d/2]; };
const onGround = i => !CATALOG[i.t].obj && !i.up;
function setFeet(){ T.feet = BD.items.filter(onGround).map(footOf); }
// minor och taggtråd följer marken när den formas om
function refreshObjs(){ for (const it of BD.items) if (CATALOG[it.t].obj && !it.up){ if (it.prop) partDispose(it.prop); if (it.def) defDispose(it.def); it.y = null; placeBuilding(it); } }
// spelet: bygg byggnader på terrängen (höjden räknas från marken, som är planad sedan byggaren)
// opt.dx/opt.dz: flytta basen till en annan tomt (bas mot bas). Kontrollerna görs i tomtens egna koordinater.
export function rebuild(items, opt = {}){
  const dx = opt.dx || 0, dz = opt.dz || 0;
  if (dx || dz) for (const it of items){ it.x += dx; it.z += dz; }
  const outside = r => r[0] < dx - BD.plot/2 - .01 || r[2] > dx + BD.plot/2 + .01 || r[1] < dz - BD.plot/2 - .01 || r[3] > dz + BD.plot/2 + .01;
  for (const it of items) it.bad = false;
  const ground = items.filter(i => !i.up), stacked = items.filter(i => i.up).sort((a, b) => a.up - b.up);
  T.feet = ground.filter(i => !CATALOG[i.t].obj).map(footOf);
  for (const it of items){ it.b = null; it.y = null; it.on = null; it.prop = null; it.def = null; }
  // budget: delar som inte ryms tas bort (högkvarteret först, sedan i ordning) – skyddar mot fuskade baskoder
  let spent = 0; const budget = BD.budget >= 99999 ? Infinity : BD.budget;
  for (const it of [...items].sort((a, b) => (b.t === 'hq') - (a.t === 'hq'))){ const c = CATALOG[it.t].cost; if (spent + c > budget) it.bad = true; else spent += c; }
  for (let i = ground.length - 1; i >= 0; i--) if (ground[i].bad) ground.splice(i, 1);
  for (let i = stacked.length - 1; i >= 0; i--) if (stacked[i].bad) stacked.splice(i, 1);
  // markdelar kontrolleras som i byggaren: inom tomten, inga överlapp, högst ett högkvarter (skyddar mot fuskade baskoder)
  const P = BD.plot/2, okGround = [];
  for (const it of ground){
    const r = footOf(it), C = CATALOG[it.t];
    const bad = outside(r)
      || okGround.some(o => rectHit(r, footOf(o)) && !!CATALOG[o.t].flat === !!C.flat)
      || (C.max && okGround.filter(o => o.t === it.t).length >= C.max);
    if (bad) it.bad = true; else okGround.push(it);
  }
  ground.splice(0, ground.length, ...okGround); T.feet = ground.filter(i => !CATALOG[i.t].obj).map(footOf);
  for (const it of ground) placeBuilding(it);
  // staplade delar: nivå för nivå, höjden räknas från taken under (sparas inte, så baskoden kan inte fuska)
  const done = ground.slice();
  for (const it of stacked){
    const C = CATALOG[it.t], [w, d] = dims(it.t, it.rot), sup = C.ground || C.flat ? null : supportFor([it.x - w/2, it.z - d/2, it.x + w/2, it.z + d/2], done);
    const rr = [it.x - w/2, it.z - d/2, it.x + w/2, it.z + d/2];
    if (!sup || sup.bad || sup.level > MAX_LEVELS || outside(rr) || done.some(o => o.up === sup.level && rectHit(rr, footOf(o)))){ it.bad = true; continue; }
    it.y = sup.y; it.on = sup.on; it.up = sup.level; placeBuilding(it); link(it); done.push(it);
  }
  for (let i = items.length - 1; i >= 0; i--) if (items[i].bad) items.splice(i, 1);
}
export { terPhysics };
// efter en mall: plana om marken under alla byggnader
T.reflatten = () => { if (!BD.on) return; for (const it of BD.items){ if (!onGround(it)) continue; const [w, d] = dims(it.t, it.rot); flattenFoot(it.x, it.z, w, d, it.y); } };
// ångra/gör om: mark och byggnader i samma steg
function snapshot(){ return { h: T.h.slice(), f: T.f.slice(), items: JSON.stringify(plain(BD.items)), sea: T.sea }; }
function pushUndo(){ BD.undo.push(snapshot()); if (BD.undo.length > 40) BD.undo.shift(); BD.redo.length = 0; }
function restore(s){
  T.h.set(s.h); T.f.set(s.f); T.sea = s.sea;
  if (s.items !== JSON.stringify(plain(BD.items))){ for (const it of BD.items) disposeItem(it); BD.items = JSON.parse(s.items); rebuild(BD.items); BD.edit = null; } else refreshObjs();
  terRefresh(true); edgeLine(); ui();
}
function undo(){ const s = BD.undo.pop(); if (!s) return flash('Inget att ångra'); BD.redo.push(snapshot()); restore(s); flash('Ångrat (' + BD.undo.length + ' steg kvar)'); }
function redo(){ const s = BD.redo.pop(); if (!s) return; BD.undo.push(snapshot()); restore(s); }
function disposeItem(it){ if (it.def){ defDispose(it.def); it.def = null; } if (it.prop){ partDispose(it.prop); it.prop = null; } if (it.b){ it.b.dispose(); it.b = null; } if (it.plinth){ E.scene.remove(it.plinth); it.plinth.geometry.dispose(); it.plinth = null; } }
// riv: delen och allt som står ovanpå den (ÅNGRA tar tillbaka)
function removeItem(it){ const all = [it, ...stackAbove(it)]; for (const x of all){ disposeItem(x); const i = BD.items.indexOf(x); if (i >= 0) BD.items.splice(i, 1); if (BD.edit === x) BD.edit = null; } setFeet(); return all.length; }

export function startBuilder(base){
  base = normBase(base) || { items: [], ter: null };
  resetWorld(); T.grid = true; buildPlot(base.ter); BD.on = true; BD.undo.length = BD.redo.length = 0;
  BD.items = base.items.map(i => ({ ...i })); BD.edit = null; rebuild(BD.items); terRefresh(true);
  if (!BD.ghost){ BD.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x4dffa0, transparent: true, opacity: .32, depthWrite: false })); }
  if (!BD.ring){ BD.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xffd060, depthTest: false, transparent: true })); BD.ring.renderOrder = 20; }
  E.scene.add(BD.ghost); E.scene.add(BD.ring); ui();
}
BD.refresh = () => ui();
export function stopBuilder(){ BD.on = false; BD.paint = false; T.grid = false; const u = document.getElementById('bui'); if (u) u.remove(); }
export const currentBase = () => ({ items: plain(BD.items), ter: terSave() });
// gränssnitt: palett (byggnader + markverktyg), mallar, poäng, platser, baskod
function ui(){
  let u = document.getElementById('bui'); if (!u){ u = document.createElement('div'); u.id = 'bui'; document.body.appendChild(u); }
  const sl = loadSlots(), hq = BD.items.some(i => i.t === 'hq'), tab = BD.tab || (BD.tab = 'bygg');
  u.innerHTML = `<div class="bt">BASBYGGAREN <small>BYGGPOÄNG ${used()} / ${BD.budget >= 99999 ? '∞' : BD.budget}</small> <small style="color:${hq ? 'var(--gr)' : 'var(--or)'}">${hq ? '✓ HÖGKVARTER PLACERAT' : '! PLACERA ETT HÖGKVARTER'}</small></div>
  <div class="bu"><span class="bb" data-undo="1" style="opacity:${BD.undo.length ? 1 : .4}">↶ ÅNGRA</span><span class="bb" data-redo="1" style="opacity:${BD.redo.length ? 1 : .4}">↷ GÖR OM</span><span class="bb" data-clear="1">⌫ RENSA MARKEN</span></div>
  <div class="bx"><span class="bb" data-test="1" style="opacity:${hq ? 1 : .35}">TESTA BASEN ›</span><span class="bb" data-menu="1">‹ MENY</span></div>
  <div class="bw">
  <div class="btab">${Object.entries(TABS).map(([k, n]) => `<span class="tb ${tab === k ? 'on' : ''}" data-tab="${k}">${n}</span>`).join('')}</div>
  ${tab === 'mark' ? `<div class="bm">${Object.entries(TOOLS).map(([k, n]) => `<div class="bi sm ${BD.sel === k ? 'on' : ''}" data-k="${k}">${n}</div>`).join('')}<span class="bl">PENSEL ${BD.rad} M</span><span class="bl">MALL</span>${Object.entries(PRESETS).map(([k, n]) => `<span class="bb" data-pre="${k}">${n}</span>`).join('')}</div>
    <div class="bp many">${Object.entries(CATALOG).filter(([k, c]) => c.mark).map(([k, c]) => `<div class="bi ${BD.sel === k ? 'on' : ''}" data-k="${k}">${c.name}<small>${c.cost} P · ${c.spec.w}×${c.spec.d} M</small></div>`).join('')}<div class="bi ${BD.sel === 'del' ? 'on' : ''}" data-k="del">RIV<small>ta bort</small></div></div>` : ''}
  ${tab === 'forsvar' ? `<div class="bf many">${Object.entries(CATALOG).filter(([k, c]) => c.def).map(([k, c]) => `<div class="bi ${BD.sel === k ? 'on' : ''}" data-k="${k}">${c.name}<small>${c.cost} P</small></div>`).join('')}<div class="bi ${BD.sel === 'edit' ? 'on' : ''}" data-k="edit">VÄLJ / STÄLL IN<small>siktsektor, eldläge</small></div><div class="bi ${BD.sel === 'del' ? 'on' : ''}" data-k="del">RIV<small>ta bort</small></div></div>` : ''}
  ${tab === 'bygg' ? `<div class="bp many">${Object.entries(CATALOG).filter(([k, c]) => !c.def && !c.mark).map(([k, c]) => `<div class="bi ${BD.sel === k ? 'on' : ''}" data-k="${k}">${c.name}<small>${c.cost} P · ${c.spec.w}×${c.spec.d} M</small></div>`).join('')}<div class="bi ${BD.sel === 'del' ? 'on' : ''}" data-k="del">RIV<small>ta bort byggnad</small></div></div>` : ''}
  ${tab === 'arkiv' ? `<div class="bs">${sl.map((s, i) => `<span class="bb" data-save="${i}">SPARA ${i + 1}</span><span class="bb" data-load="${i}" style="opacity:${s ? 1 : .35}">LADDA ${i + 1}</span>`).join('')}<span class="bb" data-code="1">BASKOD</span></div>` : ''}
  <div class="bh">${isTool(BD.sel) ? 'HÅLL VÄNSTER MÅLA · [ ] ELLER SHIFT+HJUL PENSELSTORLEK · CTRL+Z ÅNGRA' : 'KLICK BYGG · SIKTA PÅ ETT TAK FÖR ATT BYGGA OVANPÅ · R VRID · HÖGERDRA VRID KAMERA · HJUL ZOOM · WASD FLYTTA · 1–9 VÄLJ · DELETE RIV VALT · 0 UTVECKLARLÄGE · CTRL+Z ÅNGRA'}</div></div>${editPanel()}<div class="bc" id="bcode"></div>`;
  u.querySelectorAll('.bi').forEach(el => el.onclick = e => { e.stopPropagation(); BD.sel = el.dataset.k; ui(); });
  u.querySelectorAll('[data-tab]').forEach(el => el.onclick = e => { e.stopPropagation(); BD.tab = el.dataset.tab; const first = { mark: 'hoj', bygg: 'house', forsvar: 'mg' }[BD.tab], C = isPart(BD.sel) ? CATALOG[BD.sel] : null;
    if (first && !(BD.tab === 'mark' ? isTool(BD.sel) || (C && C.mark) : BD.tab === 'forsvar' ? (C && C.def) || BD.sel === 'edit' : C && !C.def && !C.mark)) BD.sel = first; ui(); });
  u.querySelectorAll('[data-pre]').forEach(el => el.onclick = () => { pushUndo(); terPreset(el.dataset.pre); refreshObjs(); edgeLine(); flash('Mall: ' + PRESETS[el.dataset.pre]); });
  u.querySelectorAll('[data-set]').forEach(el => el.onclick = () => { const it = BD.edit; if (!it) return; pushUndo(); const [k, v] = el.dataset.set.split(':'); if (k === 'dir') it.dir = ((it.dir || 0) + +v + 360) % 360; else it[k] = k === 'sec' ? +v : v; defRefreshFan(it.def); ui(); });
  u.querySelector('[data-undo]').onclick = undo; u.querySelector('[data-redo]').onclick = redo;
  u.querySelector('[data-clear]').onclick = () => { pushUndo(); terPreset('platt'); refreshObjs(); edgeLine(); ui(); flash('Marken är rensad – ↶ ÅNGRA tar tillbaka den'); };
  u.querySelectorAll('[data-save]').forEach(el => el.onclick = () => { const s = loadSlots(); s[+el.dataset.save] = currentBase(); flash(saveSlots(s) ? 'Basen sparad i plats ' + (+el.dataset.save + 1) : 'Kunde inte spara (fullt minne)'); });
  u.querySelectorAll('[data-load]').forEach(el => el.onclick = () => { const s = loadSlots()[+el.dataset.load]; if (s) startBuilder(s); });
  const qc = u.querySelector('[data-code]'); if (qc) qc.onclick = async () => { const c = await encodeBase(currentBase()); document.getElementById('bcode').innerHTML = `<input id="bcin" value="${c}" style="width:420px"> <span class="bb" id="bcl">LADDA KOD</span>`; document.getElementById('bcl').onclick = async () => { try { startBuilder(await decodeBase(document.getElementById('bcin').value)); } catch (e){ flash('Ogiltig baskod'); } }; try { await navigator.clipboard.writeText(c); flash('Baskoden kopierad (' + c.length + ' tecken)'); } catch (e){} };
  u.querySelector('[data-test]').onclick = () => { if (hq) BD.onTest && BD.onTest(currentBase()); else flash('Placera ett högkvarter först'); };
  u.querySelector('[data-menu]').onclick = () => BD.onMenu && BD.onMenu();
}
// inställningar för valt försvar: siktsektor, riktning, målprioritet, eldläge
function editPanel(){
  const it = BD.edit; if (BD.sel !== 'edit') return '';
  if (!it) return `<div class="be"><h3>VÄLJ ETT FÖRSVAR</h3><div class="row">KLICKA PÅ ETT MG-NÄSTE ELLER VAKTTORN FÖR ATT STÄLLA IN SIKTSEKTOR, MÅLPRIORITET OCH ELDLÄGE</div></div>`;
  const g = GUNS[it.t], b = (k, v, l, on) => `<span class="bb ${on ? 'on' : ''}" data-set="${k}:${v}">${l}</span>`;
  return `<div class="be"><h3>${g.name}</h3><div class="row">RÄCKVIDD ${g.range} M · ${g.rpm} SKOTT/MIN</div>
    <div class="row">SIKTSEKTOR</div>${SECTORS.map(s => b('sec', s, s + '°', it.sec === s)).join(' ')}
    <div class="row">RIKTNING ${it.dir}°</div>${b('dir', -45, '↺ 45°')} ${b('dir', 45, '↻ 45°')}
    <div class="row">MÅLPRIORITET</div>${Object.entries(PRIOS).map(([k, l]) => b('pri', k, l, it.pri === k)).join(' ')}
    <div class="row">ELDLÄGE</div>${Object.entries(MODES).map(([k, l]) => b('mode', k, l, it.mode === k)).join(' ')}</div>`;
}
function flash(s){ const u = document.querySelector('#bui .bh'); if (u) u.textContent = s; clearTimeout(BD.flT); BD.flT = setTimeout(() => BD.on && ui(), 1800); }
// mus och tangenter
const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
export function bindBuilder(canvas){
  canvas.addEventListener('mousemove', e => { if (!BD.on) return; mv.set(e.clientX/innerWidth*2 - 1, -(e.clientY/innerHeight)*2 + 1); if (BD.drag){ BD.cam.a -= e.movementX*.006; BD.cam.p = Math.max(.2, Math.min(1.45, BD.cam.p + e.movementY*.004)); } });
  canvas.addEventListener('mousedown', e => { if (!BD.on) return; if (e.button === 2 || e.button === 1){ BD.drag = true; return; } if (isTool(BD.sel)){ if (!BD.hover) return; pushUndo(); BD.paint = true; T.flatH = ['plana', 'dike', 'vall', 'krater'].includes(BD.sel) ? hAt(BD.hover.x, BD.hover.z) : null; return; } click(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mouseup', () => { BD.drag = false; if (BD.paint){ BD.paint = false; T.flatH = null; edgeLine(); } });
  canvas.addEventListener('wheel', e => { if (!BD.on) return; if (e.shiftKey && isTool(BD.sel)){ BD.rad = Math.max(2, Math.min(20, BD.rad + (e.deltaY > 0 ? -1 : 1))); ui(); return; } BD.cam.d = Math.max(18, Math.min(130, BD.cam.d*(1 + Math.sign(e.deltaY)*.1))); }, { passive: true });
  addEventListener('keydown', e => { if (!BD.on || e.target.tagName === 'INPUT') return; BD.keys[e.code] = true;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.code === 'KeyR') BD.rot = (BD.rot + 1) % 4;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight'){ BD.rad = Math.max(2, Math.min(20, BD.rad + (e.code === 'BracketRight' ? 1 : -1))); ui(); }
    if ((e.code === 'Delete' || e.code === 'Backspace') && BD.edit){ pushUndo(); const n = removeItem(BD.edit); BD.edit = null; ui(); if (n > 1) flash(`Rev ${n} delar (allt som stod ovanpå)`); return; }
    const n = +e.key; if (e.key >= '1' && e.key <= '9'){ BD.sel = [null, 'hq', 'bunker', 'house', 'tower', 'barr', 'wall', 'wallb', 'port', 'mg'][n]; BD.tab = BD.sel === 'mg' ? 'forsvar' : 'bygg'; BD.edit = null; ui(); } });
  addEventListener('keyup', e => { BD.keys[e.code] = false; });
}
function snap(t, rot, p){ const [w, d] = dims(t, rot); return [Math.round(p.x - w/2) + w/2, Math.round(p.z - d/2) + d/2]; }
// delen under muspekaren: den med högst tak som täcker punkten (pekar man på ett tak väljs det som står där)
function pickAt(x, z, filter = () => true){
  const hits = BD.items.filter(i => filter(i) && inRect(footOf(i), x, z) || (filter(i) && CATALOG[i.t].obj && Math.abs(x - i.x) < dims(i.t, i.rot)[0]/2 + .5 && Math.abs(z - i.z) < dims(i.t, i.rot)[1]/2 + .5));
  const y = BD.hover && BD.hover.y != null ? BD.hover.y : Infinity;
  hits.sort((a, b) => roofOf(b) - roofOf(a)); return hits.find(i => i.y <= y + .3) || hits[0] || null;
}
function click(){
  if (!BD.hover) return; const { x, z } = BD.hover;
  if (BD.sel === 'edit'){ BD.edit = pickAt(x, z, i => !!GUNS[i.t]); ui(); return; }
  if (BD.sel === 'del'){ const it = pickAt(x, z); if (it){ pushUndo(); const n = removeItem(it); ui(); if (n > 1) flash(`Rev ${n} delar (allt som stod ovanpå)`); } return; }
  if (!isPart(BD.sel)) return;
  const c = CATALOG[BD.sel], [sx, sz] = snap(BD.sel, BD.rot, BD.hover), [w, d] = dims(BD.sel, BD.rot);
  if (c.max && BD.items.filter(i => i.t === BD.sel).length >= c.max) return flash('Bara ett högkvarter per bas');
  if (used() + c.cost > BD.budget) return flash('Inte tillräckligt med byggpoäng');
  const f = fits(BD.sel, sx, sz, BD.rot); if (!f.ok) return flash(f.why);
  if (!f.up && !c.water && !c.flat && footWater(sx, sz, w, d) > .35) return flash('Kan inte bygga i vatten – fyll upp marken först (HÖJ)');
  pushUndo();
  if (f.up){
    const it = { t: BD.sel, x: sx, z: sz, rot: BD.rot, y: f.y, up: f.level, on: f.on }; BD.items.push(it); placeBuilding(it); link(it); ui();
    return flash(`${c.name} staplad på ${CATALOG[f.on[0].t].name.toLowerCase()} – nivå ${f.level}`);
  }
  if (c.obj){ const it = { t: BD.sel, x: sx, z: sz, rot: BD.rot }; BD.items.push(it); placeBuilding(it); ui(); return; }
  const y = Math.max(footHeight(sx, sz, w, d), T.sea + .3), it = { t: BD.sel, x: sx, z: sz, rot: BD.rot, y };
  flattenFoot(sx, sz, w, d, y); BD.items.push(it); setFeet(); terRefresh(); edgeLine(); placeBuilding(it); ui();
}
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export function updateBuilder(dt){
  if (!BD.on) return; const C = BD.cam, k = BD.keys, sp = C.d*.6*dt, ca = Math.cos(C.a), sa = Math.sin(C.a);
  if (k.KeyW){ C.x -= sa*sp; C.z -= ca*sp; } if (k.KeyS){ C.x += sa*sp; C.z += ca*sp; } if (k.KeyA){ C.x -= ca*sp; C.z += sa*sp; } if (k.KeyD){ C.x += ca*sp; C.z -= sa*sp; }
  C.x = Math.max(-TER_ED - 20, Math.min(TER_ED + 20, C.x)); C.z = Math.max(-TER_ED - 20, Math.min(TER_ED + 20, C.z));
  const gy = Math.max(hAt(C.x, C.z), T.sea); C.y = (C.y == null ? gy : C.y + (gy - C.y)*Math.min(1, dt*3));
  E.cam.position.set(C.x + Math.sin(C.a)*Math.cos(C.p)*C.d, C.y + Math.sin(C.p)*C.d, C.z + Math.cos(C.a)*Math.cos(C.p)*C.d); E.cam.lookAt(C.x, C.y, C.z); E.cam.fov = 50; E.cam.updateProjectionMatrix();
  ray.setFromCamera(mv, E.cam); _o.copy(ray.ray.origin); _d.copy(ray.ray.direction); const hp = terRay(_o, _d); BD.hover = hp ? { x: hp.x, y: hp.y, z: hp.z } : null;
  // tak: strålen mot varje byggnads takplan – träffar den ett tak före marken pekar man på taket
  if (!isTool(BD.sel)){ let bt = hp ? hp.distanceTo(_o) : Infinity;
    for (const it of BD.items){ if (CATALOG[it.t].flat || it.y == null) continue; const Y = roofOf(it); if (Math.abs(_d.y) < 1e-4) continue; const t = (Y - _o.y)/_d.y; if (t <= 0 || t >= bt) continue;
      const px = _o.x + _d.x*t, pz = _o.z + _d.z*t; if (inRect(footOf(it), px, pz)){ bt = t; BD.hover = { x: px, y: Y, z: pz, roof: it }; } } }
  const tool = isTool(BD.sel);
  if (tool && BD.paint && BD.hover){ terBrush(BD.sel, BD.hover.x, BD.hover.z, BD.rad, dt); terRefresh(); }
  // penselring som följer marken
  BD.ring.visible = tool && !!BD.hover;
  if (BD.ring.visible){ const p = BD.ring.geometry.attributes.position; for (let i = 0; i <= 64; i++){ const a = i/64*6.283, x = BD.hover.x + Math.cos(a)*BD.rad, z = BD.hover.z + Math.sin(a)*BD.rad; p.setXYZ(i, x, Math.max(hAt(x, z), T.sea) + .15, z); } p.needsUpdate = true; BD.ring.material.color.set(BD.sel === 'vatten' ? 0x50b0ff : BD.sel === 'skog' ? 0x70ff70 : BD.sel === 'roj' || BD.sel === 'radera' ? 0xff9050 : 0xffd060); }
  // siktsektorer: alla när man ställer in, det valda starkare
  for (const it of BD.items) if (it.def && it.def.fan){ defShowFan(it.def, BD.edit ? BD.edit === it : !!GUNS[BD.sel]); it.def.fan.material.opacity = BD.edit === it ? .1 : .03; }
  const g = BD.ghost; g.visible = !!BD.hover && !tool && isPart(BD.sel);
  if (g.visible){ const c = CATALOG[BD.sel], [w, d] = dims(BD.sel, BD.rot), h = Math.max(.2, heightOf(BD.sel)), [sx, sz] = snap(BD.sel, BD.rot, BD.hover), f = fits(BD.sel, sx, sz, BD.rot);
    const bad = !f.ok || used() + c.cost > BD.budget || (!f.up && !c.water && !c.flat && footWater(sx, sz, w, d) > .35) || (c.max && BD.items.filter(i => i.t === BD.sel).length >= c.max);
    const y = f.up ? f.y : c.obj ? hAt(sx, sz) : Math.max(footHeight(sx, sz, w, d), T.sea + .3);
    g.scale.set(w, h, d); g.position.set(sx, y + h/2, sz); g.material.color.set(bad ? 0xff5040 : f.up ? 0x60c8ff : 0x4dffa0); }
}
