// FÖRSVAR i basen: kulsprutor (MG-näste, vakttorn) med siktsektor, målprioritet och eldläge, minor och taggtråd.
// Allt är mål: kulor och sprängämnen förstör dem. Tornets kulspruta faller när taket under den är borta.
import * as THREE from 'three';
import { E } from './engine.js';
import { R, PH, own, ray } from './physics.js';
import { fx } from './fx.js';
import { sfx } from './audio.js';
import { PL, TARGETS, explode } from './player.js';
import { DS } from './destruct.js';
import { T, hAt } from './terrain.js';

export const DEF = { list: [], on: false, spots: [], tracers: [] };
export const SECTORS = [90, 120, 180, 360], PRIOS = { nar: 'NÄRMAST', svag: 'SVAGAST', forst: 'FÖRST SEDD' }, MODES = { fri: 'FRI ELD', svar: 'BESVARA ELD', hall: 'HÅLL ELD' };
// vapendata per försvarstyp
export const GUNS = {
  mg:    { name: 'MG-NÄSTE', range: 55, rpm: 620, dmg: 9, spread: .011, hp: 260, turn: 2.6, burst: [7, 12], pause: .55, react: .55, h: 1.15 },
  tower: { name: 'VAKTTORN', range: 75, rpm: 520, dmg: 10, spread: .009, hp: 220, turn: 2.0, burst: [5, 9], pause: .7, react: .7, h: .9, top: true },
};
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const wrap = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };

// kulspruta på trefot med skyddsplåt och ammunitionslåda (byggd i bitar så att den kan vridas)
let GM = null;
function gunMats(){ return GM || (GM = { metal: new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: .45, metalness: .85 }), olive: new THREE.MeshStandardMaterial({ color: 0x4a4d38, roughness: .7, metalness: .2 }), dark: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: .5, metalness: .7 }), flash: new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: .95 }) }); }
function gunModel(shield){
  const M = gunMats(), root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(); root.add(yaw); yaw.add(pitch);
  const m = (g, mat, x, y, z, p) => { const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; (p || pitch).add(o); return o; };
  for (let i = 0; i < 3; i++){ const a = i/3*6.283 + .5, l = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 1.1, 6), M.olive); l.position.set(Math.sin(a)*.32, -.55, Math.cos(a)*.32); l.rotation.set(Math.cos(a)*.55, 0, -Math.sin(a)*.55); l.castShadow = true; root.add(l); }
  m(new THREE.CylinderGeometry(.04, .05, .25, 8), M.metal, 0, -.12, 0, yaw);
  m(new THREE.BoxGeometry(.12, .14, .5), M.metal, 0, 0, -.05); m(new THREE.CylinderGeometry(.026, .026, .8, 10).rotateX(Math.PI/2), M.dark, 0, .02, .58);
  m(new THREE.CylinderGeometry(.045, .045, .38, 10).rotateX(Math.PI/2), M.dark, 0, .02, .34); m(new THREE.CylinderGeometry(.03, .036, .09, 8).rotateX(Math.PI/2), M.dark, 0, .02, 1.0);
  m(new THREE.BoxGeometry(.04, .2, .16), M.olive, -.05, -.06, -.36); m(new THREE.BoxGeometry(.2, .16, .26), M.olive, .17, -.06, -.02);
  for (const s of [-1, 1]) m(new THREE.CylinderGeometry(.012, .012, .25, 5), M.metal, s*.1, -.13, .62).rotation.z = s*.3;
  if (shield){ const sh = m(new THREE.BoxGeometry(.85, .55, .03), M.olive, 0, .08, .32); const cut = m(new THREE.BoxGeometry(.18, .12, .04), M.dark, 0, .06, .336); cut.scale.set(1, 1, 1); }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(.09, .35, 8, 1, true).rotateX(-Math.PI/2), M.flash); fl.position.set(0, .02, 1.2); fl.visible = false; pitch.add(fl);
  const L = new THREE.PointLight(0xffb060, 0, 9, 2); fl.add(L);
  return { root, yaw, pitch, fl, L };
}
function sectorFan(it, g){
  const r = g.range, a = (it.sec || 360)*Math.PI/180, geo = new THREE.CircleGeometry(r, 48, Math.PI/2 - a/2, a); geo.rotateX(-Math.PI/2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff8060, transparent: true, opacity: .45 })); m.add(edge); m.renderOrder = 3; return m;
}

// skapa försvarets föremål för en placerad sak (används både i byggaren och i spelet)
export function defMake(it, spec, b){
  if (it.t === 'mg' || it.t === 'tower'){
    const g = GUNS[it.t], top = g.top ? spec.floors*spec.fh*spec.c : 0, M = gunModel(it.t === 'mg');
    const p = new THREE.Vector3(it.x, it.y + top + g.h, it.z); M.root.position.copy(p); E.scene.add(M.root);
    it.dir = it.dir ?? 0; it.sec = it.sec ?? (it.t === 'tower' ? 360 : 120); it.pri = it.pri || 'nar'; it.mode = it.mode || 'fri';
    const d = { it, g, b, kind: 'gun', M, pos: p, hp: g.hp, alive: true, yaw: it.dir*Math.PI/180, pitch: 0, cool: 0, shots: 0, seen: 0, tgt: null, los: 0, losT: 0, firstSeen: new Map(), shotAt: 0 };
    M.yaw.rotation.y = d.yaw; d.fan = sectorFan(it, g); d.fan.position.set(it.x, (it.y || 0) + .12 + top, it.z); d.fan.rotation.y = d.yaw; d.fan.visible = false; E.scene.add(d.fan);
    d.target = { alive: true, pos: p, hit: (dmg, from) => hurt(d, dmg, from) }; TARGETS.push(d.target);
    DEF.list.push(d); return d;
  }
  if (it.t === 'mine'){
    const M = gunMats(), m = new THREE.Mesh(new THREE.CylinderGeometry(.16, .18, .07, 12), M.olive); m.position.set(it.x, hAt(it.x, it.z) + .02, it.z); m.castShadow = true; E.scene.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .03, 8), M.dark); cap.position.y = .045; m.add(cap);
    const d = { it, kind: 'mine', m, pos: m.position, alive: true, arm: 0 }; d.target = { alive: true, pos: m.position, hit: () => mineBoom(d) }; TARGETS.push(d.target); DEF.list.push(d); return d;
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
function mineBoom(d){ if (!d.alive) return; d.alive = false; d.target.alive = false; E.scene.remove(d.m); explode(d.pos.clone().setY(d.pos.y + .1), 2.4, 700, 1); DEF.onKill && DEF.onKill(d); }
function wireCut(d){ if (!d.alive) return; d.alive = false; d.target.alive = false; d.m.rotation.z = .3; d.m.scale.y = .35; d.m.position.y -= .1; fx.sparks(d.pos.x, d.pos.y + .4, d.pos.z, 0, 1, 0, 8); }

// mål för försvaret: spelaren (fas D: även AI-anfallare via DEF.extra())
function targets(){
  const L = []; if (PL.on && PL.body && PL.hp > 0){ const t = PL.body.translation(); L.push({ id: 'pl', x: t.x, y: t.y + .45 - .35*PL.crouch, z: t.z, hp: PL.hp, v: PL.speed || 0, crouch: PL.crouch, col: PL.col, pl: true }); }
  if (DEF.extra) L.push(...DEF.extra()); return L;
}
// spårljus: korta ljusa streck som flyger mot målet
let TRG = null, TRM = null;
function tracer(o, dir, len){
  TRG = TRG || new THREE.CylinderGeometry(.018, .018, 1, 4).rotateX(Math.PI/2).translate(0, 0, .5); TRM = TRM || new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(TRG, TRM); m.position.copy(o); m.lookAt(_v.copy(o).add(dir)); m.scale.set(1, 1, 3.5); E.scene.add(m); DEF.tracers.push({ m, dir: dir.clone(), left: len, sp: 320 });
}
export function updateDefense(dt){
  // spårljus
  for (let i = DEF.tracers.length - 1; i >= 0; i--){ const t = DEF.tracers[i], s = Math.min(t.left, t.sp*dt); t.m.position.addScaledVector(t.dir, s); t.left -= s; if (t.left <= 0){ E.scene.remove(t.m); DEF.tracers.splice(i, 1); } }
  for (let i = DEF.spots.length - 1; i >= 0; i--) if ((DEF.spots[i].t -= dt) <= 0) DEF.spots.splice(i, 1);
  if (!DEF.on) return;
  // spelaren: taggtråd och vatten bromsar
  PL.slowK = 1;
  if (PL.on && PL.body){ const p = PL.body.translation();
    if (p.y - .9 < T.sea - .35) PL.slowK = .55;
    for (const d of DEF.list){
      if (d.kind === 'wire' && d.alive && Math.abs(p.x - d.pos.x) < d.w/2 + .2 && Math.abs(p.z - d.pos.z) < d.d/2 + .3 && p.y - .9 < d.pos.y + .9){ PL.slowK = Math.min(PL.slowK, .28); PL.hp -= 8*dt; PL.dmgT = .3; if (Math.random() < dt*3) sfx.click(); }
      if (d.kind === 'mine' && d.alive){ d.arm += dt; if (d.arm > .5 && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 1.1 && p.y - .9 < d.pos.y + .6){ sfx.click(); mineBoom(d); } }
    } }
  const TG = targets();
  for (const d of DEF.list){
    if (d.kind !== 'gun') continue;
    if (d.falling){ const F = d.falling; F.v += 9.8*dt; d.M.root.position.y = Math.max(F.y0, d.M.root.position.y - F.v*dt); d.M.root.rotation.x += dt*1.5; if (d.M.root.position.y <= F.y0){ d.falling = null; fx.dust(d.pos.x, F.y0, d.pos.z, 1.5, 6); } continue; }
    if (!d.alive) continue;
    // tornets tak borta eller tornet rasar → kulsprutan faller
    if (d.g.top && d.b && ((d.chk = (d.chk || 0) - dt) <= 0)){ d.chk = .3; const B = d.b, ok = B.cells.some(c => c.alive && c.j === B.NY - 1 && Math.abs(c.i + .5 - B.NX/2) < 2.5 && Math.abs(c.k + .5 - B.NZ/2) < 2.5); if (!ok || DS.falls.some(f => f.b === B) || B.collapsed > 0){ gunDie(d, true); continue; } }
    d.shotAt = Math.max(0, d.shotAt - dt); d.cool = Math.max(0, d.cool - dt);
    const it = d.it, half = (it.sec || 360)*Math.PI/360, dir0 = it.dir*Math.PI/180;
    // välj mål: inom räckvidd och sektor, med fri sikt (kontrolleras några gånger i sekunden)
    d.losT -= dt; if (d.losT <= 0){ d.losT = .15 + Math.random()*.1; let best = null, bs = 1e9;
      const fireOk = it.mode === 'fri' || (it.mode === 'svar' && d.shotAt > 0);
      if (fireOk) for (const t of TG){ const dx = t.x - d.pos.x, dz = t.z - d.pos.z, dist = Math.hypot(dx, dz, t.y - d.pos.y); if (dist > d.g.range) continue;
        if (half < Math.PI - .01 && Math.abs(wrap(Math.atan2(dx, dz) - dir0)) > half) continue;
        _v.copy(d.pos).setY(d.pos.y + .05); _d.set(t.x - _v.x, t.y + .3 - _v.y, t.z - _v.z); const L = _d.length(); _d.multiplyScalar(1/L);
        _v.addScaledVector(_d, .7); const h = ray(_v, _d, L, d.col); if (!h || !((t.pl && h.owner && h.owner.player === true) || (!t.pl && t.col && h.col.handle === t.col.handle))) continue;
        if (!d.firstSeen.has(t.id)) d.firstSeen.set(t.id, performance.now());
        const s = it.pri === 'svag' ? t.hp*10 + dist : it.pri === 'forst' ? d.firstSeen.get(t.id) : dist; if (s < bs){ bs = s; best = t; } }
      if (best && (!d.tgt || d.tgt.id !== best.id)) d.seen = 0; d.tgt = best; }
    const t = d.tgt; if (!t){ d.seen = 0; d.M.yaw.rotation.y += wrap(dir0 + Math.sin(E.time*.4 + d.pos.x)*Math.min(half, .6) - d.M.yaw.rotation.y)*Math.min(1, dt*.8); continue; }
    // vrid mot målet och skjut skurar efter reaktionstiden
    const ty = Math.atan2(t.x - d.pos.x, t.z - d.pos.z), dy = wrap(ty - d.M.yaw.rotation.y), dist = Math.hypot(t.x - d.pos.x, t.z - d.pos.z), tp = Math.atan2(t.y - d.pos.y, dist);
    d.M.yaw.rotation.y += Math.sign(dy)*Math.min(Math.abs(dy), d.g.turn*dt); d.M.pitch.rotation.x += (-tp - d.M.pitch.rotation.x)*Math.min(1, dt*8);
    d.seen += dt; if (Math.abs(dy) > .06 || d.seen < d.g.react || d.cool > 0) { d.M.fl.visible = false; d.M.L.intensity = 0; continue; }
    d.cool = 60/d.g.rpm; d.shots++; if (d.shots >= (d.burstN || (d.burstN = d.g.burst[0] + Math.floor(Math.random()*(d.g.burst[1] - d.g.burst[0]))))){ d.shots = 0; d.burstN = 0; d.cool = d.g.pause*(.7 + Math.random()*.6); }
    shoot(d, t);
  }
}
function shoot(d, t){
  const o = _v.copy(d.pos).setY(d.pos.y + .05), dist = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
  const sp = d.g.spread*(1 + Math.min(2, t.v/3))*(t.crouch > .5 ? .8 : 1);
  const dir = new THREE.Vector3(t.x - o.x + (Math.random() - .5)*sp*dist*2, t.y + .25 - o.y + (Math.random() - .5)*sp*dist*2, t.z - o.z + (Math.random() - .5)*sp*dist*2).normalize();
  const start = o.clone().addScaledVector(dir, 1.25), h = ray(start, dir, d.g.range + 10, d.col);
  d.M.fl.visible = true; d.M.fl.rotation.z = Math.random()*6; d.M.L.intensity = 25; setTimeout(() => { d.M.fl.visible = false; d.M.L.intensity = 0; }, 30);
  const camD = o.distanceTo(E.cam.position); sfx.mg && sfx.mg(camD); if (d.shots % 3 === 0) tracer(start, dir, h ? h.toi : 80);
  DEF.spots.push({ x: d.pos.x, z: d.pos.z, t: 3 }); if (DEF.spots.length > 40) DEF.spots.shift();
  if (!h) return; const p = h.point, n = h.normal;
  if (h.owner && h.owner.player){ PL.hp -= d.g.dmg; PL.dmgT = .8; PL.hurtFrom = { x: d.pos.x, z: d.pos.z, t: 1.2 }; PL.shake = Math.max(PL.shake || 0, .15); return; }
  if (t.onHit && t.col && h.col.handle === t.col.handle){ t.onHit(d.g.dmg, d); return; }
  if (h.owner && h.owner.b){ const c = h.owner; c.b.hit(c, d.g.dmg*1.2, o); if (c.t === 'glass') return; fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 3, null); if (c.alive) fx.decal('hole', p, n, .08 + Math.random()*.04); }
  else { fx.dust(p.x, p.y, p.z, .3, 1); fx.chips(p.x, p.y, p.z, n.x, n.y, n.z, 2, '#5a5040'); }
}
export function defReset(){ for (const t of DEF.tracers) E.scene.remove(t.m); DEF.tracers.length = 0; DEF.list.length = 0; DEF.spots.length = 0; DEF.on = false; }
