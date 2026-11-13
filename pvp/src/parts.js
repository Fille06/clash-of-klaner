// MARKDELAR i basbyggaren: väg, grusväg, bro, ramp, trappa, stenblock, stockhög, staket, buskage, fordonsvrak, flaggstång.
// Varje del är en three-modell med egna kolliderare (man kan gå på ramper, trappor och broar).
// Delar som står på ett tak (stapling) faller när taket under försvinner. Explosiva byggnader smäller när de skjuts sönder.
import * as THREE from 'three';
import { E, pbr } from './engine.js';
import { R, PH } from './physics.js';
import { fx } from './fx.js';
import { DS } from './destruct.js';
import { T, hAt } from './terrain.js';
import { explode, PL } from './player.js';

export const PARTS = { list: [] };
let M = null;
function mats(){
  if (M) return M;
  M = {
    asphalt: pbr('asphalt_02', { tri: 2.5 }),
    gravel: pbr('brown_mud_leaves_01', { tri: 2, color: 0xb8a888 }),
    conc: pbr('concrete_floor_worn_001', { tri: 2 }),
    paint: pbr('painted_concrete', { tri: 2 }),
    rock: pbr('rocky_terrain_02', { tri: 1.5, color: 0x9a948c }),
    metal: pbr('metal_plate', { tri: 1.2, metal: .8, color: 0x6a6f66 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: .85, metalness: 0 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: .95, metalness: 0 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f5a2e, roughness: .9, metalness: 0, flatShading: true }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: .8, metalness: .5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .7, metalness: .2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: .35, metalness: .9 }),
    line: new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: .6 }),
    flag: new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: .8, side: THREE.DoubleSide }),
  };
  return M;
}
const fixed = () => PH.ground;
// kolliderare i lokala koordinater för delen (roteras med delen)
function colBox(P, w, h, d, lx, ly, lz){
  const q = P.q, c = new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(P.o);
  const col = PH.world.createCollider(R.ColliderDesc.cuboid(w/2, h/2, d/2).setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), fixed());
  P.cols.push(col); return col;
}
function colHull(P, pts){
  const arr = new Float32Array(pts.length*3); pts.forEach((p, i) => { const v = new THREE.Vector3(...p).applyQuaternion(P.q).add(P.o); arr.set([v.x, v.y, v.z], i*3); });
  const d = R.ColliderDesc.convexHull(arr); if (!d) return null; const col = PH.world.createCollider(d, fixed()); P.cols.push(col); return col;
}
function mesh(P, geo, mat, x, y, z, shadow = true){ const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; P.g.add(m); return m; }
// yta som följer marken (vägar): ett rutnät med höjd från terrängen
function groundStrip(P, w, d, mat, lift){
  const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w)), Math.max(1, Math.round(d))); geo.rotateX(-Math.PI/2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){ v.set(p.getX(i), 0, p.getZ(i)).applyQuaternion(P.q).add(P.o); p.setY(i, Math.max(hAt(v.x, v.z), T.sea + .02) - P.o.y + lift); }
  geo.computeVertexNormals(); const m = mesh(P, geo, mat, 0, 0, 0, false); m.renderOrder = 2; return m;
}

// MODELLER – (P: { g, o, q, cols }, w, d) i delens lokala system, marken/taket på y = 0
const MAKERS = {
  vag(P, w, d){
    const m = mats(); groundStrip(P, w, d, m.asphalt, .05);
    // streckad mittlinje längs vägens långsida
    const along = w >= d, len = along ? w : d;
    for (let a = -len/2 + .5; a < len/2 - .5; a += 2){
      const lx = along ? a + .5 : 0, lz = along ? 0 : a + .5, v = new THREE.Vector3(lx, 0, lz).applyQuaternion(P.q).add(P.o);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(along ? 1 : .14, along ? .14 : 1).rotateX(-Math.PI/2), m.line);
      s.position.set(lx, Math.max(hAt(v.x, v.z), T.sea + .02) - P.o.y + .07, lz); P.g.add(s);
    }
  },
  grus(P, w, d){ groundStrip(P, w, d, mats().gravel, .04); },
  bro(P, w, d){
    const m = mats(), deck = .45, y0 = P.deck;
    mesh(P, new THREE.BoxGeometry(w, deck, d), m.paint, 0, y0 - deck/2, 0); colBox(P, w, deck, d, 0, y0 - deck/2, 0);
    for (const s of [-1, 1]){ mesh(P, new THREE.BoxGeometry(w, .12, .12), m.steel, 0, y0 + 1, s*(d/2 - .1)); colBox(P, w, 1.1, .2, 0, y0 + .55, s*(d/2 - .1));
      for (let x = -w/2 + .3; x <= w/2 - .3; x += 1.5) mesh(P, new THREE.BoxGeometry(.08, 1, .08), m.steel, x, y0 + .5, s*(d/2 - .1)); }
    // pelare ner till botten
    for (const x of [-w/2 + 1, 0, w/2 - 1]){ const gy = hAt(P.o.x + x, P.o.z) - P.o.y - 2, h = Math.max(.5, y0 - deck - gy); mesh(P, new THREE.BoxGeometry(.8, h, d*.6), m.conc, x, y0 - deck - h/2, 0); }
  },
  ramp(P, w, d){
    const m = mats(), h = 3, geo = new THREE.BufferGeometry(), x = w/2, z = d/2;
    // kil: låg ände vid -z, hög ände (3 m = ett våningsplan) vid +z
    const v = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, h, z], [x, h, z]];
    const f = [[0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]];
    const pos = []; for (const t of f) for (const k of t) pos.push(...v[k]); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i]*.5 + pos[i + 1]*.3, pos[i + 2]*.5); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    mesh(P, geo, m.conc, 0, 0, 0); colHull(P, v);
    for (const s of [-1, 1]) mesh(P, new THREE.BoxGeometry(.08, .9, d), m.steel, s*(x - .05), h/2 + .45, 0).rotation.x = -Math.atan2(h, d);
  },
  trappa(P, w, d){
    const m = mats(), n = 10, h = 3, st = d/n;
    for (let i = 0; i < n; i++){ const hy = (i + 1)*h/n; mesh(P, new THREE.BoxGeometry(w, hy, st), m.conc, 0, hy/2, -d/2 + st*(i + .5)); colBox(P, w, hy, st, 0, hy/2, -d/2 + st*(i + .5)); }
    for (const s of [-1, 1]){ const r = mesh(P, new THREE.BoxGeometry(.06, .06, Math.hypot(d, h)), m.steel, s*(w/2 - .05), h/2 + .95, 0); r.rotation.x = -Math.atan2(h, d); }
  },
  sten(P, w, d){
    const m = mats(), geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){ const k = .75 + .45*Math.abs(Math.sin(i*12.9898 + P.seed)); p.setXYZ(i, p.getX(i)*k*w*.5, p.getY(i)*k*.85, p.getZ(i)*k*d*.5); }
    geo.computeVertexNormals(); const s = mesh(P, geo, m.rock, 0, .55, 0); s.rotation.y = P.seed;
    colBox(P, w*.85, 1.5, d*.85, 0, .6, 0);
  },
  stock(P, w, d){
    const m = mats(), r = .28;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++){ const l = mesh(P, new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI/2), m.bark, 0, r + row*r*1.7, -d/2 + r + (i + row*.5)*r*2.05); l.rotation.x = (i - 1.5)*.03; }
    colBox(P, w, 1.3, d, 0, .65, 0);
  },
  staket(P, w, d){
    const m = mats();
    for (let x = -w/2; x <= w/2 + .01; x += 1.5) mesh(P, new THREE.BoxGeometry(.1, 1.3, .1), m.wood, x, .65, 0);
    for (const y of [.45, 1.05]) mesh(P, new THREE.BoxGeometry(w, .12, .05), m.wood, 0, y, 0);
    colBox(P, w, 1.3, .2, 0, .65, 0);
  },
  buske(P, w, d){
    const m = mats();
    for (let i = 0; i < 7; i++){ const a = i/7*6.283 + P.seed, r = i ? .8 : 0, s = .7 + .4*Math.abs(Math.sin(i*3.1 + P.seed)); const b = mesh(P, new THREE.IcosahedronGeometry(s, 0), m.leaf, Math.cos(a)*r*w/3, s*.75, Math.sin(a)*r*d/3); b.scale.y = .8; }
    // buskar skyddar mot insyn men inte mot kulor: ingen kolliderare
  },
  vrak(P, w, d){
    const m = mats();
    mesh(P, new THREE.BoxGeometry(w*.95, .9, d*.9), m.rust, 0, .75, 0).rotation.z = .04;
    mesh(P, new THREE.BoxGeometry(w*.5, .7, d*.82), m.rust, -w*.12, 1.5, 0).rotation.z = -.06;
    for (const [x, z] of [[-w*.33, -d*.45], [w*.33, -d*.45], [-w*.33, d*.45], [w*.33, d*.45]]) mesh(P, new THREE.CylinderGeometry(.38, .38, .3, 12).rotateX(Math.PI/2), m.black, x, .3, z).rotation.z = .3;
    colBox(P, w*.95, 1.9, d*.9, 0, .95, 0);
  },
  flagga(P, w, d){
    const m = mats(); mesh(P, new THREE.CylinderGeometry(.06, .08, 8, 8), m.steel, 0, 4, 0);
    const geo = new THREE.PlaneGeometry(2.2, 1.3, 8, 4), p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i)*2)*.12);
    geo.computeVertexNormals(); P.cloth = mesh(P, geo, m.flag, 1.15, 7.2, 0, true);
    colBox(P, .25, 8, .25, 0, 4, 0);
  },
};

/**
 * Skapar en markdel. it: { t, x, z, rot, y }, C: katalogpost med spec { w, d }.
 * Returnerar ett objekt som builder/defense kan städa bort med partDispose.
 */
export function partMake(it, C){
  const [w, d] = [C.spec.w, C.spec.d];
  const g = new THREE.Group(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (it.rot % 4)*Math.PI/2);
  const y = it.y ?? hAt(it.x, it.z);
  const P = { it, g, o: new THREE.Vector3(it.x, y, it.z), q, cols: [], seed: (Math.abs(it.x*7.3 + it.z*3.1) % 6.283), alive: true, kind: 'part' };
  if (it.t === 'bro'){
    // brodäcket ligger i nivå med högsta landfästet, minst 0,6 m över vattnet
    const ends = [-w/2 + .5, w/2 - .5].map(lx => { const v = new THREE.Vector3(lx, 0, 0).applyQuaternion(q); return hAt(it.x + v.x, it.z + v.z); });
    P.deck = Math.max(...ends, T.sea + .6) - y + .3;
  }
  g.position.copy(P.o); g.quaternion.copy(q); E.scene.add(g);
  (MAKERS[it.t] || MAKERS.sten)(P, w, d);
  g.traverse(o => { if (o.isMesh && o.geometry.attributes.position.count > 40) o.castShadow = true; });
  PARTS.list.push(P);
  return P;
}

export function partDispose(P){
  if (!P) return; P.alive = false;
  if (P.g.parent) P.g.parent.remove(P.g);
  P.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  for (const c of P.cols){ try { PH.world.removeCollider(c, false); } catch (e){} }
  P.cols.length = 0;
  const i = PARTS.list.indexOf(P); if (i >= 0) PARTS.list.splice(i, 1);
}

// SPELET: staplade delar faller när taket under dem är borta, explosiva byggnader smäller
const RUN = { items: [], t: 0 };
export function partsStart(items){ RUN.items = items; RUN.t = 0; for (const it of items) it.boomed = false; }
export function partsStop(){ RUN.items = []; }
const supGone = B => !B || B.collapsed > 0 || DS.falls.some(f => f.b === B);
export function updateParts(dt){
  for (const P of PARTS.list) if (P.cloth){ const p = P.cloth.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i)*2 + E.time*3)*.12*(p.getX(i) + 1.1)/2.2); p.needsUpdate = true; }
  if (!RUN.items.length) return;
  RUN.t -= dt; if (RUN.t > 0) return; RUN.t = .25;
  for (const it of RUN.items){
    // del eller försvar på ett tak: faller när någon av byggnaderna under rasar eller taket under är bortsprängt
    // gäller både markdelar (it.prop) och föremål från försvarsfliken (it.def, t.ex. strålkastare)
    const thing = it.prop && it.prop.alive ? it.prop : it.def && it.def.alive && !it.b ? it.def : null;
    if (it.on && it.on.length && thing){
      const held = it.on.some(o => o.b && !supGone(o.b) && o.b.cells.some(c => c.alive && c.j === o.b.NY - 1 && Math.abs(o.b.pos(c).x - it.x) < 1.5 && Math.abs(o.b.pos(c).z - it.z) < 1.5));
      if (!held){
        const p = it.prop ? it.prop.o : it.def.pos; fx.dust(p.x, p.y, p.z, 2, 8);
        if (it.prop) partDispose(it.prop); else { if (it.def.target && it.def.target.hit) it.def.target.hit(999); if (it.def.m){ it.def.m.position.y = hAt(it.x, it.z); it.def.m.rotation.z = 1.4; } it.def.alive = false; }
      }
    }
    // explosiva byggnader (ammunitionsförråd): smäller när en tredjedel är sönderskjuten eller de rasar
    if (it.explosive && it.b && !it.boomed){
      const B = it.b, alive = B.cells.reduce((a, c) => a + (c.alive ? 1 : 0), 0);
      if (B.collapsed > 0 || alive < B.cells.length*.67){
        it.boomed = true; PL.nextCause = 'AMMUNITIONSFÖRRÅD';
        explode(new THREE.Vector3(it.x, it.y + 1.5, it.z), 6, 900, 1.6, null, false, true, it.side);
      }
    }
  }
}
