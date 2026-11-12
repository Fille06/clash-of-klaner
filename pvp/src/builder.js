// BASBYGGAREN (fas B) – bygg din bas på en tomt med byggpoäng och forma marken under (höjder, skog, vatten).
// Allt du bygger är förstörbara cellbyggnader. Spara i tre platser, dela med baskod, testa basen direkt i spelet.
import * as THREE from 'three';
import { E, pbr } from './engine.js';
import { R, PH } from './physics.js';
import { addBuilding, DS } from './destruct.js';
import { resetWorld } from './world.js';
import { DEF, defMake, defDispose, defShowFan, defRefreshFan, GUNS, SECTORS, PRIOS, MODES } from './defense.js';
import { T, buildTerrain, terRefresh, terBrush, terRay, terPreset, terSave, terPhysics, hAt, footHeight, footWater, flattenFoot, TER_ED } from './terrain.js';

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
// markverktyg (gratis – terrängen kostar inga byggpoäng)
export const TOOLS = { hoj: 'HÖJ', sank: 'SÄNK', plana: 'PLANA', jamna: 'JÄMNA', vatten: 'VATTEN', skog: 'SKOG', roj: 'RÖJ', radera: '⌫ RADERA MARK' };
const PRESETS = { kulle: 'KULLE', plata: 'PLATÅ', sjo: 'SJÖ', dal: 'DAL' };
export const BD = { on: false, items: [], sel: 'hq', rot: 0, budget: 2000, plot: 64, rad: 6, cam: { a: .8, p: .75, d: 70, x: 0, z: 0 }, ghost: null, hover: null, slot: 0, keys: {}, undo: [], redo: [] };
T.plot = BD.plot/2;
const KEY = 'ckpvp_bases';
// en sparad bas: { items: [{t,x,z,rot}], ter: {h,f,sea} }. Äldre sparningar var bara en lista med byggnader.
export const normBase = b => !b ? null : Array.isArray(b) ? { items: b, ter: null } : { items: b.items || [], ter: b.ter || null };
export const loadSlots = () => { try { const s = JSON.parse(localStorage.getItem(KEY)) || [null, null, null]; return s.map(normBase); } catch (e){ return [null, null, null]; } };
const saveSlots = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e){ return false; } };
const plain = items => items.map(({ t, x, z, rot, dir, sec, pri, mode }) => GUNS[t] ? { t, x, z, rot, dir: dir || 0, sec: sec || (t === 'tower' ? 360 : 120), pri: pri || 'nar', mode: mode || 'fri' } : { t, x, z, rot });
// baskod: komprimerad (deflate) JSON i base64 med prefix "2:"; gamla koder (utan terräng) går också att ladda
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
async function pipe(data, stream){ return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function encodeBase(base){
  const j = JSON.stringify({ i: base.items.map(i => GUNS[i.t] ? [i.t, i.x, i.z, i.rot, i.dir, i.sec, i.pri, i.mode] : [i.t, i.x, i.z, i.rot]), t: base.ter });
  try { return '2:' + toB64(await pipe(new TextEncoder().encode(j), new CompressionStream('deflate-raw'))); } catch (e){ return '3:' + btoa(unescape(encodeURIComponent(j))); }
}
export async function decodeBase(s){
  s = s.trim(); const fromJ = j => ({ items: j.i.map(([t, x, z, rot, dir, sec, pri, mode]) => dir != null ? { t, x, z, rot, dir, sec, pri, mode } : { t, x, z, rot }), ter: j.t || null });
  if (s.startsWith('2:')){ const b = atob(s.slice(2)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return fromJ(JSON.parse(new TextDecoder().decode(await pipe(u, new DecompressionStream('deflate-raw'))))); }
  if (s.startsWith('3:')) return fromJ(JSON.parse(decodeURIComponent(escape(atob(s.slice(2))))));
  return { items: JSON.parse(decodeURIComponent(escape(atob(s)))).map(([t, x, z, rot]) => ({ t, x, z, rot })), ter: null };
}
const used = () => BD.items.reduce((a, i) => a + CATALOG[i.t].cost, 0);
const dims = (t, rot) => { const s = CATALOG[t].spec; return rot % 2 ? [s.d, s.w] : [s.w, s.d]; };
const isTool = k => k in TOOLS;

// tomten: terräng (höjdkarta, skog, vatten) och en kantlinje som följer marken, omgiven av kullar
export function buildPlot(ter){
  buildTerrain(ter);
  BD.edge = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x9ee0ff, transparent: true, opacity: .7 })); E.scene.add(BD.edge); edgeLine();
  let s = 5; const r = () => (s = (s*16807) % 2147483647)/2147483647, rock = pbr('rocky_terrain_02', { tri: 6 });
  for (let i = 0; i < 22; i++){ const a = i/22*6.283, d = 110 + r()*110, h = 12 + r()*30, m = new THREE.Mesh(new THREE.ConeGeometry(25 + r()*30, h, 9), rock); m.position.set(Math.cos(a)*d, h/2 - 2, Math.sin(a)*d); m.castShadow = m.receiveShadow = true; E.scene.add(m); }
}
function edgeLine(){ const P = BD.plot/2, pts = []; for (const [ax, az, bx, bz] of [[-P, -P, P, -P], [P, -P, P, P], [P, P, -P, P], [-P, P, -P, -P]]) for (let t = 0; t < 1; t += 1/P) pts.push(new THREE.Vector3(ax + (bx - ax)*t, 0, az + (bz - az)*t)); pts.push(pts[0].clone()); for (const p of pts) p.y = Math.max(hAt(p.x, p.z), T.sea) + .08; BD.edge.geometry.setFromPoints(pts); }
// sockel av betong under varje byggnad (döljer skarven mot sluttande mark)
let PLM = null;
function placeBuilding(it){
  const C = CATALOG[it.t], [w, d] = dims(it.t, it.rot);
  if (C.obj){ it.y = hAt(it.x, it.z); it.def = defMake(it, C.spec, null); return null; }
  if (it.y == null) it.y = footHeight(it.x, it.z, w, d);
  const sp = Object.assign({}, C.spec, { x: it.x, z: it.z, w, d, y: it.y });
  it.b = addBuilding(sp); if (GUNS[it.t]) it.def = defMake(it, C.spec, it.b);
  PLM = PLM || pbr('concrete_wall_004', { tri: 2 });
  const pl = new THREE.Mesh(new THREE.BoxGeometry(w + .5, 3, d + .5), PLM); pl.position.set(it.x, it.y - 1.48, it.z); pl.castShadow = pl.receiveShadow = true; E.scene.add(pl); it.plinth = pl;
  return it.b;
}
const footOf = it => { const [w, d] = dims(it.t, it.rot); return [it.x - w/2, it.z - d/2, it.x + w/2, it.z + d/2]; };
function setFeet(){ T.feet = BD.items.filter(i => !CATALOG[i.t].obj).map(footOf); }
// minor och taggtråd följer marken när den formas om
function refreshObjs(){ for (const it of BD.items) if (CATALOG[it.t].obj){ defDispose(it.def); it.y = hAt(it.x, it.z); it.def = defMake(it, CATALOG[it.t].spec, null); } }
// spelet: bygg byggnader på terrängen (höjden räknas från marken, som är planad sedan byggaren)
export function rebuild(items){ T.feet = items.filter(i => !CATALOG[i.t].obj).map(footOf); for (const it of items){ it.b = null; it.y = null; placeBuilding(it); } }
export { terPhysics };
// efter en mall: plana om marken under alla byggnader
T.reflatten = () => { if (!BD.on) return; for (const it of BD.items){ if (CATALOG[it.t].obj) continue; const [w, d] = dims(it.t, it.rot); flattenFoot(it.x, it.z, w, d, it.y); } };
function overlaps(t, x, z, rot, skip){
  const [w, d] = dims(t, rot), P = BD.plot/2;
  if (x - w/2 < -P || x + w/2 > P || z - d/2 < -P || z + d/2 > P) return true;
  for (const it of BD.items){ if (it === skip) continue; const [w2, d2] = dims(it.t, it.rot); if (Math.abs(x - it.x) < (w + w2)/2 - .01 && Math.abs(z - it.z) < (d + d2)/2 - .01) return true; }
  return false;
}
// ångra/gör om: mark och byggnader i samma steg
function snapshot(){ return { h: T.h.slice(), f: T.f.slice(), items: JSON.stringify(plain(BD.items)), sea: T.sea }; }
function pushUndo(){ BD.undo.push(snapshot()); if (BD.undo.length > 40) BD.undo.shift(); BD.redo.length = 0; }
function restore(s){
  T.h.set(s.h); T.f.set(s.f); T.sea = s.sea;
  if (s.items !== JSON.stringify(plain(BD.items))){ for (const it of BD.items) disposeItem(it); BD.items = JSON.parse(s.items); setFeet(); for (const it of BD.items){ const [w, d] = dims(it.t, it.rot); it.y = footHeight(it.x, it.z, w, d); placeBuilding(it); } BD.edit = null; } else refreshObjs();
  terRefresh(true); edgeLine(); ui();
}
function undo(){ const s = BD.undo.pop(); if (!s) return flash('Inget att ångra'); BD.redo.push(snapshot()); restore(s); flash('Ångrat (' + BD.undo.length + ' steg kvar)'); }
function redo(){ const s = BD.redo.pop(); if (!s) return; BD.undo.push(snapshot()); restore(s); }
function disposeItem(it){ if (it.def){ defDispose(it.def); it.def = null; } if (it.b) it.b.dispose(); if (it.plinth){ E.scene.remove(it.plinth); it.plinth.geometry.dispose(); } }

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
  const sl = loadSlots(), hq = BD.items.some(i => i.t === 'hq');
  u.innerHTML = `<div class="bt">BASBYGGAREN <small>BYGGPOÄNG ${used()} / ${BD.budget >= 99999 ? '∞' : BD.budget}</small> <small style="color:${hq ? 'var(--gr)' : 'var(--or)'}">${hq ? '✓ HÖGKVARTER PLACERAT' : '! PLACERA ETT HÖGKVARTER'}</small></div>
  <div class="bu"><span class="bb" data-undo="1" style="opacity:${BD.undo.length ? 1 : .4}">↶ ÅNGRA</span><span class="bb" data-redo="1" style="opacity:${BD.redo.length ? 1 : .4}">↷ GÖR OM</span><span class="bb" data-clear="1">⌫ RENSA MARKEN</span></div>
  <div class="bw">
  <div class="bm"><span class="bl">MARK</span>${Object.entries(TOOLS).map(([k, n]) => `<div class="bi sm ${BD.sel === k ? 'on' : ''}" data-k="${k}">${n}</div>`).join('')}<span class="bl">PENSEL ${BD.rad} M</span><span class="bl">MALL</span>${Object.entries(PRESETS).map(([k, n]) => `<span class="bb" data-pre="${k}">${n}</span>`).join('')}</div>
  <div class="bf"><span class="bl">FÖRSVAR</span>${Object.entries(CATALOG).filter(([k, c]) => c.def).map(([k, c]) => `<div class="bi sm ${BD.sel === k ? 'on' : ''}" data-k="${k}">${c.name} <small style="display:inline">${c.cost} P</small></div>`).join('')}<div class="bi sm ${BD.sel === 'edit' ? 'on' : ''}" data-k="edit">VÄLJ / STÄLL IN</div></div>
  <div class="bp">${Object.entries(CATALOG).filter(([k, c]) => !c.def).map(([k, c]) => `<div class="bi ${BD.sel === k ? 'on' : ''}" data-k="${k}">${c.name}<small>${c.cost} P · ${c.spec.w}×${c.spec.d} M</small></div>`).join('')}<div class="bi ${BD.sel === 'del' ? 'on' : ''}" data-k="del">RIV<small>ta bort byggnad</small></div></div>
  <div class="bs">${sl.map((s, i) => `<span class="bb" data-save="${i}">SPARA ${i + 1}</span><span class="bb" data-load="${i}" style="opacity:${s ? 1 : .35}">LADDA ${i + 1}</span>`).join('')}
    <span class="bb" data-code="1">BASKOD</span><span class="bb" data-test="1" style="opacity:${hq ? 1 : .35}">TESTA BASEN ›</span><span class="bb" data-menu="1">‹ MENY</span></div>
  <div class="bh">${isTool(BD.sel) ? 'HÅLL VÄNSTER MÅLA · [ ] ELLER SHIFT+HJUL PENSELSTORLEK · CTRL+Z ÅNGRA' : 'KLICK BYGG · R VRID · HÖGERDRA VRID KAMERA · HJUL ZOOM · WASD FLYTTA · 1–9 VÄLJ · DELETE RIV VALT · 0 UTVECKLARLÄGE · CTRL+Z ÅNGRA'}</div></div>${editPanel()}<div class="bc" id="bcode"></div>`;
  u.querySelectorAll('.bi').forEach(el => el.onclick = e => { e.stopPropagation(); BD.sel = el.dataset.k; ui(); });
  u.querySelectorAll('[data-pre]').forEach(el => el.onclick = () => { pushUndo(); terPreset(el.dataset.pre); refreshObjs(); edgeLine(); flash('Mall: ' + PRESETS[el.dataset.pre]); });
  u.querySelectorAll('[data-set]').forEach(el => el.onclick = () => { const it = BD.edit; if (!it) return; pushUndo(); const [k, v] = el.dataset.set.split(':'); if (k === 'dir') it.dir = ((it.dir || 0) + +v + 360) % 360; else it[k] = k === 'sec' ? +v : v; defRefreshFan(it.def); ui(); });
  u.querySelector('[data-undo]').onclick = undo; u.querySelector('[data-redo]').onclick = redo;
  u.querySelector('[data-clear]').onclick = () => { pushUndo(); terPreset('platt'); refreshObjs(); edgeLine(); ui(); flash('Marken är rensad – ↶ ÅNGRA tar tillbaka den'); };
  u.querySelectorAll('[data-save]').forEach(el => el.onclick = () => { const s = loadSlots(); s[+el.dataset.save] = currentBase(); flash(saveSlots(s) ? 'Basen sparad i plats ' + (+el.dataset.save + 1) : 'Kunde inte spara (fullt minne)'); });
  u.querySelectorAll('[data-load]').forEach(el => el.onclick = () => { const s = loadSlots()[+el.dataset.load]; if (s) startBuilder(s); });
  u.querySelector('[data-code]').onclick = async () => { const c = await encodeBase(currentBase()); document.getElementById('bcode').innerHTML = `<input id="bcin" value="${c}" style="width:420px"> <span class="bb" id="bcl">LADDA KOD</span>`; document.getElementById('bcl').onclick = async () => { try { startBuilder(await decodeBase(document.getElementById('bcin').value)); } catch (e){ flash('Ogiltig baskod'); } }; try { await navigator.clipboard.writeText(c); flash('Baskoden kopierad (' + c.length + ' tecken)'); } catch (e){} };
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
  canvas.addEventListener('mousedown', e => { if (!BD.on) return; if (e.button === 2 || e.button === 1){ BD.drag = true; return; } if (isTool(BD.sel)){ if (!BD.hover) return; pushUndo(); BD.paint = true; T.flatH = BD.sel === 'plana' ? hAt(BD.hover.x, BD.hover.z) : null; return; } click(); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mouseup', () => { BD.drag = false; if (BD.paint){ BD.paint = false; T.flatH = null; edgeLine(); } });
  canvas.addEventListener('wheel', e => { if (!BD.on) return; if (e.shiftKey && isTool(BD.sel)){ BD.rad = Math.max(2, Math.min(20, BD.rad + (e.deltaY > 0 ? -1 : 1))); ui(); return; } BD.cam.d = Math.max(18, Math.min(130, BD.cam.d*(1 + Math.sign(e.deltaY)*.1))); }, { passive: true });
  addEventListener('keydown', e => { if (!BD.on || e.target.tagName === 'INPUT') return; BD.keys[e.code] = true;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.code === 'KeyR') BD.rot = (BD.rot + 1) % 4;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight'){ BD.rad = Math.max(2, Math.min(20, BD.rad + (e.code === 'BracketRight' ? 1 : -1))); ui(); }
    if ((e.code === 'Delete' || e.code === 'Backspace') && BD.edit){ const it = BD.edit; pushUndo(); disposeItem(it); BD.items.splice(BD.items.indexOf(it), 1); BD.edit = null; setFeet(); ui(); return; }
    const n = +e.key; if (e.key >= '1' && e.key <= '9'){ BD.sel = [null, 'hq', 'bunker', 'house', 'tower', 'barr', 'wall', 'wallb', 'port', 'mg'][n]; BD.edit = null; ui(); } });
  addEventListener('keyup', e => { BD.keys[e.code] = false; });
}
function snap(t, rot, p){ const [w, d] = dims(t, rot); return [Math.round(p.x - w/2) + w/2, Math.round(p.z - d/2) + d/2]; }
function click(){
  if (!BD.hover) return; const { x, z } = BD.hover;
  if (BD.sel === 'edit'){ const it = BD.items.find(i => GUNS[i.t] && Math.abs(x - i.x) < dims(i.t, i.rot)[0]/2 + .5 && Math.abs(z - i.z) < dims(i.t, i.rot)[1]/2 + .5); BD.edit = it || null; ui(); return; }
  if (BD.sel === 'del'){ const it = BD.items.find(i => { const [w, d] = dims(i.t, i.rot); return Math.abs(x - i.x) < w/2 && Math.abs(z - i.z) < d/2; }); if (it){ pushUndo(); disposeItem(it); BD.items.splice(BD.items.indexOf(it), 1); if (BD.edit === it) BD.edit = null; setFeet(); ui(); } return; }
  const c = CATALOG[BD.sel], [sx, sz] = snap(BD.sel, BD.rot, BD.hover), [w, d] = dims(BD.sel, BD.rot);
  if (c.max && BD.items.filter(i => i.t === BD.sel).length >= c.max) return flash('Bara ett högkvarter per bas');
  if (used() + c.cost > BD.budget) return flash('Inte tillräckligt med byggpoäng');
  if (overlaps(BD.sel, sx, sz, BD.rot)) return flash('Krockar med något eller utanför tomten');
  if (footWater(sx, sz, w, d) > .35) return flash('Kan inte bygga i vatten – fyll upp marken först (HÖJ)');
  pushUndo();
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
  const tool = isTool(BD.sel);
  if (tool && BD.paint && BD.hover){ terBrush(BD.sel, BD.hover.x, BD.hover.z, BD.rad, dt); terRefresh(); }
  // penselring som följer marken
  BD.ring.visible = tool && !!BD.hover;
  if (BD.ring.visible){ const p = BD.ring.geometry.attributes.position; for (let i = 0; i <= 64; i++){ const a = i/64*6.283, x = BD.hover.x + Math.cos(a)*BD.rad, z = BD.hover.z + Math.sin(a)*BD.rad; p.setXYZ(i, x, Math.max(hAt(x, z), T.sea) + .15, z); } p.needsUpdate = true; BD.ring.material.color.set(BD.sel === 'vatten' ? 0x50b0ff : BD.sel === 'skog' ? 0x70ff70 : BD.sel === 'roj' || BD.sel === 'radera' ? 0xff9050 : 0xffd060); }
  // siktsektorer: alla när man ställer in, det valda starkare
  for (const it of BD.items) if (it.def && it.def.fan){ defShowFan(it.def, BD.sel === 'edit' || !!GUNS[BD.sel]); it.def.fan.material.opacity = BD.edit === it ? .2 : .06; }
  const g = BD.ghost; g.visible = !!BD.hover && !tool && !!CATALOG[BD.sel];
  if (g.visible){ const c = CATALOG[BD.sel], [w, d] = dims(BD.sel, BD.rot), h = c.spec.floors*c.spec.fh*c.spec.c, [sx, sz] = snap(BD.sel, BD.rot, BD.hover), bad = overlaps(BD.sel, sx, sz, BD.rot) || used() + c.cost > BD.budget || footWater(sx, sz, w, d) > .35, y = Math.max(footHeight(sx, sz, w, d), T.sea + .3);
    g.scale.set(w, h, d); g.position.set(sx, y + h/2, sz); g.material.color.set(bad ? 0xff5040 : 0x4dffa0); }
}
