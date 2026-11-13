// FÖRSTÖRELSE – byggnader av celler i ett rutnät (R6: hål där laddningar och kulor träffar)
// med bärighet per våning och sammanhang med marken (BF4: när bärande delar är borta rasar allt ovanför som fysikblock).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { E, pbr, triplanar } from './engine.js';
import { R, PH, own, removeCollider, addDyn } from './physics.js';
import { fx } from './fx.js';

// materialtyper: hp, utseende
export const MAT = {
  conc:  { hp: 320, chip: '#8e8a84' },
  brick: { hp: 240, chip: '#8a4a36' },
  soft:  { hp: 70,  chip: '#c8c2b8' },   // puts/gips – mjuka väggar som i R6
  slab:  { hp: 420, chip: '#8e8a84' },
  col:   { hp: 700, chip: '#7e7a74' },   // armerade pelare
  glass: { hp: 6,   chip: '#cfe6f0' },
  frame: { hp: 320, chip: '#3a4048' },   // fasadram i glastorn (mörk metall)
  gate:  { hp: 300, chip: '#4a5048' },   // stålport i murar
  sand:  { hp: 150, chip: '#a08a62' },   // sandsäckar
};
let MATS = null;
// sandsäckar: rader av rundade säckar målade i canvas (färg + normal), världsrums-texturerade
function sandMat(){
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), n = document.createElement('canvas'); n.width = n.height = 256; const y = n.getContext('2d');
  x.fillStyle = '#6e6046'; x.fillRect(0, 0, 256, 256); y.fillStyle = 'rgb(128,128,255)'; y.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) for (let i = -1; i < 3; i++){ const cx = i*128 + (r % 2)*64 + 64, cy = r*64 + 32;
    const g = x.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 70); const v = 150 + Math.random()*30; g.addColorStop(0, `rgb(${v},${v*.86|0},${v*.62|0})`); g.addColorStop(1, `rgb(${v*.55|0},${v*.47|0},${v*.33|0})`);
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 62, 29, 0, 0, 7); x.fill();
    for (let k = 0; k < 40; k++){ x.strokeStyle = 'rgba(60,50,30,.18)'; x.beginPath(); const sx = cx - 55 + Math.random()*110, sy = cy - 22 + Math.random()*44; x.moveTo(sx, sy); x.lineTo(sx + 6, sy + (Math.random() - .5)*3); x.stroke(); }
    const gn = y.createRadialGradient(cx, cy, 2, cx, cy, 64); gn.addColorStop(0, 'rgb(128,128,255)'); gn.addColorStop(1, 'rgb(128,60,200)'); y.fillStyle = gn; y.beginPath(); y.ellipse(cx, cy, 62, 29, 0, 0, 7); y.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; const tn = new THREE.CanvasTexture(n); tn.wrapS = tn.wrapT = THREE.RepeatWrapping;
  const rt = new THREE.CanvasTexture(c); rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
  return triplanar(new THREE.MeshStandardMaterial({ map: t, normalMap: tn, roughness: .95, roughnessMap: rt }), 1.4);
}
function mats(){
  if (MATS) return MATS;
  MATS = {
    conc: pbr('concrete_wall_004', { tri: 3 }),
    brick: pbr('red_brick_03', { tri: 2.2 }),
    soft: pbr('plaster_grey_04', { tri: 2.5, color: 0xa49c90 }),
    slab: pbr('concrete_floor_worn_001', { tri: 3 }),
    col: pbr('concrete_floor_worn_001', { tri: 2.5, color: 0xb0aca6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x7e90a2, roughness: .04, metalness: .92, transparent: true, opacity: .9, envMapIntensity: 1.9 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x252b33, roughness: .32, metalness: .85, envMapIntensity: 1.3 }),
    gate: pbr('metal_plate', { tri: 1.5, metal: .8, color: 0x7a8274 }),
    sand: sandMat(),
  };
  return MATS;
}
export const DS = { list: [], debris: 0, maxDebris: E.hq ? 160 : 60, sections: [], sinks: [], falls: [] };
const box = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0), v3 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s3 = new THREE.Vector3();

// spec: { x, z, w, d, floors, fh (våningshöjd i celler), c (cellstorlek m), wall: 'conc'|'brick'|'soft', win: true, inner: true, rot }
export class Building {
  constructor(s){
    this.s = Object.assign({ c: .5, fh: 6, floors: 2, wall: 'brick', win: true, inner: true, cols: 8, y: 0 }, s);
    const S = this.s, c = S.c; this.NX = Math.round(S.w/c); this.NZ = Math.round(S.d/c); this.NY = S.floors*S.fh + 1;
    this.cells = []; this.grid = new Map(); this.dirty = false; this.collapsed = 0;
    this.origin = new THREE.Vector3(S.x - S.w/2, S.y, S.z - S.d/2);
    this.build();
  }
  key(i, j, k){ return i + j*4096 + k*64; }
  key3(i, j, k){ return (j*this.NZ + k)*this.NX + i; }
  add(i, j, k, t, axis){ const cell = { b: this, i, j, k, t, hp: MAT[t].hp, alive: true, axis }; this.cells.push(cell); this.grid.set(this.key3(i, j, k), cell); }
  build(){
    const S = this.s, NX = this.NX, NZ = this.NZ, L = S.fh;
    const doorI = Math.floor(NX/2) - 1, doorK = Math.floor(NZ/2) - 1;
    for (let j = 1; j < this.NY; j++){
      const f = Math.floor(j/L), lj = j % L, slab = lj === 0;
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++){
        const edgeX = i === 0 || i === NX - 1, edgeZ = k === 0 || k === NZ - 1, edge = edgeX || edgeZ;
        if (slab){ if (edge || !S.open) this.add(i, j, k, edge ? S.wall : 'slab'); continue; }
        // plattform på pelare: bara 1×1 m pelare i hörnen och var fjärde meter längs kanten, fritt under taket
        if (S.stilts){ const pi = i < 2 || i >= NX - 2 || (i % 8 < 2 && i > 1 && i < NX - 2), pk = k < 2 || k >= NZ - 2 || (k % 8 < 2 && k > 1 && k < NZ - 2); if (pi && pk && (edge || (i % 8 < 2 && k % 8 < 2))) this.add(i, j, k, 'col'); continue; }
        if (edge){
          const corner = edgeX && edgeZ, u = edgeX ? k : i, n = edgeX ? NZ : NX;
          // dörr på bottenvåningen mitt på framsidan (k = 0) och baksidan
          if (S.door !== false && f === 0 && edgeZ && i >= doorI && i < doorI + 2 && lj <= Math.round(L*.7)) continue;
          if (S.gate && Math.abs(i + .5 - NX/2) < S.gate/(2*S.c) && lj <= Math.round(L*.75)){ this.add(i, j, k, 'gate'); continue; }
          const winRow = S.curtain ? lj >= 1 : lj >= Math.round(L*.3) && lj <= Math.round(L*.75), winCol = S.curtain ? !corner && u % 4 !== 0 : !corner && u > 1 && u < n - 2 && (u % 4 === 1 || u % 4 === 2);
          if (S.win && winRow && winCol) this.add(i, j, k, 'glass', edgeX ? 'x' : 'z');
          else this.add(i, j, k, S.wall);
          continue;
        }
        // pelare inne i huset
        if (S.cols && i % S.cols === 0 && k % S.cols === 0 && i > 1 && k > 1 && i < NX - 2 && k < NZ - 2){ this.add(i, j, k, 'col'); continue; }
        // innervägg av puts (R6: mjuk vägg) längs mitten, med dörröppning
        if (S.inner && i === Math.floor(NX/2) && !(k >= doorK && k < doorK + 2 && lj <= Math.round(L*.7))) this.add(i, j, k, 'soft');
      }
    }
    // rendering: en instansad mesh per materialtyp
    const M = mats(), by = {}; for (const c of this.cells) (by[c.t] = by[c.t] || []).push(c);
    this.meshes = {};
    for (const t in by){
      const list = by[t], o = new THREE.InstancedMesh(box, M[t], list.length); o.castShadow = t !== 'glass'; o.receiveShadow = true;
      list.forEach((c, n) => { c.n = n; c.mesh = o; this.place(c); });
      o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere(); E.scene.add(o); this.meshes[t] = o;
    }
    // kolliderare: en lådform per cell på en fast kropp
    this.body = PH.world.createRigidBody(R.RigidBodyDesc.fixed());
    const h = S.c/2;
    for (const c of this.cells){
      const p = this.pos(c), g = c.t === 'glass' ? (c.axis === 'x' ? [h*.15, h, h] : [h, h, h*.15]) : [h, h, h];
      c.col = own(PH.world.createCollider(R.ColliderDesc.cuboid(...g).setTranslation(p.x, p.y, p.z), this.body), c);
    }
    this.total = {}; for (const c of this.cells) this.total[this.floorOf(c)] = (this.total[this.floorOf(c)] || 0) + (this.bearing(c) ? 1 : 0);
  }
  // STAPLING: byggnaden står på taket av andra byggnader. Den är förankrad bara där taket under finns kvar,
  // så när underliggande byggnad sprängs eller rasar faller allt som står ovanpå.
  setSupport(list){
    if (this.on) for (const B of this.on) if (B.deps){ const i = B.deps.indexOf(this); if (i >= 0) B.deps.splice(i, 1); }
    this.on = list && list.length ? list.slice() : null;
    if (this.on) for (const B of this.on) (B.deps || (B.deps = [])).push(this);
    this.dirty = true;
  }
  // står cellen (i bottenlagret) på ett tak som finns kvar?
  grounded(c){
    if (!this.on) return true;
    const p = this.pos(c, v3), px = p.x, pz = p.z;
    for (const B of this.on){
      const s = B.s.c, i = Math.floor((px - B.origin.x)/s), k = Math.floor((pz - B.origin.z)/s), top = B.at(i, B.NY - 1, k);
      if (top && top.alive && !DS.falls.some(f => f.b === B)) return true;
    }
    return false;
  }
  // ta bort hela byggnaden (basbyggaren: riv)
  dispose(){
    this.setSupport(null); if (this.deps){ for (const d of this.deps.slice()) d.setSupport((d.on || []).filter(B => B !== this)); this.deps = null; }
    for (const t in this.meshes) E.scene.remove(this.meshes[t]); if (this.sign) E.scene.remove(this.sign);
    for (const c of this.cells){ if (c.col) PH.owner.delete(c.col.handle); if (c.bits) for (const m of c.bits) E.scene.remove(m); }
    PH.world.removeRigidBody(this.body); const i = DS.list.indexOf(this); if (i >= 0) DS.list.splice(i, 1);
  }
  pos(c, out){ const s = this.s.c; return (out || new THREE.Vector3()).set(this.origin.x + (c.i + .5)*s, this.origin.y + (c.j - .5)*s, this.origin.z + (c.k + .5)*s); }
  place(c){
    const s = this.s.c; this.pos(c, v3);
    if (c.t === 'glass') s3.set(c.axis === 'x' ? s*.12 : s, s, c.axis === 'z' ? s*.12 : s); else s3.set(s*1.002, s*1.002, s*1.002);
    m4.compose(v3, q0, s3); c.mesh.setMatrixAt(c.n, m4);
  }
  floorOf(c){ return Math.floor((c.j - 1)/this.s.fh); }
  // bärande celler: i höghus bara pelarna (BF4: spräng pelarna så rasar tornet), annars ytterväggar och pelare
  bearing(c){ if (!c.alive || (c.j % this.s.fh) !== 1) return false; return this.s.keyCols ? c.t === 'col' : c.t !== 'glass' && c.t !== 'slab' && c.t !== 'soft'; }
  at(i, j, k){ if (i < 0 || k < 0 || i >= this.NX || k >= this.NZ || j < 1 || j >= this.NY) return null; return this.grid.get(this.key3(i, j, k)) || null; }
  // celler inom radie r runt punkten p
  // som near(), men hålet blir högre än brett och oregelbundet i kanten (R6-sprängladdning)
  nearBreach(p, r){ return this.near(p, r*1.35).map(([c, d]) => { const q = this.pos(c, v3), dy = (q.y - p.y)/1.3, dh = Math.hypot(q.x - p.x, q.z - p.z), e = Math.hypot(dh, dy)*(.85 + Math.random()*.3); return [c, e]; }).filter(([c, e]) => e <= r); }
  near(p, r){
    const s = this.s.c, o = this.origin, out = [], ri = Math.ceil(r/s);
    const ci = Math.floor((p.x - o.x)/s), cj = Math.floor((p.y - o.y)/s) + 1, ck = Math.floor((p.z - o.z)/s);
    for (let j = cj - ri; j <= cj + ri; j++) for (let k = ck - ri; k <= ck + ri; k++) for (let i = ci - ri; i <= ci + ri; i++){
      const c = this.at(i, j, k); if (!c || !c.alive) continue; const q = this.pos(c, v3); const d = q.distanceTo(p); if (d <= r) out.push([c, d]);
    }
    return out;
  }
  kill(c, from, quiet){
    if (!c.alive) return; c.alive = false; if (c.bits){ for (const m of c.bits) E.scene.remove(m); c.bits = null; } c.mesh.setMatrixAt(c.n, zero); c.mesh.instanceMatrix.needsUpdate = true; removeCollider(c.col); c.col = null; this.dirty = true;
    if (this.deps) for (const d of this.deps) d.dirty = true;
    if (quiet) return;
    const p = this.pos(c), s = this.s.c;
    if (c.t === 'glass'){ const nx = c.axis === 'x' ? Math.sign(p.x - (from ? from.x : p.x - 1)) || 1 : 0, nz = c.axis === 'z' ? Math.sign(p.z - (from ? from.z : p.z - 1)) || 1 : 0; fx.glass(p.x, p.y, p.z, nx, nz, 10); return; }
    fx.dust(p.x, p.y, p.z, s*2, 2); fx.chips(p.x, p.y, p.z, 0, 1, 0, 4, MAT[c.t].chip);
    // en del celler blir fysikskräp som ramlar ner
    if (DS.debris < DS.maxDebris && Math.random() < .35) spawnDebris(p, s*(.4 + Math.random()*.35), MATS[c.t], from);
    fx.clearDecals(p.x, p.y, p.z, s*.8);
  }
  hit(c, dmg, from){
    if (!c.alive) return; c.hp -= dmg; if (c.hp <= 0) return this.kill(c, from);
    // skadad cell: krymper och förskjuts lite – ojämna hålkanter i stället för raka rutor
    if (!c.dmg && c.t !== 'glass' && c.hp < MAT[c.t].hp*.6){
      c.dmg = true; const s = this.s.c*(.62 + Math.random()*.25); this.pos(c, v3); v3.x += (Math.random() - .5)*this.s.c*.2; v3.y += (Math.random() - .5)*this.s.c*.2; v3.z += (Math.random() - .5)*this.s.c*.2;
      s3.set(s, s, s); m4.compose(v3, q0, s3); c.mesh.setMatrixAt(c.n, m4); c.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // bärighet och sammanhang – körs efter förstörelse
  integrity(){
    if (!this.dirty) return; this.dirty = false;
    const L = this.s.fh, floors = this.s.floors, alive = {};
    for (const c of this.cells) if (this.bearing(c)) alive[this.floorOf(c)] = (alive[this.floorOf(c)] || 0) + 1;
    let fall = new Set(), from = -1;
    const lim = this.s.keyCols ? .5 : .32;
    for (let f = 0; f < floors; f++){ if (!this.total[f]) continue; const r = (alive[f] || 0)/this.total[f]; if (r < lim){ from = f; break; } }
    if (from >= 0) for (const c of this.cells) if (c.alive && c.j >= from*L + 1) fall.add(c);
    // sammanhang: flodfyllning från cellerna som står på marken
    const seen = new Set(), st = [];
    for (const c of this.cells) if (c.alive && c.j === 1 && !fall.has(c) && this.grounded(c)){ seen.add(c); st.push(c); }
    while (st.length){ const c = st.pop(); for (const [di, dj, dk] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){ const n = this.at(c.i + di, c.j + dj, c.k + dk); if (n && n.alive && !seen.has(n) && !fall.has(n)){ seen.add(n); st.push(n); } } }
    for (const c of this.cells) if (c.alive && !seen.has(c)) fall.add(c);
    if (fall.size) this.collapse([...fall]);
  }
  collapse(list){
    const S = this.s, s = S.c, big = list.length > 200, center = new THREE.Vector3(S.x, S.y, S.z);
    const minJ = Math.min(...list.map(c => c.j)), baseY = this.origin.y + (minJ - 1)*s;
    if (big) return this.bigCollapse(list, minJ, baseY);
    const gx = s >= 1 ? 3 : 4, groups = new Map();
    for (const c of list){ if (c.t === 'glass'){ this.kill(c); continue; } const k = Math.floor(c.i/gx) + ',' + Math.floor(c.j/gx) + ',' + Math.floor(c.k/gx); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    for (const g of groups.values()){
      const cells = g.map(c => ({ t: c.t, p: this.pos(c) })); for (const c of g) this.kill(c, null, true);
      const mid = cells.reduce((a, c) => a.add(c.p), new THREE.Vector3()).multiplyScalar(1/cells.length);
      const out = mid.clone().sub(center).setY(0).normalize().multiplyScalar(.6 + Math.random()*1.2);
      makeChunk(cells, mid, new THREE.Quaternion(), out.setY(-Math.random()*1.5), new THREE.Vector3((Math.random() - .5)*.8, (Math.random() - .5)*.4, (Math.random() - .5)*.8), s);
    }
    this.collapsed += list.length; fx.dust(S.x, S.y + 2, S.z, 3, 12);
  }
  // BF4-ras: tornet delas i 8–14 våningsskivor som hänger ihop i en kedja (inga glapp). Det knäcks på 2–3 ställen,
  // varje skiva lutar och vrids lite, kedjan sjunker ner i dammet och toppen bryts loss och faller fritt.
  bigCollapse(list, minJ, baseY){
    const S = this.s, s = S.c, ang = Math.random()*6.283, dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), axis = new THREE.Vector3(dir.z, 0, -dir.x);
    const maxJ = Math.max(...list.map(c => c.j)), span = maxJ - minJ + 1, N = Math.max(8, Math.min(14, Math.round(span/(S.fh*2)))), per = Math.ceil(span/N);
    E.r.localClippingEnabled = true;
    const R0 = Math.max(S.w, S.d)*.45, edge = new THREE.Vector3(S.x, 0, S.z).addScaledVector(dir, R0);
    const kinks = new Set([Math.round(N*(.25 + Math.random()*.1)), Math.round(N*(.55 + Math.random()*.1)), Math.random() < .6 ? Math.round(N*.8) : -1]);
    const slices = [], STUMP = 2, stumpTop = this.origin.y + (minJ - 1 + STUMP*per)*s;
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(stumpTop - .2));
    for (let k = 0; k < N; k++){
      const j0 = minJ + k*per, j1 = j0 + per; let cells = list.filter(c => c.j >= j0 && c.j < j1); if (!cells.length) continue;
      if (k < STUMP && k === STUMP - 1){ const keep = cells.filter(c => c.j < j1 - 2 || Math.random() < .45), gone = cells.filter(c => !keep.includes(c)); for (const c of gone) this.kill(c, null, true); cells = keep; }
      const by0 = this.origin.y + (j0 - 1)*s, o = new THREE.Vector3(edge.x, by0, edge.z), grp = new THREE.Group(), by = {};
      for (const c of cells) (by[c.t] = by[c.t] || []).push(c);
      for (const t in by){
        const geos = by[t].map(c => { const p = this.pos(c).sub(o), g = box.clone(); if (t === 'glass') g.scale(c.axis === 'x' ? s*.12 : s, s, c.axis === 'z' ? s*.12 : s); else g.scale(s, s, s); return g.translate(p.x, p.y, p.z); });
        const m = MATS[t].clone(); if (k >= STUMP) m.clippingPlanes = [ground]; if (MATS[t].onBeforeCompile){ m.onBeforeCompile = MATS[t].onBeforeCompile; m.customProgramCacheKey = MATS[t].customProgramCacheKey; }
        const mesh = new THREE.Mesh(mergeGeometries(geos), m); geos.forEach(g => g.dispose()); mesh.castShadow = t !== 'glass'; mesh.receiveShadow = true; grp.add(mesh);
      }
      if (k < STUMP){ for (const c of cells) this.kill(c, null, true); grp.position.copy(o); E.scene.add(grp); this.stump = (this.stump || []).concat(grp); PH.world.createCollider(R.ColliderDesc.cuboid(S.w/2, per*s/2, S.d/2).setTranslation(S.x, by0 + per*s/2, S.z), PH.ground); continue; }
      // bjälklag syns i brottytan: en mörk platta i skivans botten
      const slab = new THREE.Mesh(box, MATS.slab || MATS.conc); slab.scale.set(S.w*.96, .35, S.d*.96); slab.position.set(S.x - o.x, .2, S.z - o.z); grp.add(slab);
      for (const c of cells) this.kill(c, null, true);
      E.scene.add(grp);
      if (this.sign && this.sign.parent === E.scene){ const sy = this.sign.position.y; if (sy >= by0 && sy < by0 + per*s){ E.scene.remove(this.sign); this.sign.position.sub(o); grp.add(this.sign); } }
      const kink = kinks.has(k);
      slices.push({ grp, h: per*s, a: 0, aT: kink ? .16 + Math.random()*.12 : .015 + Math.random()*.025, b: 0, bT: (Math.random() - .5)*(kink ? .14 : .04), delay: k*.12 + (kink ? .3 : 0), free: null });
    }
    // de översta skivorna ovanför sista knäcken bryts loss efter några sekunder
    const lastKink = Math.max(...[...kinks].filter(k => k >= 0)), brk = Math.max(lastKink, N - 3); for (const sl of slices) sl.delay = Math.max(0, sl.delay*1.6);
    DS.falls.push({ chain: true, slices, edge, base: this.origin.y, baseY: stumpTop, axis, dir, t: 0, v: 0, y: 0, brk: brk - STUMP, brkT: 5 + Math.random()*1.5, sign: this.sign, b: this, S, h: span*s, dt0: 0 });
    this.collapsed += list.length;
    fx.dustWall(S.x, this.origin.y, S.z, Math.max(S.w, S.d), Math.min(2, list.length/1500 + .5)); E.fogTarget = 1; DS.onCollapse && DS.onCollapse(this, list.length);
  }
}
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(1, 1, 1);
function updateChain(F, dt){
  F.t += dt;
  // kedjan sjunker med ökande fart (trycks ner i sin egen spillerhög)
  F.v = Math.min(4.6, F.v + (F.t < 2 ? .7 : 1.6)*dt); F.y += F.v*dt;
  _m.makeTranslation(F.edge.x, F.baseY - F.y, F.edge.z);
  let k = 0;
  for (const sl of F.slices){
    if (sl.free){ // fritt fall: tyngdkraft och rotation
      const f = sl.free; f.v.y -= 9.8*dt; f.p.addScaledVector(f.v, dt); _qa.setFromAxisAngle(f.ax, f.w*dt); f.q.premultiply(_qa); sl.grp.position.copy(f.p); sl.grp.quaternion.copy(f.q);
      if (f.p.y < F.base - 4 && !f.hit){ f.hit = true; fx.dustWall(f.p.x, F.base, f.p.z, 10, .5); }
      if (f.p.y < F.base - 30) sl.grp.visible = false;
      k++; continue; }
    const u = Math.max(0, Math.min(1, (F.t - sl.delay)/5)), e = u*u*(3 - 2*u);
    sl.a = sl.aT*e; sl.b = sl.bT*e;
    _qa.setFromAxisAngle(F.axis, sl.a); _qb.setFromAxisAngle(F.dir, sl.b); _qa.multiply(_qb);
    _m2.compose(_p.set(0, 0, 0), _qa, _sc); _m.multiply(_m2);
    sl.grp.matrixAutoUpdate = false; sl.grp.matrix.copy(_m); sl.grp.matrixWorldNeedsUpdate = true;
    // toppen bryts loss: fortsätter med kedjans rörelse och faller fritt
    if (k > F.brk && F.t > F.brkT){ sl.grp.matrixAutoUpdate = true; _m.decompose(sl.grp.position, sl.grp.quaternion, _p); sl.free = { p: sl.grp.position.clone(), q: sl.grp.quaternion.clone(), v: F.dir.clone().multiplyScalar(4 + Math.random()*3).setY(-F.v), ax: F.axis.clone(), w: .35 + Math.random()*.3 }; fx.dust(sl.free.p.x, sl.free.p.y, sl.free.p.z, 6, 10); }
    _m.multiply(_m2.makeTranslation(0, sl.h, 0));
    k++;
  }
  // LED-skylten flimrar och slocknar
  if (F.sign && F.sign.material){ const m = F.sign.material; m.emissiveIntensity = F.t < .4 ? 1.6 : F.t < 1.6 ? (Math.random() < .5 ? .1 : 1.4) : Math.max(0, m.emissiveIntensity - dt); }
  // fasadpaneler och glas lossnar längs fasaden medan tornet faller
  if (Math.random() < .7){ const S = F.S, side = Math.floor(Math.random()*4), u = (Math.random() - .5)*S.w, hy = F.base + 4 + Math.random()*Math.max(4, F.h - F.y);
    const gx = side < 2 ? S.x + (side ? 1 : -1)*S.w/2 : S.x + u, gz = side < 2 ? S.z + u : S.z + (side === 2 ? 1 : -1)*S.d/2; fx.glass(gx, hy, gz, side < 2 ? (side ? 1 : -1) : 0, side >= 2 ? (side === 2 ? 1 : -1) : 0, 3, true); }
  // mörk rök väller ut vid basen och stiger som en pelare (BF4)
  F.dt0 -= dt; if (F.dt0 <= 0){ F.dt0 = .08; const S = F.S, r = Math.max(S.w, S.d)*.6;
    for (let n = 0; n < 2; n++){ const a = Math.random()*6.283, d = r*Math.random(); fx.column(S.x + Math.cos(a)*d, F.base + 2 + Math.random()*8, S.z + Math.sin(a)*d, 1); }
    fx.dustWall(S.x, F.base, S.z, r*1.4, .12); if (F.t < 5) fx.dustFront(S.x, F.base, S.z, r, .5);
    if (DS.debris < DS.maxDebris){ const a = Math.random()*6.283; spawnDebris(new THREE.Vector3(S.x + Math.cos(a)*r, F.base + 1 + Math.random()*3, S.z + Math.sin(a)*r), .4 + Math.random()*.8, MATS.conc, new THREE.Vector3(S.x, F.base, S.z)); } }
  if (F.y > F.h + 8 || F.t > 22){ for (const sl of F.slices){ E.scene.remove(sl.grp); sl.grp.traverse(o => { if (o.isMesh && o.geometry !== box){ o.geometry.dispose(); if (!Object.values(MATS).includes(o.material)) o.material.dispose(); } }); } return true; }
  return false;
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function updateFalls(dt){
  for (let i = DS.falls.length - 1; i >= 0; i--){
    const F = DS.falls[i]; if (F.chain){ if (updateChain(F, dt)){ DS.falls.splice(i, 1); rubble(F.b); } continue; } F.t += dt; if (F.t < 0) continue;
    // sjunker med ökande fart och lutar mot fallriktningen
    F.v = Math.min(7.5, F.v + (F.t < 1.2 ? 1.2 : 2.8)*dt); F.y += F.v*dt; F.ang = Math.min(F.maxAng, F.ang + dt*(.1 + F.t*.09));
    // LED-skylten flimrar och slocknar
    if (F.sign && F.sign.material){ const m = F.sign.material; m.emissiveIntensity = F.t < .4 ? 1.6 : F.t < 1.6 ? (Math.random() < .5 ? .1 : 1.4) : Math.max(0, m.emissiveIntensity - dt); }
    // glaspaneler lossnar längs fasaden
    if (Math.random() < .6){ const S = F.S, side = Math.floor(Math.random()*4), u = (Math.random() - .5)*S.w, hy = F.base + 4 + Math.random()*Math.max(4, F.h - F.y); if (hy > F.base + 1){ const gx = side < 2 ? S.x + (side ? 1 : -1)*S.w/2 : S.x + u, gz = side < 2 ? S.z + u : S.z + (side === 2 ? 1 : -1)*S.d/2; fx.glass(gx + F.dir.x*F.ang*(hy - F.base), hy, gz + F.dir.z*F.ang*(hy - F.base), side < 2 ? (side ? 1 : -1) : 0, side >= 2 ? (side === 2 ? 1 : -1) : 0, 3, true); } }
    _q.setFromAxisAngle(F.axis, F.ang); F.grp.quaternion.copy(_q); F.grp.position.copy(F.pivot).setY(F.pivot.y - F.y);
    // damm och bitar där kroppen möter marken
    F.dt0 -= dt; if (F.dt0 <= 0){ F.dt0 = .09;
      const S = F.S, r = Math.max(S.w, S.d)*.55;
      for (let k = 0; k < 3; k++){ const a = Math.random()*6.283; _v.set(S.x + Math.cos(a)*r*Math.random(), F.base + .5, S.z + Math.sin(a)*r*Math.random()); fx.dust(_v.x, _v.y, _v.z, 4, 2); }
      fx.dustWall(S.x, F.base, S.z, r*1.4, .12); if (F.t < 4) fx.dustFront(S.x, F.base, S.z, r, .5);
      if (DS.debris < DS.maxDebris){ const a = Math.random()*6.283; spawnDebris(new THREE.Vector3(S.x + Math.cos(a)*r, F.base + 1 + Math.random()*3, S.z + Math.sin(a)*r), .4 + Math.random()*.8, MATS.conc, new THREE.Vector3(S.x, F.base, S.z)); }
    }
    if (F.y > F.h + 6 || F.t > 12){ E.scene.remove(F.grp); F.grp.traverse(o => { if (o.isMesh){ o.geometry.dispose(); o.material.dispose(); } }); DS.falls.splice(i, 1); if (!DS.falls.some(f => f.b === F.b)) rubble(F.b); }
  }
}
// spillror efter raset (BF4): en hög på 8–12 m av krossad betong, brutna bjälklag och armeringsjärn, rök som hänger kvar
let RUBM = null;
function rubble(b){
  const S = b.s, RR = Math.max(S.w, S.d)*.95, H = 4.5 + Math.random()*2, y0 = b.origin.y;
  // själva högen: en ojämn kon av betong (triplanar textur), går att klättra på
  const g = new THREE.ConeGeometry(RR, H, 28, 10, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 - (y + H/2)/H, n = .75 + Math.random()*.5; p.setXYZ(i, x*n, y + (Math.random() - .5)*H*.12*k, z*n); }
  g.computeVertexNormals(); RUBM = RUBM || (() => { const m = MATS.conc.clone(); m.color.set(0x8a8884); m.onBeforeCompile = MATS.conc.onBeforeCompile; m.customProgramCacheKey = MATS.conc.customProgramCacheKey; return m; })(); const mound = new THREE.Mesh(g, RUBM); mound.position.set(S.x, y0 + H/2 - .6, S.z); mound.castShadow = mound.receiveShadow = true; E.scene.add(mound);
  const verts = new Float32Array(p.count*3); for (let i = 0; i < p.count; i++){ verts[i*3] = p.getX(i) + S.x; verts[i*3 + 1] = p.getY(i) + y0 + H/2 - .6; verts[i*3 + 2] = p.getZ(i) + S.z; }
  const hull = R.ColliderDesc.convexHull(verts); if (hull) PH.world.createCollider(hull, PH.ground);
  const onMound = (d) => y0 - .6 + H*Math.max(0, 1 - d/RR);
  // brutna bjälklag som sticker ut i vinklar
  for (let i = 0; i < 26; i++){ const a = Math.random()*6.283, d = Math.random()*RR*.8, x = S.x + Math.cos(a)*d, z = S.z + Math.sin(a)*d, w = 3 + Math.random()*4, dd = 2 + Math.random()*4;
    const m = new THREE.Mesh(box, MATS.slab); m.scale.set(w, .35, dd); m.position.set(x, onMound(d) - .2, z); m.rotation.set((Math.random() - .5)*1.1, Math.random()*3, (Math.random() - .5)*1.1); m.castShadow = m.receiveShadow = true; E.scene.add(m); }
  // betongblock och glasfasadbitar
  for (let i = 0; i < 26; i++){ const a = Math.random()*6.283, d = Math.random()*RR*1.05, x = S.x + Math.cos(a)*d, z = S.z + Math.sin(a)*d, sz = .6 + Math.random()*1.8;
    const m = new THREE.Mesh(box, Math.random() < .8 ? MATS.conc : MATS.glass); m.scale.set(sz, sz*.6, sz*.9); m.position.set(x, onMound(d) + sz*.15, z); m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3); m.castShadow = true; E.scene.add(m); }
  // armeringsjärn
  const rebar = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: .6, metalness: .7 });
  for (let i = 0; i < 40; i++){ const a = Math.random()*6.283, d = Math.random()*RR*.85, l = 1 + Math.random()*3, m = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, l, 5), rebar);
    m.position.set(S.x + Math.cos(a)*d, onMound(d) + l*.3, S.z + Math.sin(a)*d); m.rotation.set((Math.random() - .5)*2, Math.random()*3, (Math.random() - .5)*2); E.scene.add(m); }
  // rök som stiger ur högen i över en minut
  let t = 0; const iv = setInterval(() => { t += .4; const k = Math.max(.15, 1 - t/75); for (let i = 0; i < 2; i++){ const a = Math.random()*6.283, d = Math.random()*RR*.6; fx.smoke(S.x + Math.cos(a)*d, onMound(d), S.z + Math.sin(a)*d, 1.6*k + .6, Math.random() < .6); } if (t > 80) clearInterval(iv); }, 400);
}
// en fysikbit av flera celler (sammanslagen mesh, en lådkolliderare). cells: [{ t, p (världsläge) }]
function makeChunk(cells, mid, q, lv, av, s){
  const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9), geos = [], cnt = {}, qi = q.clone().invert();
  for (const c of cells){ const l = c.p.clone().sub(mid).applyQuaternion(qi); mn.min(l); mx.max(l); cnt[c.t] = (cnt[c.t] || 0) + 1; geos.push(box.clone().scale(s, s, s).translate(l.x, l.y, l.z)); }
  const t = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], mesh = new THREE.Mesh(mergeGeometries(geos), MATS[t]); geos.forEach(x => x.dispose());
  mesh.castShadow = mesh.receiveShadow = true; mesh.position.copy(mid); mesh.quaternion.copy(q); E.scene.add(mesh);
  const c0 = mn.clone().add(mx).multiplyScalar(.5), he = mx.clone().sub(mn).multiplyScalar(.5).addScalar(s*.5*.85);
  const body = PH.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(mid.x, mid.y, mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(.05).setAngularDamping(.3));
  PH.world.createCollider(R.ColliderDesc.cuboid(he.x, he.y, he.z).setTranslation(c0.x, c0.y, c0.z).setDensity(2.2).setFriction(.7).setRestitution(.05), body);
  body.setLinvel(lv, true); body.setAngvel(av, true);
  const d = { body, mesh, t: 0, s, done: dd => { if (dd.gone) return; const tr = dd.mesh.position, qq = dd.mesh.quaternion; PH.world.createCollider(R.ColliderDesc.cuboid(he.x, he.y, he.z).setTranslation(tr.x, tr.y, tr.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }), PH.ground); } };
  PH.dyn.push(d); return d;
}
// en stor sektion smulas sönder i mindre bitar som behåller sin fart
function splitSection(d){
  const i = PH.dyn.indexOf(d); if (i < 0 || !d.body) return;
  const pos = d.mesh.position.clone(), q = d.mesh.quaternion.clone(), lv = d.body.linvel(), av = d.body.angvel(), w = new THREE.Vector3(av.x, av.y, av.z), s = d.s, ch = s >= 1 ? 3 : 4;
  PH.world.removeRigidBody(d.body); PH.dyn.splice(i, 1); d.gone = true; E.scene.remove(d.mesh); d.mesh.geometry.dispose();
  const groups = new Map();
  for (const c of d.cells){ const k = Math.floor(c.l.x/(ch*s)) + ',' + Math.floor(c.l.y/(ch*s)) + ',' + Math.floor(c.l.z/(ch*s)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ t: c.t, p: c.l.clone().applyQuaternion(q).add(pos) }); }
  let n = 0;
  for (const g of groups.values()){
    const mid = g.reduce((a, c) => a.add(c.p), new THREE.Vector3()).multiplyScalar(1/g.length), r = mid.clone().sub(pos), v = w.clone().cross(r).add(new THREE.Vector3(lv.x, lv.y, lv.z));
    v.x += (Math.random() - .5)*1.5; v.z += (Math.random() - .5)*1.5;
    const nc = makeChunk(g, mid, q, v, new THREE.Vector3((Math.random() - .5)*1.2, (Math.random() - .5)*.6, (Math.random() - .5)*1.2).add(w), s); if (d.sink){ nc.sink = d.sink; d.sink.chunks.push(nc); }
    if (n++ % 3 === 0) fx.dust(mid.x, mid.y, mid.z, 2.5, 3);
  }
}
function spawnDebris(p, size, mat, from){
  const mesh = new THREE.Mesh(box, mat); mesh.scale.setScalar(size); mesh.castShadow = true; mesh.position.copy(p); E.scene.add(mesh);
  const b = PH.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z));
  PH.world.createCollider(R.ColliderDesc.cuboid(size/2, size/2, size/2).setDensity(2), b);
  const dir = from ? p.clone().sub(from).normalize() : new THREE.Vector3(0, 1, 0);
  b.setLinvel({ x: dir.x*4 + (Math.random() - .5)*2, y: dir.y*3 + Math.random()*3, z: dir.z*4 + (Math.random() - .5)*2 }, true);
  b.setAngvel({ x: Math.random()*6 - 3, y: Math.random()*6 - 3, z: Math.random()*6 - 3 }, true);
  DS.debris++; PH.dyn.push({ body: b, mesh, t: 0, life: 12, done: () => { DS.debris--; } });
}
export function addBuilding(s){ const b = new Building(s); DS.list.push(b); return b; }
// sprängning: skadar alla celler inom radien (avtar med avståndet)
// skräphög vid foten av ett sprängt hål: lösa bitar av väggens material, på båda sidor
export function rubblePile(p, n, mat){
  const M = MATS[mat] || MATS.conc;
  for (let i = 0; i < n; i++){
    const a = Math.random()*6.283, d = .2 + Math.random()*1.1, w = .12 + Math.random()*.3, h = .08 + Math.random()*.16, dd = .1 + Math.random()*.25;
    const x = p.x + Math.cos(a)*d, z = p.z + Math.sin(a)*d, m = new THREE.Mesh(box, M); m.scale.set(w, h, dd); m.position.set(x, (p.y || 0) + h/2 + Math.random()*.08, z); m.rotation.set((Math.random() - .5)*.8, Math.random()*3, (Math.random() - .5)*.8); m.castShadow = m.receiveShadow = true; E.scene.add(m);
  }
}
// utstickande tegelbitar längs hålets kant: små lådor på de kvarvarande cellerna som vetter mot hålet
function edgeBits(b, killed){
  const s = b.s.c, M = MATS[b.s.wall] || MATS.conc, nb = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]; let n = 0;
  for (const c of killed){ for (const [di, dj, dk] of nb){ const o = b.at(c.i + di, c.j + dj, c.k + dk); if (!o || !o.alive || o.t === 'glass' || o.t === 'slab' || n > 70) continue;
    const q = b.pos(o), cnt = 1 + Math.floor(Math.random()*3);
    for (let k = 0; k < cnt; k++){ const m = new THREE.Mesh(box, M), w = s*(.3 + Math.random()*.25), h = s*(.12 + Math.random()*.14);
      m.scale.set(di ? s*(.2 + Math.random()*.3) : w, h, dk ? s*(.2 + Math.random()*.3) : w);
      m.position.set(q.x - di*s*(.45 + Math.random()*.2) + (di ? 0 : (Math.random() - .5)*s*.8), q.y - dj*s*(.45 + Math.random()*.2) + (dj ? 0 : (Math.random() - .5)*s*.8), q.z - dk*s*(.45 + Math.random()*.2) + (dk ? 0 : (Math.random() - .5)*s*.8));
      m.rotation.set((Math.random() - .5)*.3, (Math.random() - .5)*.3, (Math.random() - .5)*.3); m.castShadow = m.receiveShadow = true; E.scene.add(m); (o.bits = o.bits || []).push(m); n++; }
  } }
}
export function blast(p, r, dmg, breach){
  let killed = 0;
  for (const b of DS.list){
    const S = b.s; if (p.x < S.x - S.w/2 - r || p.x > S.x + S.w/2 + r || p.z < S.z - S.d/2 - r || p.z > S.z + S.d/2 + r) continue;
    let wt = null; const dead = [];
    for (const [c, d] of (breach ? b.nearBreach(p, r) : b.near(p, r))){ const k = Math.pow(1 - Math.min(1, d/r), .6), was = c.alive; b.hit(c, dmg*k*(.75 + Math.random()*.5), p); if (was && !c.alive){ killed++; dead.push(c); if (c.t !== 'glass' && c.t !== 'slab'){ wt = c.t; } } }
    if (breach && dead.length){ edgeBits(b, dead); for (const [c] of b.near(p, r*2)) if (c.t === 'glass') b.kill(c, p); }
    if (wt && killed > 4){ const fy = b.origin.y + Math.floor((p.y - b.origin.y)/(b.s.c*b.s.fh))*b.s.c*b.s.fh; rubblePile({ x: p.x, z: p.z, y: fy }, 10 + Math.min(20, killed), wt); }
  }
  return killed;
}
// BF4-ras: tornet sjunker ner i sitt eget damm – de lägsta bitarna krossas löpande medan resten sjunker och lutar
function removeChunk(d){ const i = PH.dyn.indexOf(d); if (i >= 0){ PH.world.removeRigidBody(d.body); PH.dyn.splice(i, 1); } d.gone = true; E.scene.remove(d.mesh); d.mesh.geometry.dispose(); }
function updateSinks(dt){
  for (let k = DS.sinks.length - 1; k >= 0; k--){
    const S = DS.sinks[k]; S.t += dt; if ((S.nxt -= dt) > 0) continue; S.nxt = .12;
    S.chunks = S.chunks.filter(d => !d.gone && PH.dyn.includes(d));
    let top = -1e9; for (const d of S.chunks) top = Math.max(top, d.body.translation().y);
    if (top < S.baseY + 6 || S.t > 14 || !S.chunks.length){ DS.sinks.splice(k, 1); continue; }
    let n = 0;
    for (const d of S.chunks){
      const t = d.body.translation();
      if (t.y < S.baseY + 2.6 && Math.hypot(t.x - S.cx, t.z - S.cz) < S.r && n < 14){ removeChunk(d); n++; if (n % 2) fx.dust(t.x, t.y + 1, t.z, 3.5, 3); continue; }
      if (t.y > S.baseY + 5){ const v = d.body.linvel(); d.body.setLinvel({ x: v.x + S.dir.x*.25, y: Math.min(v.y, -2.5), z: v.z + S.dir.z*.25 }, true); }
    }
  }
}
export function updateDestruct(dt = 1/60){
  for (const b of DS.list) b.integrity(); updateSinks(dt); updateFalls(dt);
  for (let i = DS.sections.length - 1; i >= 0; i--){ const d = DS.sections[i]; if (d.gone || d.t >= d.split){ DS.sections.splice(i, 1); if (!d.gone) splitSection(d); } }
}
