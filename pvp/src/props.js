// GATUMILJÖ i Shanghai-stil (BF4): banderoller på lyktstolparna, neonskyltar, busskur med reklam, tidningskiosk,
// trafikljus, papperskorgar, pollare, bänkar, brandposter – och tornets LED-skärm som rörlig bild.
import * as THREE from 'three';
import { E, pbr } from './engine.js';
import { R, PH } from './physics.js';

const P = { signs: [], t: 0 };
let s0 = 4242; const rr = () => (s0 = (s0*16807) % 2147483647)/2147483647;
const col = (w, h, d, x, y, z) => PH.world.createCollider(R.ColliderDesc.cuboid(w/2, h/2, d/2).setTranslation(x, y, z), PH.ground);
function add(geo, mat, x, y, z, ry = 0, shadow = true){ const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; E.scene.add(m); return m; }
function canvasT(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const WORDS = ['饭店', '银行', '药店', '酒店', '超市', '茶馆', '书店', '面馆', '电器', '咖啡'];
const NEON = ['#ff3a3a', '#ffb020', '#3ad0ff', '#ff4ad0', '#7aff5a', '#ffe060'];
// vertikal neonskylt (som på Shanghais gator)
function bladeSign(x, z, ry, word, c){
  const t = canvasT(128, 384, (g, w, h) => { g.fillStyle = '#120c10'; g.fillRect(0, 0, w, h); g.strokeStyle = c; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.shadowColor = c; g.shadowBlur = 18; g.fillStyle = '#fff6ee'; g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; [...word].forEach((ch, i) => g.fillText(ch, w/2, 130 + i*120)); });
  const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: .5 });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; E.scene.add(g);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.12, 3.2, 1.05), [FRAME, FRAME, FRAME, FRAME, m, m]); panel.position.set(0, 5.6, 0); panel.rotation.y = Math.PI/2; g.add(panel);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .9), FRAME); arm.position.set(0, 7.1, .45); g.add(arm);
  P.signs.push({ m, base: 1.2, ph: rr()*10, flick: rr() < .25 });
}
// banderoll på lyktstolpe
function banner(x, z, side, k){
  const red = k % 2 === 0, t = canvasT(96, 320, (g, w, h) => { g.fillStyle = red ? '#b01e22' : '#1e4a8a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#ffe6b0'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; [...(red ? '上海' : '欢迎')].forEach((ch, i) => g.fillText(ch, w/2, 110 + i*90)); g.font = 'bold 16px sans-serif'; g.fillText('SHANGHAI', w/2, h - 26); });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: .9, side: THREE.DoubleSide });
  const b = new THREE.Mesh(new THREE.PlaneGeometry(.62, 2.1, 1, 6), m); const p = b.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i)*2.4 + k)*.05);
  b.geometry.computeVertexNormals(); b.position.set(x - side*.36, 5.2, z); b.rotation.y = Math.PI/2; b.castShadow = true; E.scene.add(b);
  add(new THREE.CylinderGeometry(.02, .02, .8, 5), FRAME, x - side*.36, 6.27, z, 0).rotation.x = Math.PI/2;
}
let FRAME = null;
export function buildProps(sign){
  FRAME = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: .45, metalness: .75 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: .3, metalness: .9 }), green = new THREE.MeshStandardMaterial({ color: 0x23402e, roughness: .6, metalness: .3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb8c4, roughness: .05, metalness: 0, transmission: 0, transparent: true, opacity: .28, envMapIntensity: 1.6 });
  const conc = pbr('concrete_wall_004', { tri: 1.2 });
  // banderoller på lyktstolparna
  let k = 0; for (let i = -50; i <= 50; i += 16) for (const sx of [-1, 1]) banner(sx*19.5, i - 20, sx, k++);
  // neonskyltar längs trottoarernas ytterkant
  for (let z = -70; z <= 30; z += 11) for (const sx of [-1, 1]){ if (rr() < .25) continue; bladeSign(sx*24.4, z + rr()*4, sx > 0 ? Math.PI : 0, WORDS[Math.floor(rr()*WORDS.length)], NEON[Math.floor(rr()*NEON.length)]); }
  // busskur med upplyst reklam
  { const x = 21.6, z = -30, g = new THREE.Group(); g.position.set(x, 0, z); E.scene.add(g);
    for (const [px, pz] of [[-.9, -2.2], [-.9, 2.2], [.9, -2.2], [.9, 2.2]]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.6, 8), steel); p.position.set(px, 1.3, pz); p.castShadow = true; g.add(p); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, .12, 4.8), FRAME); roof.position.y = 2.65; roof.castShadow = true; g.add(roof);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.04, 2, 4.2), glass); back.position.set(.9, 1.3, 0); g.add(back);
    const ad = canvasT(256, 512, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a2a4a'); gr.addColorStop(1, '#3ad0ff'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.fillText('新款', w/2, 150); c.font = 'bold 30px sans-serif'; c.fillText('KLANER PHONE 9', w/2, 420); c.fillStyle = '#111'; c.fillRect(70, 200, 116, 170); });
    const adm = new THREE.MeshStandardMaterial({ map: ad, emissiveMap: ad, emissive: 0xffffff, emissiveIntensity: .9 }); const box = new THREE.Mesh(new THREE.BoxGeometry(.2, 2, 1.1), [FRAME, FRAME, FRAME, FRAME, adm, adm]); box.position.set(.9, 1.2, 2.75); box.rotation.y = Math.PI/2; g.add(box);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(.45, .08, 3.2), steel); bench.position.set(.55, .5, 0); g.add(bench);
    col(2.2, .2, 4.8, x, 2.65, z); col(.1, 2.6, 4.4, x + .9, 1.3, z); }
  // tidningskiosk med markis
  { const x = -21.8, z = -6, g = new THREE.Group(); g.position.set(x, 0, z); E.scene.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.6), green); body.position.y = 1.2; body.castShadow = true; g.add(body);
    const awn = canvasT(128, 64, (c, w, h) => { for (let i = 0; i < 8; i++){ c.fillStyle = i % 2 ? '#e8e2d4' : '#c22a2a'; c.fillRect(i*16, 0, 16, h); } });
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshStandardMaterial({ map: awn, side: THREE.DoubleSide, roughness: .9 })); aw.position.set(1.4, 2.35, 0); aw.rotation.set(0, Math.PI/2, 0); aw.rotateX(-.55); aw.castShadow = true; g.add(aw);
    const mags = canvasT(256, 128, (c, w, h) => { c.fillStyle = '#20241e'; c.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++){ c.fillStyle = `hsl(${rr()*360},60%,${45 + rr()*25}%)`; c.fillRect(6 + (i % 9)*27, 8 + Math.floor(i/9)*60, 23, 52); } });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: mags, roughness: .7 })); front.position.set(1.11, 1.3, 0); front.rotation.y = Math.PI/2; g.add(front);
    col(2.2, 2.4, 2.6, x, 1.2, z); }
  // trafikljus vid övergångsställena
  for (const [x, z, ry] of [[-6, 3.2, 0], [6, 20.8, Math.PI], [-20.5, 5, Math.PI/2], [20.5, 19, -Math.PI/2]]){
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; E.scene.add(g);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 4.2, 8), FRAME); p.position.y = 2.1; p.castShadow = true; g.add(p);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.38, 1.05, .32), FRAME); head.position.set(0, 3.7, .2); head.castShadow = true; g.add(head);
    ['#ff2a1a', '#ffb000', '#2aff7a'].forEach((c, i) => { const l = new THREE.Mesh(new THREE.CircleGeometry(.11, 16), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i === 0 ? 3 : .08 })); l.position.set(0, 4.03 - i*.32, .37); g.add(l); if (i === 0) P.signs.push({ m: l.material, base: 3, ph: 0, red: true }); });
    PH.world.createCollider(R.ColliderDesc.cylinder(2.1, .1).setTranslation(x, 2.1, z), PH.ground); }
  // papperskorgar, pollare, bänkar och brandposter
  const binM = new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: .55, metalness: .5 }), red = new THREE.MeshStandardMaterial({ color: 0xa0221c, roughness: .5, metalness: .4 }), wood = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: .8 });
  for (let z = -66; z <= 28; z += 9) for (const sx of [-1, 1]){
    const x = sx*(20.6 + rr()*3), kind = rr();
    if (kind < .3){ add(new THREE.CylinderGeometry(.3, .26, .95, 12), binM, x, .48, z); add(new THREE.CylinderGeometry(.32, .32, .08, 12), FRAME, x, .98, z); col(.6, 1, .6, x, .5, z); }
    else if (kind < .5){ const b = add(new THREE.BoxGeometry(.45, .08, 1.8), wood, x, .48, z, 0); add(new THREE.BoxGeometry(.08, .5, 1.8), wood, x + sx*.22, .75, z); col(.5, .9, 1.8, x, .45, z); }
    else if (kind < .62){ add(new THREE.CylinderGeometry(.14, .17, .75, 10), red, x, .38, z); add(new THREE.SphereGeometry(.15, 10, 6), red, x, .78, z); }
  }
  for (let x = -16; x <= 16; x += 2.2) if (Math.abs(x) > 4) for (const z of [9.2, 14.8]){ add(new THREE.CylinderGeometry(.09, .11, .9, 10), steel, x, .45, z); PH.world.createCollider(R.ColliderDesc.cylinder(.45, .11).setTranslation(x, .45, z), PH.ground); }
  // tornets LED-skärm blir en rörlig bild (nyheter, eld, logga)
  if (sign) animSign(sign);
}
function animSign(sign){
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  sign.material.map = t; sign.material.emissiveMap = t; sign.material.needsUpdate = true;
  P.led = { c, x, t, acc: 0, f: 0 };
}
function drawLed(L, time){
  const x = L.x, W = 256, H = 512, scene = Math.floor(time/6) % 3;
  if (scene === 0){ // nyhetssändning: studio + rullande text
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c1a34'); g.addColorStop(1, '#1e3e6e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#d8dde4'; x.fillRect(40, 120, 176, 200); x.fillStyle = '#26324a'; x.beginPath(); x.arc(128, 190, 46, 0, 7); x.fill(); x.fillRect(70, 236, 116, 84);
    x.fillStyle = '#c8102e'; x.fillRect(0, 380, W, 60); x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'left'; x.fillText('新闻 · BREAKING · 上海 · 新闻 · BREAKING', 256 - (time*90 % 760), 422);
  } else if (scene === 1){ // eld/explosion (som skärmen i BF4)
    x.fillStyle = '#140804'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++){ const px = 128 + Math.sin(i*12.9 + time*3)*90, py = 300 + Math.cos(i*7.3 + time*2)*120 - (time*60 + i*13) % 200, r = 20 + (i % 7)*8, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,220,120,.55)'); g.addColorStop(.5, 'rgba(240,90,20,.35)'); g.addColorStop(1, 'rgba(60,10,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r*2, r*2); }
  } else { // logga
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0a14'); g.addColorStop(.5, '#b0182a'); g.addColorStop(1, '#ff7a1a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = `rgba(255,240,220,${.75 + Math.sin(time*4)*.2})`; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.fillText('克', 128, 190); x.fillText('兰', 128, 330); x.font = 'bold 42px sans-serif'; x.fillText('KLANER', 128, 440);
  }
  for (let i = 0; i < H; i += 4){ x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(0, i, W, 1); }
  L.t.needsUpdate = true;
}
export function updateProps(dt){
  P.t += dt;
  for (const s of P.signs){ if (s.red) continue; s.m.emissiveIntensity = s.flick && Math.sin(P.t*23 + s.ph) > .93 ? .15 : s.base*(.92 + .08*Math.sin(P.t*2 + s.ph)); }
  const L = P.led; if (L){ L.acc += dt; if (L.acc > 1/12){ L.acc = 0; drawLed(L, P.t); } }
}
