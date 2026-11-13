// FÖRSVAR i basen: kulsprutor (MG-näste, vakttorn) med siktsektor, målprioritet och eldläge, minor och taggtråd.
// Allt är mål: kulor och sprängämnen förstör dem. Tornets kulspruta faller när taket under den är borta.
import * as THREE from 'three';
import { E } from './engine.js';
import { R, PH, own, ray } from './physics.js';
import { fx } from './fx.js';
import { sfx } from './audio.js';
import { PL, TARGETS, explode, NETHOOK } from './player.js';
import { DS } from './destruct.js';
import { T, hAt } from './terrain.js';

export const DEF = { list: [], on: false, spots: [], tracers: [], shells: [], alarm: 0 };
export const SECTORS = [90, 120, 180, 360], PRIOS = { nar: 'NÄRMAST', svag: 'SVAGAST', forst: 'FÖRST SEDD' }, MODES = { fri: 'FRI ELD', svar: 'BESVARA ELD', hall: 'HÅLL ELD' };
// vapendata per försvarstyp
export const GUNS = {
  mg:    { name: 'MG-NÄSTE', range: 55, rpm: 620, dmg: 9, spread: .011, hp: 260, turn: 2.6, burst: [7, 12], pause: .55, react: .55, h: 1.15 },
  tower: { name: 'VAKTTORN', range: 75, rpm: 520, dmg: 10, spread: .009, hp: 220, turn: 2.0, burst: [5, 9], pause: .7, react: .7, h: .9, top: true },
  // nya försvar: samma kulspruteskytt men olika vapen. splash = sprängverkan vid träff, indirect = kastar granater i båge
  // (behöver ingen fri sikt men sprider), rocket = projektil som spränger hål i väggar, flame = kort räckvidd, eldsken.
  tungmg:  { name: 'TUNG KULSPRUTA', range: 70, rpm: 450, dmg: 15, spread: .01, hp: 320, turn: 2.0, burst: [5, 9], pause: .7, react: .6, h: 1.15, model: 'heavy' },
  dubbelmg:{ name: 'DUBBEL-MG', range: 55, rpm: 1100, dmg: 8, spread: .016, hp: 300, turn: 2.8, burst: [10, 18], pause: .6, react: .5, h: 1.15, model: 'twin' },
  prick:   { name: 'PRICKSKYTTETORN', range: 130, rpm: 40, dmg: 55, spread: .002, hp: 160, turn: 1.4, burst: [1, 1], pause: 1.4, react: 1.1, h: .9, top: true, model: 'rifle' },
  akan:    { name: 'AUTOMATKANON', range: 90, rpm: 160, dmg: 30, spread: .008, hp: 450, turn: 1.3, burst: [3, 6], pause: 1.0, react: .8, h: 1.3, splash: 1.6, model: 'cannon' },
  granat:  { name: 'GRANATKASTARE', range: 110, minRange: 15, rpm: 15, dmg: 0, spread: .03, hp: 200, turn: 1.0, burst: [1, 1], pause: 3.5, react: 1.5, h: .6, splash: 3.2, indirect: true, model: 'mortar' },
  eld:     { name: 'ELDKASTARE', range: 14, rpm: 900, dmg: 3, spread: .06, hp: 260, turn: 3.0, burst: [20, 30], pause: .8, react: .4, h: 1.0, flame: true, model: 'flame' },
  pv:      { name: 'PANSARVÄRNSPJÄS', range: 85, rpm: 10, dmg: 0, spread: .004, hp: 300, turn: 1.0, burst: [1, 1], pause: 5, react: 1.2, h: 1.0, splash: 2.4, rocket: true, model: 'cannon' },
  bvarn:   { name: 'BETONGVÄRN MED MG', range: 60, rpm: 600, dmg: 9, spread: .011, hp: 300, turn: 2.4, burst: [6, 10], pause: .6, react: .55, h: .9, top: true, model: 'heavy' },
};
export const isGun = t => Object.prototype.hasOwnProperty.call(GUNS, t);
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const wrap = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };

// kulspruta på trefot med skyddsplåt och ammunitionslåda (byggd i bitar så att den kan vridas)
let GM = null;
function gunMats(){ return GM || (GM = { metal: new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: .45, metalness: .85 }), olive: new THREE.MeshStandardMaterial({ color: 0x4a4d38, roughness: .7, metalness: .2 }), dark: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: .5, metalness: .7 }), flash: new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: .95 }) }); }
function gunModel(shield, kind){
  if (kind === 'mortar') return mortarModel();
  const M = gunMats(), root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(); root.add(yaw); yaw.add(pitch);
  const m = (g, mat, x, y, z, p) => { const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; (p || pitch).add(o); return o; };
  for (let i = 0; i < 3; i++){ const a = i/3*6.283 + .5, l = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 1.1, 6), M.olive); l.position.set(Math.sin(a)*.32, -.55, Math.cos(a)*.32); l.rotation.set(Math.cos(a)*.55, 0, -Math.sin(a)*.55); l.castShadow = true; root.add(l); }
  m(new THREE.CylinderGeometry(.04, .05, .25, 8), M.metal, 0, -.12, 0, yaw);
  m(new THREE.BoxGeometry(.12, .14, .5), M.metal, 0, 0, -.05); m(new THREE.CylinderGeometry(.026, .026, .8, 10).rotateX(Math.PI/2), M.dark, 0, .02, .58);
  m(new THREE.CylinderGeometry(.045, .045, .38, 10).rotateX(Math.PI/2), M.dark, 0, .02, .34); m(new THREE.CylinderGeometry(.03, .036, .09, 8).rotateX(Math.PI/2), M.dark, 0, .02, 1.0);
  m(new THREE.BoxGeometry(.04, .2, .16), M.olive, -.05, -.06, -.36); m(new THREE.BoxGeometry(.2, .16, .26), M.olive, .17, -.06, -.02);
  for (const s of [-1, 1]) m(new THREE.CylinderGeometry(.012, .012, .25, 5), M.metal, s*.1, -.13, .62).rotation.z = s*.3;
  if (shield){ const sh = m(new THREE.BoxGeometry(.85, .55, .03), M.olive, 0, .08, .32); const cut = m(new THREE.BoxGeometry(.18, .12, .04), M.dark, 0, .06, .336); cut.scale.set(1, 1, 1); }
  // varianter: tung (grövre pipa), dubbel (två pipor), gevär (lång smal pipa), kanon (grov pipa + stor sköld), eldkastare (munstycke + tankar)
  if (kind === 'heavy') m(new THREE.CylinderGeometry(.04, .04, .9, 10).rotateX(Math.PI/2), M.dark, 0, .02, .62);
  if (kind === 'twin') m(new THREE.CylinderGeometry(.026, .026, .8, 10).rotateX(Math.PI/2), M.dark, .09, .02, .58);
  if (kind === 'rifle'){ m(new THREE.CylinderGeometry(.016, .016, 1.3, 8).rotateX(Math.PI/2), M.dark, 0, .02, .8); m(new THREE.CylinderGeometry(.035, .035, .3, 10).rotateX(Math.PI/2), M.metal, 0, .1, .05); }
  if (kind === 'cannon'){ m(new THREE.CylinderGeometry(.07, .08, 1.4, 12).rotateX(Math.PI/2), M.dark, 0, .02, .8); m(new THREE.BoxGeometry(1.2, .8, .05), M.olive, 0, .1, .3); }
  if (kind === 'flame'){ m(new THREE.CylinderGeometry(.05, .03, .6, 10).rotateX(Math.PI/2), M.dark, 0, .02, .55); for (const s2 of [-1, 1]) m(new THREE.CylinderGeometry(.12, .12, .55, 12), M.olive, s2*.16, -.2, -.3, yaw); }
  const fz = kind === 'cannon' ? 1.55 : kind === 'rifle' ? 1.5 : 1.2;
  const fl = new THREE.Mesh(new THREE.ConeGeometry(kind === 'flame' ? .25 : .09, kind === 'flame' ? 1.4 : .35, 8, 1, true).rotateX(-Math.PI/2), kind === 'flame' ? flameMat() : M.flash); fl.position.set(0, .02, fz + (kind === 'flame' ? .5 : 0)); fl.visible = false; pitch.add(fl);
  const L = new THREE.PointLight(kind === 'flame' ? 0xff7a20 : 0xffb060, 0, kind === 'flame' ? 14 : 9, 2); fl.add(L);
  return { root, yaw, pitch, fl, L };
}
let FLM = null;
const flameMat = () => FLM || (FLM = new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
// granatkastare: rör på bipod, riktat brant uppåt
function mortarModel(){
  const M = gunMats(), root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(); root.add(yaw); yaw.add(pitch);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.28, .3, .06, 14), M.dark); base.position.y = -.55; base.castShadow = true; root.add(base);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 1.2, 12), M.olive); tube.position.set(0, -.05, .1); tube.rotation.x = .75; tube.castShadow = true; pitch.add(tube);
  for (const s2 of [-1, 1]){ const l = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .8, 6), M.metal); l.position.set(s2*.2, -.25, .35); l.rotation.set(-.4, 0, s2*.35); yaw.add(l); }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(.12, .4, 8, 1, true), M.flash); fl.position.set(0, .4, .5); fl.visible = false; pitch.add(fl);
  const L = new THREE.PointLight(0xffb060, 0, 9, 2); fl.add(L);
  return { root, yaw, pitch, fl, L, mortar: true };
}
let FANA = null;
function sectorFan(it, g){
  const r = g.range, a = (it.sec || 360)*Math.PI/180, geo = new THREE.CircleGeometry(r, 48, Math.PI/2 - a/2, a); geo.rotateX(-Math.PI/2);
  // siktsektorn ritas på marken och tonar ut mot kanten (en tät skiva i torn-höjd färgade förut hela bilden orange)
  FANA = FANA || (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, '#fff'); g.addColorStop(.75, '#888'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff6040, alphaMap: FANA, transparent: true, opacity: .07, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  // tydlig kontur: en sektor med en inskjuten sektor som hål (0,35 m bred kant)
  const sec = (rr, w) => { const sh = new THREE.Shape(), st = Math.PI/2 - a/2, N = 40, P = (k, R) => [Math.cos(st + a*k/N)*R, Math.sin(st + a*k/N)*R];
    if (a < 6.28){ sh.moveTo(0, 0); for (let k = 0; k <= N; k++) sh.lineTo(...P(k, rr)); sh.lineTo(0, 0); } else { sh.moveTo(rr, 0); sh.absarc(0, 0, rr, 0, 6.2832, false); }
    const h = new THREE.Path(), ri = rr - w, off = a < 6.28 ? w/Math.sin(Math.min(a, 3.1)/2) : 0, ox = 0, oy = off;
    if (a < 6.28){ const c = Math.cos(st + a/2), s2 = Math.sin(st + a/2); h.moveTo(c*off, s2*off); for (let k = 1; k < N; k++) h.lineTo(...P(k, ri)); h.lineTo(c*off, s2*off); } else { h.moveTo(ri, 0); h.absarc(0, 0, ri, 0, 6.2832, true); }
    sh.holes.push(h); const g2 = new THREE.ShapeGeometry(sh, 1); g2.rotateX(-Math.PI/2); return g2; };
  const edge = new THREE.Mesh(sec(r, .35), new THREE.MeshBasicMaterial({ color: 0xff7050, transparent: true, opacity: .8, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  m.add(edge); m.renderOrder = 30; edge.renderOrder = 31; return m;
}

// skapa försvarets föremål för en placerad sak (används både i byggaren och i spelet)
export function defMake(it, spec, b){
  if (isGun(it.t)){
    const g = GUNS[it.t], top = g.top ? spec.floors*spec.fh*spec.c : 0, M = gunModel(!g.top && it.t !== 'eld', g.model);
    const p = new THREE.Vector3(it.x, it.y + top + g.h, it.z); M.root.position.copy(p); E.scene.add(M.root);
    it.dir = it.dir ?? 0; it.sec = it.sec ?? (g.top || g.indirect ? 360 : 120); it.pri = it.pri || 'nar'; it.mode = it.mode || 'fri';
    const d = { it, g, b, kind: 'gun', M, pos: p, hp: g.hp, alive: true, yaw: it.dir*Math.PI/180, pitch: 0, cool: 0, shots: 0, seen: 0, tgt: null, los: 0, losT: 0, firstSeen: new Map(), shotAt: 0 };
    M.yaw.rotation.y = d.yaw; d.fan = sectorFan(it, g); d.fan.position.set(it.x, (it.y || 0) + .7, it.z); d.fan.rotation.y = d.yaw; d.fan.visible = false; E.scene.add(d.fan);
    d.target = { alive: true, pos: p, hit: (dmg, from) => hurt(d, dmg, from) }; TARGETS.push(d.target);
    DEF.list.push(d); return d;
  }
  if (it.t === 'mine'){
    const M = gunMats(), m = new THREE.Mesh(new THREE.CylinderGeometry(.16, .18, .07, 12), M.olive); m.position.set(it.x, hAt(it.x, it.z) + .02, it.z); m.castShadow = true; E.scene.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .03, 8), M.dark); cap.position.y = .045; m.add(cap);
    const d = { it, kind: 'mine', m, pos: m.position, alive: true, arm: 0 }; d.target = { alive: true, pos: m.position, hit: () => mineBoom(d) }; TARGETS.push(d.target); DEF.list.push(d); return d;
  }
  if (it.t === 'minfalt'){
    // minfält: sex minor utspridda över 4×4 m (fast mönster så att baskoden ger samma fält)
    const subs = [], off = [[-1.4, -1.3], [.2, -1.5], [1.5, -.4], [-1.2, .3], [.4, .5], [1.3, 1.4]];
    for (const [ox, oz] of off){ const x = it.x + ox, z = it.z + oz; subs.push(defMake({ t: 'mine', x, z, rot: 0, y: hAt(x, z) }, { w: 1, d: 1 }, null)); }
    const d = { it, kind: 'field', subs, pos: new THREE.Vector3(it.x, hAt(it.x, it.z), it.z), alive: true }; DEF.list.push(d); return d;
  }
  if (it.t === 'hinder'){
    // pansarhinder ("tjeckisk igelkott"): tre korslagda stålbalkar som stoppar fordon och ger skydd. Förstörs av sprängämnen.
    const grp = new THREE.Group(), M = gunMats();
    for (const [rx, rz] of [[.62, 0], [-.62, 0], [0, 1.57]]){ const b = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.1, .18), M.metal); b.rotation.set(rx, rz ? 0 : .6, rz ? .62 : 0); b.position.y = .62; b.castShadow = true; grp.add(b); }
    grp.position.set(it.x, (it.y ?? hAt(it.x, it.z)), it.z); grp.rotation.y = (it.rot || 0)*Math.PI/2 + Math.PI/4; E.scene.add(grp);
    const col = PH.world.createCollider(R.ColliderDesc.cuboid(.75, .65, .75).setTranslation(it.x, grp.position.y + .65, it.z), PH.ground);
    const d = { it, kind: 'hinder', m: grp, pos: grp.position, alive: true, col };
    d.target = { alive: true, pos: grp.position, hit: (dmg) => { if (dmg > 200 && d.alive){ d.alive = false; d.target.alive = false; grp.rotation.z = 1.2; grp.position.y -= .3; if (d.col){ try { PH.world.removeCollider(d.col, false); } catch (e){} d.col = null; } fx.sparks(it.x, grp.position.y + .6, it.z, 0, 1, 0, 10); } } };
    TARGETS.push(d.target); DEF.list.push(d); return d;
  }
  if (it.t === 'claymore'){
    // riktad mina: utlöses när någon kommer inom 7 m framför den (±35°), sprutar splitter framåt
    const M = gunMats(), grp = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(.24, .14, .05), M.olive); box.position.y = .22; box.castShadow = true; grp.add(box);
    for (const s2 of [-1, 1]){ const l = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .2, 4), M.metal); l.position.set(s2*.08, .08, 0); l.rotation.z = s2*.3; grp.add(l); }
    const ry = (it.rot || 0)*Math.PI/2; grp.position.set(it.x, (it.y ?? hAt(it.x, it.z)), it.z); grp.rotation.y = ry; E.scene.add(grp);
    const d = { it, kind: 'claymore', m: grp, pos: grp.position, alive: true, arm: 0, dir: ry };
    d.target = { alive: true, pos: grp.position, hit: () => clayBoom(d) }; TARGETS.push(d.target); DEF.list.push(d); return d;
  }
  if (it.t === 'snubbel'){
    // snubbeltråd: tunn tråd mellan två pinnar – den som går igenom larmar alla vapen i närheten
    const M = gunMats(), grp = new THREE.Group(), [w] = it.rot % 2 ? [1, 6] : [6, 1];
    for (const s2 of [-1, 1]){ const st = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .5, 5), M.metal); st.position.set(s2*2.9, .25, 0); grp.add(st); }
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, 5.8, 3).rotateZ(Math.PI/2), new THREE.MeshBasicMaterial({ color: 0x9a9890 })); wire.position.y = .2; grp.add(wire);
    grp.position.set(it.x, (it.y ?? hAt(it.x, it.z)), it.z); grp.rotation.y = it.rot % 2 ? Math.PI/2 : 0; E.scene.add(grp);
    const d = { it, kind: 'snubbel', m: grp, pos: grp.position, w: it.rot % 2 ? 1 : 6, d: it.rot % 2 ? 6 : 1, alive: true, cool: 0 }; DEF.list.push(d); return d;
  }
  if (it.t === 'stralk'){
    // strålkastare: lyser upp området – vapen inom 25 m reagerar dubbelt så snabbt
    const M = gunMats(), grp = new THREE.Group(), post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 3, 8), M.metal); post.position.y = 1.5; post.castShadow = true; grp.add(post);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, .4, 12).rotateX(Math.PI/2), M.dark); head.position.set(0, 3, .1); grp.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.2, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d0 })); lens.position.set(0, 3, .31); grp.add(lens);
    const L = new THREE.SpotLight(0xfff0d0, 60, 40, .5, .6, 1.5); L.position.set(0, 3, .3); L.target.position.set(0, 0, 14); grp.add(L); grp.add(L.target);
    grp.position.set(it.x, (it.y ?? hAt(it.x, it.z)), it.z); grp.rotation.y = (it.rot || 0)*Math.PI/2; E.scene.add(grp);
    const d = { it, kind: 'stralk', m: grp, pos: grp.position, alive: true, L, lens };
    d.target = { alive: true, pos: new THREE.Vector3(it.x, grp.position.y + 3, it.z), hit: (dmg) => { if (!d.alive) return; d.alive = false; d.target.alive = false; L.intensity = 0; lens.material = gunMats().dark; fx.glass(it.x, grp.position.y + 3, it.z, 0, 1, 6); } };
    TARGETS.push(d.target); DEF.list.push(d); return d;
  }
  if (it.t === 'wire'){
    const [w, dd] = it.rot % 2 ? [1, 6] : [6, 1], grp = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: .4, metalness: .9 });
    const pts = []; for (let i = 0; i <= 260; i++){ const t = i/260, a = t*6.283*22; pts.push(new THREE.Vector3((t - .5)*6, .42 + Math.sin(a)*.4, Math.cos(a)*.4)); }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 900, .007, 4), mat); coil.castShadow = true; grp.add(coil);
    for (let i = 0; i < 4; i++){ const st = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.1, 5), gunMats().metal); st.position.set(-2.6 + i*1.73, .5, 0); grp.add(st); }
    grp.position.set(it.x, 0, it.z); grp.rotation.y = it.rot % 2 ? Math.PI/2 : 0; E.scene.add(grp);
    // följ marken: sänk hela rullen till markhöjden i mitten och luta lite
    grp.position.y = hAt(it.x, it.z) - .05;
    const d = { it, kind: 'wire', m: grp, pos: grp.position, w, d: dd, alive: true }; d.target = { alive: true, pos: grp.position, hit: (dmg) => { if (dmg > 200) wireCut(d); } }; TARGETS.push(d.target); DEF.list.push(d); return d;
  }
  return null;
}
export function defDispose(d){
  if (!d) return; d.alive = false; if (d.target) d.target.alive = false;
  if (d.subs){ for (const x of d.subs) defDispose(x); d.subs = null; }
  for (const o of [d.M && d.M.root, d.fan, d.m]) if (o && o.parent) o.parent.remove(o);
  const i = DEF.list.indexOf(d); if (i >= 0) DEF.list.splice(i, 1);
  if (d.col){ PH.owner.delete(d.col.handle); try { PH.world.removeCollider(d.col, false); } catch (e){} d.col = null; }
}
// visa siktsektorn (byggaren)
export function defShowFan(d, on){ if (d && d.fan){ d.fan.visible = on; } }
export function defRefreshFan(d){ if (!d || !d.fan) return; const p = d.fan.position.clone(), v = d.fan.visible; E.scene.remove(d.fan); d.fan = sectorFan(d.it, d.g); d.fan.position.copy(p); d.yaw = d.it.dir*Math.PI/180; d.fan.rotation.y = d.yaw; d.M.yaw.rotation.y = d.yaw; d.fan.visible = v; E.scene.add(d.fan); }

// spelet: kolliderare för vapnen (träffbara)
export function defStart(){
  DEF.on = true; DEF.spots.length = 0;
  for (const d of DEF.list) if (d.kind === 'gun'){ d.col = own(PH.world.createCollider(R.ColliderDesc.ball(.42).setTranslation(d.pos.x, d.pos.y + .05, d.pos.z), PH.ground), { target: d.target }); }
}
export function defStop(){ DEF.on = false; }
function hurt(d, dmg, from){
  if (!d.alive) return; d.hp -= dmg; d.shotAt = 3; if (from) d.lastFrom = from;
  fx.sparks(d.pos.x, d.pos.y, d.pos.z, 0, 1, 0, 4); if (d.hp <= 0) gunDie(d);
}
function gunDie(d, fall){
  d.alive = false; d.target.alive = false; if (d.col){ PH.owner.delete(d.col.handle); PH.world.removeCollider(d.col, false); d.col = null; }
  fx.explosion(d.pos.x, d.pos.y, d.pos.z, .45); fx.smoke(d.pos.x, d.pos.y, d.pos.z, 1, true); sfx.boom(.5, d.pos.distanceTo(E.cam.position));
  // vapnet välter: luta och sjunk
  d.M.pitch.rotation.x = -.6; d.M.root.rotation.z = .5; d.M.root.position.y -= fall ? 0 : .35; d.M.fl.visible = false; d.M.L.intensity = 0;
  if (fall){ d.falling = { v: 0, y0: hAt(d.pos.x, d.pos.z) + .3 }; }
  DEF.onKill && DEF.onKill(d);
}
// en sprängning som kommer från nätet tar bort minan tyst (den som orsakade den har redan skickat sin egen sprängning)
function quietRemove(d){ d.alive = false; d.target.alive = false; E.scene.remove(d.m); }
function mineBoom(d){ if (!d.alive) return; if (NETHOOK.applying) return quietRemove(d); d.alive = false; d.target.alive = false; E.scene.remove(d.m); PL.nextCause = 'MINA'; explode(d.pos.clone().setY(d.pos.y + .1), 2.4, 700, 1, null, false, true, d.it && d.it.side); DEF.onKill && DEF.onKill(d); }
function clayBoom(d){
  if (!d.alive) return; if (NETHOOK.applying) return quietRemove(d); d.alive = false; d.target.alive = false; E.scene.remove(d.m); PL.nextCause = 'CLAYMORE';
  const f = new THREE.Vector3(Math.sin(d.dir), 0, Math.cos(d.dir)), p = d.pos.clone().setY(d.pos.y + .3);
  explode(p.clone().addScaledVector(f, 1.2), 1.6, 400, .6, null, false, true, d.it && d.it.side);
  // splitter framåt: extra skada i en kon framför minan
  // (egen claymore skadar inte spelaren eller egna soldater; fiendens AI-soldater i konen tar samma skada som spelaren)
  const side = d.it && d.it.side, cone = (x, z) => { const dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz); return dist < 12 && (dx*f.x + dz*f.z)/(dist || 1) > .7 ? 120*(1 - dist/12) : 0; };
  if (PL.on && PL.body && side !== 'us'){ const t = PL.body.translation(), dm = cone(t.x, t.z); if (dm > 0){ PL.hp -= dm; PL.dmgT = .8; PL.lastHit = { by: 'CLAYMORE', x: p.x, z: p.z }; } }
  for (const t of (DEF.extra ? DEF.extra() : [])){ if (!t.onHit || (side && t.team === side)) continue; const dm = cone(t.x, t.z); if (dm > 0) t.onHit(dm); }
  DEF.onKill && DEF.onKill(d);
}
// larm: alla vapen inom 60 m vaknar (även de som står i BESVARA ELD) och reagerar snabbare en stund
function alarm(p){ DEF.alarm = 6; for (const g of DEF.list) if (g.kind === 'gun' && g.alive && g.pos.distanceTo(p) < 60) g.shotAt = 6; sfx.click && sfx.click(); }
function litBy(d){ for (const x of DEF.list) if (x.kind === 'stralk' && x.alive && x.pos.distanceTo(d.pos) < 25) return true; return false; }
// utlös en mina/claymore/snubbeltråd utifrån (AI-soldater i lägena)
// samma utlösningsregel för claymore som för spelaren: inom 7 m och i en kon framför minan
export function clayInCone(d, x, z){ const dx = x - d.pos.x, dz = z - d.pos.z, dist = Math.hypot(dx, dz); return dist < 7 && (dx*Math.sin(d.dir) + dz*Math.cos(d.dir))/(dist || 1) > Math.cos(.61); }
export function defTrigger(d){ if (!d || !d.alive) return; if (d.kind === 'mine') mineBoom(d); else if (d.kind === 'claymore') clayBoom(d); else if (d.kind === 'snubbel' && !d.cool){ d.cool = 4; alarm(d.pos); } }
function wireCut(d){ if (!d.alive) return; d.alive = false; d.target.alive = false; d.m.rotation.z = .3; d.m.scale.y = .35; d.m.position.y -= .1; fx.sparks(d.pos.x, d.pos.y + .4, d.pos.z, 0, 1, 0, 8); }

// mål för försvaret: spelaren (fas D: även AI-anfallare via DEF.extra())
function targets(){
  const L = []; if (PL.on && PL.body && PL.hp > 0){ const t = PL.body.translation(); L.push({ id: 'pl', x: t.x, y: t.y + .45 - .35*PL.crouch, z: t.z, hp: PL.hp, v: PL.speed || 0, crouch: PL.crouch, col: PL.col, pl: true }); }
  if (DEF.extra) L.push(...DEF.extra()); return L;
}
// spårljus: korta ljusa streck som flyger mot målet
let TRG = null, TRM = null, ROCKM = null;
function tracer(o, dir, len){
  TRG = TRG || new THREE.CylinderGeometry(.018, .018, 1, 4).rotateX(Math.PI/2).translate(0, 0, .5); TRM = TRM || new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(TRG, TRM); m.position.copy(o); m.lookAt(_v.copy(o).add(dir)); m.scale.set(1, 1, 3.5); E.scene.add(m); DEF.tracers.push({ m, dir: dir.clone(), left: len, sp: 320 });
}
export function updateDefense(dt){
  // spårljus
  for (let i = DEF.tracers.length - 1; i >= 0; i--){ const t = DEF.tracers[i], s = Math.min(t.left, t.sp*dt); t.m.position.addScaledVector(t.dir, s); t.left -= s; if (t.left <= 0){ E.scene.remove(t.m); DEF.tracers.splice(i, 1); } }
  for (let i = DEF.spots.length - 1; i >= 0; i--) if ((DEF.spots[i].t -= dt) <= 0) DEF.spots.splice(i, 1);
  // granater och pansarvärnsrobotar i luften
  for (let i = DEF.shells.length - 1; i >= 0; i--){ const sh = DEF.shells[i]; sh.t -= dt;
    if (sh.m){ const k = 1 - Math.max(0, sh.t)/sh.T; sh.m.position.lerpVectors(sh.from, sh.to, k); if (sh.arc) sh.m.position.y += Math.sin(k*Math.PI)*sh.arc; }
    if (sh.t <= 0){ if (sh.m) E.scene.remove(sh.m); DEF.shells.splice(i, 1); if (DEF.on){ PL.nextCause = sh.by; explode(sh.to, sh.r, sh.dmg, sh.k, sh.n, sh.breach, true, sh.side); } } }
  if (!DEF.on) return;
  DEF.alarm = Math.max(0, (DEF.alarm || 0) - dt);
  // minor och claymore laddas efter 0,5 s oavsett vem som äger dem (förut bara i spelarslingan, så egna utlöstes aldrig av fiendens AI)
  for (const d of DEF.list) if ((d.kind === 'claymore' || d.kind === 'mine') && d.alive) d.armT = (d.armT || 0) + dt;
  // spelaren: taggtråd och vatten bromsar
  PL.slowK = 1;
  if (PL.on && PL.body){ const p = PL.body.translation();
    if (p.y - .9 < T.sea - .35) PL.slowK = .55;
    for (const d of DEF.list){
      if (d.it && d.it.side === 'us') continue; // egna minor och hinder påverkar inte spelaren
      if (d.kind === 'wire' && d.alive && Math.abs(p.x - d.pos.x) < d.w/2 + .2 && Math.abs(p.z - d.pos.z) < d.d/2 + .3 && p.y - .9 < d.pos.y + .9){ PL.slowK = Math.min(PL.slowK, .28); PL.hp -= 8*dt; PL.dmgT = .3; PL.lastHit = { by: 'TAGGTRÅD', x: d.pos.x, z: d.pos.z }; if (Math.random() < dt*3) sfx.click(); }
      if (d.kind === 'mine' && d.alive){ d.arm += dt; if (d.arm > .5 && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 1.1 && p.y - .9 < d.pos.y + .6){ sfx.click(); mineBoom(d); } }
      if (d.kind === 'claymore' && d.alive){ d.arm += dt; const dx = p.x - d.pos.x, dz = p.z - d.pos.z, dist = Math.hypot(dx, dz);
        if (d.arm > .5 && dist < 7 && Math.abs(p.y - .9 - d.pos.y) < 2 && (dx*Math.sin(d.dir) + dz*Math.cos(d.dir))/(dist || 1) > Math.cos(.61)){ sfx.click(); clayBoom(d); } }
      if (d.kind === 'snubbel' && d.alive){ d.cool = Math.max(0, d.cool - dt);
        if (!d.cool && Math.abs(p.x - d.pos.x) < d.w/2 + .2 && Math.abs(p.z - d.pos.z) < d.d/2 + .3 && p.y - .9 < d.pos.y + .5){ d.cool = 4; alarm(d.pos); } }
    } }
  const TG = targets();
  for (const d of DEF.list){
    if (d.kind !== 'gun') continue;
    if (d.falling){ const F = d.falling; F.v += 9.8*dt; d.M.root.position.y = Math.max(F.y0, d.M.root.position.y - F.v*dt); d.M.root.rotation.x += dt*1.5; if (d.M.root.position.y <= F.y0){ d.falling = null; fx.dust(d.pos.x, F.y0, d.pos.z, 1.5, 6); } continue; }
    if (!d.alive) continue;
    // tornets tak borta eller tornet rasar → kulsprutan faller
    // vapnets egen byggnad (näste, torn) rasar – t.ex. när byggnaden den står på ovanpå sprängs – då faller vapnet
    if (d.b && ((d.chk = (d.chk || 0) - dt) <= 0)){ d.chk = .3; const B = d.b, roofOk = !d.g.top || B.cells.some(c => c.alive && c.j === B.NY - 1 && Math.abs(c.i + .5 - B.NX/2) < 2.5 && Math.abs(c.k + .5 - B.NZ/2) < 2.5); if (!roofOk || DS.falls.some(f => f.b === B) || B.collapsed > 0){ gunDie(d, true); continue; } }
    d.shotAt = Math.max(0, d.shotAt - dt); d.cool = Math.max(0, d.cool - dt);
    const it = d.it, half = (it.sec || 360)*Math.PI/360, dir0 = it.dir*Math.PI/180;
    // välj mål: inom räckvidd och sektor, med fri sikt (kontrolleras några gånger i sekunden)
    d.losT -= dt; if (d.losT <= 0){ d.losT = .15 + Math.random()*.1; let best = null, bs = 1e9;
      const fireOk = it.mode === 'fri' || (it.mode === 'svar' && d.shotAt > 0);
      if (fireOk) for (const t of TG){ if (it.side && ((t.pl && it.side === 'us') || (t.team && t.team === it.side))) continue; const dx = t.x - d.pos.x, dz = t.z - d.pos.z, dist = Math.hypot(dx, dz, t.y - d.pos.y); if (dist > Math.min(d.g.range, DEF.maxRange || Infinity) || dist < (d.g.minRange || 0)) continue;
        if (half < Math.PI - .01 && Math.abs(wrap(Math.atan2(dx, dz) - dir0)) > half) continue;
        _v.copy(d.pos).setY(d.pos.y + .05); _d.set(t.x - _v.x, t.y + .3 - _v.y, t.z - _v.z); const L = _d.length(); _d.multiplyScalar(1/L);
        // granatkastaren skjuter i båge och behöver ingen fri sikt (men måste veta var målet är: larm, strålkastare eller att målet skjutit)
        if (d.g.indirect){ if (!(DEF.alarm > 0 || d.shotAt > 0 || litBy(d) || dist < 40)) continue; }
        else { _v.addScaledVector(_d, .7); const h = ray(_v, _d, L, d.col); if (!h || !((t.pl && h.owner && h.owner.player === true) || (!t.pl && t.col && h.col.handle === t.col.handle))) continue; }
        if (!d.firstSeen.has(t.id)) d.firstSeen.set(t.id, performance.now());
        const s = it.pri === 'svag' ? t.hp*10 + dist : it.pri === 'forst' ? d.firstSeen.get(t.id) : dist; if (s < bs){ bs = s; best = t; } }
      if (best && (!d.tgt || d.tgt.id !== best.id)) d.seen = 0; d.tgt = best; }
    const t = d.tgt; if (!t){ d.seen = 0; d.M.yaw.rotation.y += wrap(dir0 + Math.sin(E.time*.4 + d.pos.x)*Math.min(half, .6) - d.M.yaw.rotation.y)*Math.min(1, dt*.8); continue; }
    // vrid mot målet och skjut skurar efter reaktionstiden
    const ty = Math.atan2(t.x - d.pos.x, t.z - d.pos.z), dy = wrap(ty - d.M.yaw.rotation.y), dist = Math.hypot(t.x - d.pos.x, t.z - d.pos.z), tp = Math.atan2(t.y - d.pos.y, dist);
    d.M.yaw.rotation.y += Math.sign(dy)*Math.min(Math.abs(dy), d.g.turn*dt); d.M.pitch.rotation.x += (-tp - d.M.pitch.rotation.x)*Math.min(1, dt*8);
    const react = d.g.react*(litBy(d) ? .5 : 1)*(DEF.alarm > 0 ? .6 : 1);
    d.seen += dt; if (Math.abs(dy) > .06 || d.seen < react || d.cool > 0) { d.M.fl.visible = false; d.M.L.intensity = 0; continue; }
    d.cool = 60/d.g.rpm; d.shots++; if (d.shots >= (d.burstN || (d.burstN = d.g.burst[0] + Math.floor(Math.random()*(d.g.burst[1] - d.g.burst[0]))))){ d.shots = 0; d.burstN = 0; d.cool = d.g.pause*(.7 + Math.random()*.6); }
    shoot(d, t);
  }
}
function shoot(d, t){
  const o = _v.copy(d.pos).setY(d.pos.y + .05), dist = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
  if (d.g.indirect){
    // granat i båge: landar efter 1,5–3 s med 2–5 m spridning
    const sp = 2 + dist*.03, to = new THREE.Vector3(t.x + (Math.random() - .5)*sp*2, 0, t.z + (Math.random() - .5)*sp*2); to.y = Math.max(hAt(to.x, to.z), T.sea) + .2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 4), gunMats().dark); m.position.copy(o); E.scene.add(m);
    const T0 = 1.5 + dist/70; DEF.shells.push({ m, from: o.clone(), to, t: T0, T: T0, arc: 8 + dist*.15, r: d.g.splash, dmg: 380, k: .8, by: d.g.name, side: d.it && d.it.side });
    d.M.fl.visible = true; d.M.L.intensity = 20; setTimeout(() => { d.M.fl.visible = false; d.M.L.intensity = 0; }, 60); sfx.boom && sfx.boom(.2, o.distanceTo(E.cam.position)); return;
  }
  const sp = d.g.spread*(1 + Math.min(2, t.v/3))*(t.crouch > .5 ? .8 : 1);
  const dir = new THREE.Vector3(t.x - o.x + (Math.random() - .5)*sp*dist*2, t.y + .25 - o.y + (Math.random() - .5)*sp*dist*2, t.z - o.z + (Math.random() - .5)*sp*dist*2).normalize();
  const start = o.clone().addScaledVector(dir, 1.25), h = ray(start, dir, d.g.range + 10, d.col);
  d.M.fl.visible = true; d.M.fl.rotation.z = Math.random()*6; d.M.L.intensity = 25; setTimeout(() => { d.M.fl.visible = false; d.M.L.intensity = 0; }, 30);
  const camD = o.distanceTo(E.cam.position); sfx.mg && sfx.mg(camD); if (d.shots % 3 === 0 && !d.g.flame) tracer(start, dir, h ? h.toi : 80);
  DEF.spots.push({ x: d.pos.x, z: d.pos.z, t: 3 }); if (DEF.spots.length > 40) DEF.spots.shift();
  if (d.g.rocket){
    // pansarvärnsrobot: flyger till första träffen och spränger – spränger hål i väggar
    const to = h ? new THREE.Vector3(h.point.x, h.point.y, h.point.z) : start.clone().addScaledVector(dir, d.g.range), m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .5, 6).rotateX(Math.PI/2), ROCKM || (ROCKM = new THREE.MeshBasicMaterial({ color: 0xffb070 })));
    m.position.copy(start); m.lookAt(to); E.scene.add(m); const T0 = Math.max(.15, to.distanceTo(start)/120);
    DEF.shells.push({ m, from: start.clone(), to, t: T0, T: T0, r: d.g.splash, dmg: 650, k: 1, n: h ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : null, breach: !!(h && h.owner && h.owner.b), by: d.g.name, side: d.it && d.it.side });
    return;
  }
  if (d.g.splash && h){ const hp = new THREE.Vector3(h.point.x, h.point.y, h.point.z); setTimeout(() => { if (DEF.on){ PL.nextCause = d.g.name; explode(hp, d.g.splash, 120, .3, null, false, true, d.it && d.it.side); } }, Math.min(400, dist*4)); }
  if (!h) return; const p = h.point, n = h.normal;
  if (h.owner && h.owner.player){ PL.hp -= d.g.dmg; PL.dmgT = .8; PL.hurtFrom = { x: d.pos.x, z: d.pos.z, t: 1.2 }; PL.lastHit = { by: d.g.name, x: d.pos.x, z: d.pos.z }; PL.shake = Math.max(PL.shake || 0, .15); return; }
  if (t.onHit && t.col && h.col.handle === t.col.handle){ t.onHit(d.g.dmg, d); return; }
  if (h.owner && h.owner.b){ const c = h.owner; c.b.hit(c, d.g.dmg*1.2, o); if (c.t === 'glass') return; fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 3, null); if (c.alive) fx.decal('hole', p, n, .08 + Math.random()*.04); }
  else { fx.dust(p.x, p.y, p.z, .3, 1); fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 2, '#5a5040'); }
}
export function defReset(){ for (const t of DEF.tracers) E.scene.remove(t.m); DEF.tracers.length = 0; for (const sh of DEF.shells) if (sh.m) E.scene.remove(sh.m); DEF.shells.length = 0; DEF.alarm = 0; DEF.list.length = 0; DEF.spots.length = 0; DEF.on = false; }
