// Övningskarta i Shanghai-stil: asfalterad stadskärna, ett höghus som kan rasa (BF4), hus med väggar som går att spränga (R6),
// betongbarriärer, måltavlor och en stadssiluett i diset.
import * as THREE from 'three';
import { E, pbr, tex } from './engine.js';
import { R, PH, own } from './physics.js';
import { addBuilding } from './destruct.js';
import { TARGETS } from './player.js';
import { fx } from './fx.js';

export const MAP = { flags: [], spawn: { x: 0, y: 0, z: 46, yaw: 0 } };
function staticBox(w, h, d, x, y, z, mat, ry){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = true; E.scene.add(m);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry || 0, 0));
  PH.world.createCollider(R.ColliderDesc.cuboid(w/2, h/2, d/2).setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), PH.ground); return m;
}
// glasfasad för stadssiluetten: mörka glaspaneler, ljusa bjälklagsband och spröjs (färgkarta + grovhetskarta så att glaset speglar himlen)
function facadeTex(seed, kind){
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d'), g = document.createElement('canvas'); g.width = 256; g.height = 512; const y = g.getContext('2d');
  let s = seed; const r = () => (s = (s*16807) % 2147483647)/2147483647;
  const glass = kind === 0 ? [22, 30, 40] : kind === 1 ? [40, 46, 50] : [26, 34, 34], band = kind === 1 ? '#9a9a94' : '#8a9096';
  x.fillStyle = `rgb(${glass})`; x.fillRect(0, 0, 256, 512); y.fillStyle = '#202020'; y.fillRect(0, 0, 256, 512);
  for (let j = 0; j < 32; j++){
    x.fillStyle = band; x.fillRect(0, j*16, 256, kind === 1 ? 5 : 3); y.fillStyle = '#c0c0c0'; y.fillRect(0, j*16, 256, kind === 1 ? 5 : 3);
    for (let i = 0; i < 16; i++){ const v = (r() - .5)*14, l = r() > .93; x.fillStyle = l ? 'rgb(150,140,110)' : `rgb(${glass[0] + v},${glass[1] + v},${glass[2] + v})`; x.fillRect(i*16 + 1, j*16 + (kind === 1 ? 6 : 4), 14, kind === 1 ? 9 : 11); }
    x.fillStyle = band; for (let i = 0; i <= 16; i++) x.fillRect(i*16, j*16, 1, 16);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const rt = new THREE.CanvasTexture(g); rt.wrapS = rt.wrapT = THREE.RepeatWrapping; return [t, rt];
}
// LED-skylt på tornets fasad (som reklamskärmarna i Shanghai): självlysande, målad i canvas
function ledSign(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#1a0a14'); g.addColorStop(.5, '#b0182a'); g.addColorStop(1, '#ff7a1a'); x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  x.fillStyle = 'rgba(255,240,220,.9)'; x.font = 'bold 120px Rajdhani, sans-serif'; x.textAlign = 'center'; x.fillText('克', 128, 190); x.fillText('兰', 128, 330); x.font = 'bold 42px Rajdhani, sans-serif'; x.fillText('KLANER', 128, 440);
  for (let i = 0; i < 512; i += 4){ x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, i, 256, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(9, 18), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: .4 }));
}
export function buildTraining(){
  // mark: asfalt med trottoarer
  const asphalt = pbr('asphalt_02'); for (const k of ['map', 'normalMap', 'roughnessMap']) asphalt[k].repeat.set(90, 90);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), asphalt); ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; E.scene.add(ground);
  PH.world.createCollider(R.ColliderDesc.cuboid(300, .5, 300).setTranslation(0, -.5, 0), PH.ground);
  const walk = pbr('concrete_floor_worn_001', { tri: 3 });
  for (const [w, d, x, z] of [[120, 6, 0, 12], [6, 120, -22, -20], [6, 120, 22, -20], [120, 6, 0, -62]]) staticBox(w, .18, d, x, .09, z, walk);
  // kantstenar längs trottoarerna
  const curbM = pbr('concrete_wall_004', { tri: 1.5 });
  for (const [w, d, x, z] of [[120, .3, 0, 8.85], [120, .3, 0, 15.15], [.3, 120, -18.85, -20], [.3, 120, 18.85, -20], [.3, 120, -25.15, -20], [.3, 120, 25.15, -20], [120, .3, 0, -58.85], [120, .3, 0, -65.15]]) staticBox(w, .22, d, x, .11, z, curbM);
  // övergångsställen (zebra)
  const zm = new THREE.MeshStandardMaterial({ color: 0xe0ddd2, roughness: .7 });
  for (const [cx, cz, rot] of [[0, 4.5, 0], [0, 19.5, 0], [0, -55.5, 0], [-22, 12, 1], [22, 12, 1]]) for (let i = -7; i <= 7; i++){ const m = new THREE.Mesh(new THREE.PlaneGeometry(.55, 3.2), zm); m.rotation.x = -Math.PI/2; if (rot) m.rotation.z = Math.PI/2; m.position.set(cx + (rot ? 0 : i*1.1), .016, cz + (rot ? i*1.1 : 0)); m.receiveShadow = true; E.scene.add(m); }
  MAP.roads = [[0, -20, 37.4, 130], [0, 12, 160, 6], [0, -62, 160, 6]];
  // vägmarkeringar
  const lm = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: .8 });
  for (let i = -50; i < 50; i += 6){ const m = new THREE.Mesh(new THREE.PlaneGeometry(.18, 3), lm); m.rotation.x = -Math.PI/2; m.position.set(0, .015, i - 20); m.receiveShadow = true; E.scene.add(m); }
  // BF4: höghuset som kan rasa – spräng pelarna på bottenvåningen
  const T0 = addBuilding({ x: 0, z: -34, w: 16, d: 16, floors: 24, c: 1, fh: 3, wall: 'frame', win: true, curtain: true, inner: false, cols: 4, keyCols: true });
  T0.sign = ledSign(); T0.sign.position.set(0, 40, -34 + 8.06); E.scene.add(T0.sign);
  // R6: hus med väggar som går att spränga
  addBuilding({ x: -38, z: -10, w: 12, d: 9, floors: 2, c: .5, fh: 6, wall: 'brick' });
  addBuilding({ x: 38, z: -10, w: 11, d: 10, floors: 2, c: .5, fh: 6, wall: 'soft' });
  addBuilding({ x: -38, z: -48, w: 10, d: 12, floors: 3, c: .5, fh: 6, wall: 'conc' });
  addBuilding({ x: 38, z: -50, w: 12, d: 9, floors: 2, c: .5, fh: 6, wall: 'brick' });
  // betongbarriärer (skydd)
  const conc = pbr('concrete_wall_004', { tri: 2 });
  for (const [x, z, r] of [[-6, 24, 0], [5, 26, .3], [-12, 4, 1.57], [12, 2, 1.57], [0, -8, 0], [-26, 26, .8], [24, 30, -.4]]) staticBox(3.2, 1.05, .6, x, .52, z, conc, r);
  // bilar (byggda av former, lack med reflexer), som skydd och detalj
  const glassM = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: .05, metalness: .9 }), tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .9 }), rim = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: .3, metalness: .9 });
  const prof = (pts, w, m) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: w - .1, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 3, curveSegments: 8 }); g.translate(0, 0, -(w - .1)/2); return new THREE.Mesh(g, m); };
  const car = (x, z, ry, color) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; E.scene.add(g); const paint = new THREE.MeshPhysicalMaterial({ color, roughness: .32, metalness: .55, clearcoat: 1, clearcoatRoughness: .06 });
    const add = o => { o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    // kaross (sidoprofil sedan) och glaskupé
    add(prof([[-2.25, .32], [2.25, .32], [2.3, .62], [2.15, .85], [1.1, .95], [-1.9, .95], [-2.25, .78]], 1.78, paint)).position.y = 0;
    add(prof([[-1.55, .93], [.95, .93], [.45, 1.38], [-1.25, 1.4], [-1.65, 1.0]], 1.58, glassM));
    add(prof([[-1.5, 1.36], [.5, 1.36], [.42, 1.44], [-1.2, 1.46]], 1.6, paint));
    for (const [wx, wz] of [[1.42, .8], [1.42, -.8], [-1.42, .8], [-1.42, -.8]]){ const w = add(new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .24, 22), tyre)); w.rotation.x = Math.PI/2; w.position.set(wx, .34, wz); const r = add(new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .25, 12), rim)); r.rotation.x = Math.PI/2; r.position.set(wx, .34, wz); }
    const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: .6 }), tail = new THREE.MeshStandardMaterial({ color: 0x600000, emissive: 0xff2010, emissiveIntensity: .4 });
    for (const sz of [-.6, .6]){ const h = add(new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .35), lamp)); h.position.set(2.29, .7, sz); const t = add(new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .3), tail)); t.position.set(-2.27, .78, sz); }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)); PH.world.createCollider(R.ColliderDesc.cuboid(2.2, .72, .9).setTranslation(x, .72, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), PH.ground);
  };
  [[-4, 18, .1, 0x1c2a3a], [5, -2, 3.0, 0x6a6e72], [-14, -24, 1.6, 0xb8b8b4], [15, -46, 1.5, 0x2a2a2a], [-5, 34, -.2, 0x7a1e1a], [28, 20, .4, 0x3a3e44]].forEach(c => car(...c));
  // lyktstolpar längs trottoarerna
  const pole = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: .5, metalness: .7 });
  for (let i = -50; i <= 50; i += 16) for (const sx of [-1, 1]){
    const x = sx*19.5, z = i - 20, p = new THREE.Mesh(new THREE.CylinderGeometry(.09, .13, 7.5, 8), pole); p.position.set(x, 3.75, z); p.castShadow = true; E.scene.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, .1, .12), pole); arm.position.set(x - sx*.9, 7.4, z); arm.castShadow = true; E.scene.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.6, .14, .3), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0xfff2d8, emissiveIntensity: .4 })); lamp.position.set(x - sx*1.7, 7.32, z); E.scene.add(lamp);
    PH.world.createCollider(R.ColliderDesc.cylinder(3.75, .13).setTranslation(x, 3.75, z), PH.ground);
  }
  // räcken längs trottoaren mot gatan (som på strandpromenaden i Shanghai)
  const rail = new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: .35, metalness: .85 });
  for (const sx of [-1, 1]){ const x = sx*25; const top = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 30, 8), rail); top.rotation.x = Math.PI/2; top.position.set(x, 1.05, 15); E.scene.add(top); const mid = top.clone(); mid.position.y = .6; E.scene.add(mid);
    for (let z = 0; z <= 30; z += 2.5){ const p = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.05, .06), rail); p.position.set(x, .53, z); p.castShadow = true; E.scene.add(p); }
    PH.world.createCollider(R.ColliderDesc.cuboid(.05, .55, 15).setTranslation(x, .55, 15), PH.ground); }
  // vattenpölar och fuktfläckar på asfalten (speglar himlen) – BF4:s gator är sällan torra
  let ps = 91; const pr = () => (ps = (ps*16807) % 2147483647)/2147483647;
  const wet = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: .05, metalness: 0, envMapIntensity: 2.4, transparent: true, opacity: .85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const damp = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: .35, metalness: 0, transparent: true, opacity: .45, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (let i = 0; i < 46; i++){
    const g = new THREE.CircleGeometry(1, 18), p = g.attributes.position; for (let k = 1; k < p.count; k++){ const f = .6 + pr()*.5; p.setXY(k, p.getX(k)*f, p.getY(k)*f); }
    const big = pr() < .4, m = new THREE.Mesh(g, big ? damp : wet), sx = big ? 2 + pr()*4 : .5 + pr()*1.6;
    m.rotation.set(-Math.PI/2, 0, pr()*3); m.scale.set(sx, sx*(.4 + pr()*.6), 1); m.position.set(-17 + pr()*34, .012 + (big ? 0 : .002), -75 + pr()*110); m.receiveShadow = true; E.scene.add(m);
  }
  // träd i planteringar längs trottoarerna
  const bark = new THREE.MeshStandardMaterial({ color: 0x3b2e24, roughness: .95 }), planter = pbr('concrete_wall_004', { tri: 1.5 });
  // lövkort: många små blad på genomskinlig bakgrund (canvas), dubbelsidiga med alfatest
  const lc = document.createElement('canvas'); lc.width = lc.height = 256; const lx = lc.getContext('2d');
  for (let i = 0; i < 520; i++){ const x = 128 + (pr() - .5)*230*Math.sqrt(pr()), y = 128 + (pr() - .5)*230*Math.sqrt(pr()), g = 70 + pr()*60; lx.fillStyle = `rgb(${g*.55|0},${g|0},${g*.4|0})`; lx.beginPath(); lx.ellipse(x, y, 5 + pr()*6, 2.5 + pr()*3, pr()*3.14, 0, 7); lx.fill(); }
  const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
  const leafCard = new THREE.MeshStandardMaterial({ map: lt, alphaTest: .45, side: THREE.DoubleSide, roughness: .8, color: 0xb8c8a0 });
  const cardG = new THREE.PlaneGeometry(1.6, 1.6);
  for (let z = -66; z <= 30; z += 12) for (const sx of [-1, 1]){
    const x = sx*22, g = new THREE.Group(); g.position.set(x, 0, z + (sx > 0 ? 6 : 0)); E.scene.add(g);
    const box2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, .45, 1.6), planter); box2.position.y = .22; box2.castShadow = box2.receiveShadow = true; g.add(box2);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.09, .14, 3.4, 7), bark); tr.position.y = 1.9; tr.castShadow = true; g.add(tr);
    for (let k = 0; k < 34; k++){ const f = new THREE.Mesh(cardG, leafCard), a = pr()*6.283, rr = Math.sqrt(pr())*1.5; f.position.set(Math.cos(a)*rr, 3.3 + pr()*2.2, Math.sin(a)*rr); f.rotation.set(pr()*3.14, pr()*3.14, pr()*3.14); f.scale.setScalar(.8 + pr()*.6); f.castShadow = true; g.add(f); }
    for (let k = 0; k < 4; k++){ const br = new THREE.Mesh(new THREE.CylinderGeometry(.03, .06, 1.6, 5), bark); br.position.set(0, 3.6, 0); br.rotation.set((pr() - .5)*1.6, pr()*3, (pr() - .5)*1.6); br.translateY(.6); g.add(br); }
    PH.world.createCollider(R.ColliderDesc.cuboid(.8, .23, .8).setTranslation(g.position.x, .23, g.position.z), PH.ground);
  }
  // måltavlor framför husen
  const tm = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: .9 }), tr = new THREE.MeshStandardMaterial({ color: 0xa03020, roughness: .9 });
  for (const [x, z] of [[-30, 14], [-20, 18], [20, 18], [30, 14], [0, -20]]){
    const g = new THREE.Group(); g.position.set(x, 0, z); E.scene.add(g);
    const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 1, .08), tm); post.position.y = .5; g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(.6, .9, .04), tm); board.position.y = 1.4; board.castShadow = true; g.add(board);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .05, 16), tr); ring.rotation.x = Math.PI/2; ring.position.set(0, 1.5, .01); g.add(ring);
    const t = { pos: new THREE.Vector3(x, 1.4, z), alive: true, g, hp: 100, hit(d, p){ if (!this.alive) return; this.hp -= d; if (this.hp <= 0){ this.alive = false; this.g.rotation.x = -1.45; this.g.position.y = .08; fx.dust(x, .4, z, .6, 6); setTimeout(() => { this.alive = true; this.hp = 100; this.g.rotation.x = 0; this.g.position.y = 0; }, 4000); } } };
    own(PH.world.createCollider(R.ColliderDesc.cuboid(.3, .45, .03).setTranslation(x, 1.4, z), PH.ground), { target: t }); TARGETS.push(t);
  }
  // stadssiluett i diset (ej förstörbar)
  let seed = 7; const rr = () => (seed = (seed*16807) % 2147483647)/2147483647;
  const facs = [0, 1, 2].map(k => facadeTex(31 + k*71, k));
  const tower = (x, z, w, d, h, k, ry) => {
    // skyskrapa i 1–3 avsatser med tak-detaljer
    const [ft, rt] = facs[k], grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; E.scene.add(grp);
    let y = 0, ww = w, dd = d; const steps = 1 + Math.floor(rr()*3);
    for (let s = 0; s < steps; s++){
      const hh = s === steps - 1 ? h - y : h*(.45 + rr()*.25)/(s + 1), mt = ft.clone(), mr = rt.clone(); mt.needsUpdate = mr.needsUpdate = true; mt.repeat.set(ww/40, hh/80); mr.repeat.copy(mt.repeat);
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), new THREE.MeshStandardMaterial({ map: mt, roughnessMap: mr, roughness: 1, metalness: k === 1 ? .15 : .7, envMapIntensity: .3, color: 0x7a848c }));
      m.position.y = y + hh/2; m.castShadow = true; grp.add(m); y += hh; ww *= .78; dd *= .78; if (y >= h - 1) break;
    }
    const roof = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: .7, metalness: .4 });
    for (let i = 0; i < 3; i++){ const b = new THREE.Mesh(new THREE.BoxGeometry(ww*(.2 + rr()*.3), 2 + rr()*4, dd*(.2 + rr()*.3)), roof); b.position.set((rr() - .5)*ww*.5, y + 1.5, (rr() - .5)*dd*.5); grp.add(b); }
    if (rr() < .4){ const ant = new THREE.Mesh(new THREE.CylinderGeometry(.25, .4, 18 + rr()*20, 6), roof); ant.position.y = y + 12; grp.add(ant); }
  };
  for (let i = 0; i < 54; i++){
    const a = i/54*6.283 + rr()*.08, d = 115 + rr()*190, h = 40 + rr()*rr()*190, w = 18 + rr()*22;
    tower(Math.cos(a)*d, Math.sin(a)*d - 30, w, w*(.7 + rr()*.6), h, Math.floor(rr()*3), rr()*3);
  }
  tower(-130, -150, 34, 30, 260, 0, .3); tower(120, -170, 28, 28, 230, 2, -.2);   // landmärken
  // mål (flaggor) för HUD:en
  MAP.flags = [{ n: 'A', x: -38, z: -10, own: 'us' }, { n: 'B', x: 0, z: -34, y: 6 }, { n: 'C', x: 38, z: -10, own: 'cn' }];
  return T0;
}
