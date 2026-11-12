// Partiklar (rök, eld, glöd, damm, gnistor, glassplitter) i två punktmoln med egen shader, och dekaler (kulhål, brännmärken).
import * as THREE from 'three';
import { E } from './engine.js';

const FX = { P: [], max: 0, U: null, wind: new THREE.Vector3(.5, 0, .2) };
const lin = h => new THREE.Color(h);   // färgerna hanteras av three (sRGB -> linjärt)
const C = {}; const col = h => C[h] || (C[h] = lin(h));

function atlas(){
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); let s = 733; const R = () => (s = (s*16807) % 2147483647)/2147483647;
  const puff = (ox, oy) => { for (let i = 0; i < 60; i++){ const a = R()*6.283, d = Math.pow(R(), .7)*34, px = ox + 64 + Math.cos(a)*d, py = oy + 64 + Math.sin(a)*d, r = 12 + R()*22*(1 - d/50), g = x.createRadialGradient(px, py, 0, px, py, r), v = 190 + R()*65;
    g.addColorStop(0, `rgba(${v},${v},${v},${.14 + R()*.12})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(ox, oy, 128, 128); } };
  puff(0, 0); puff(128, 0);
  for (let i = 0; i < 34; i++){ const py = 146 + R()*92, px = 64 + (R() - .5)*26, r = (12 + R()*16)*Math.min(1, (py - 128)/70 + .2), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 128, 128, 128); }
  // 3: splitter (vass bit) – används för glas och betongflisor
  // smal, oregelbunden flisa (inte en romb – den såg ut som vita pappersbitar)
  x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.moveTo(184, 134); x.lineTo(206, 158); x.lineTo(214, 236); x.lineTo(196, 250); x.lineTo(186, 196); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cloud(add){
  const n = FX.max, g = new THREE.BufferGeometry(), A = (k, s) => g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n*s), s).setUsage(THREE.DynamicDrawUsage));
  A('position', 3); A('size', 1); A('pc', 4); A('pr', 2); g.setDrawRange(0, 0);
  const m = new THREE.ShaderMaterial({ uniforms: FX.U, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `uniform float uScale, uMaxP; attribute float size; attribute vec4 pc; attribute vec2 pr; varying vec4 vC; varying vec2 vR; varying float vD;
      void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.); gl_Position = projectionMatrix*mv; gl_PointSize = min(uMaxP, size*uScale/max(.1, -mv.z)); vC = pc; vR = pr; vD = -mv.z; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uLight, fCol; uniform float fDen; varying vec4 vC; varying vec2 vR; varying float vD;
      void main(){ vec2 p = gl_PointCoord - .5; float c = cos(vR.x), s = sin(vR.x); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + .5; if (p.x < 0. || p.y < 0. || p.x > 1. || p.y > 1.) discard;
        float cl = mod(vR.y, 2.), rw = floor(vR.y/2.); vec4 t = texture2D(map, vec2((cl + p.x)*.5, 1. - (rw + p.y)*.5)); float f = 1. - exp(-fDen*fDen*vD*vD);
        ${add ? 'gl_FragColor = vec4(vC.rgb*t.rgb*3.0, t.a*vC.a*(1. - f));' : 'gl_FragColor = vec4(mix(vC.rgb*t.rgb*uLight, fCol, f), t.a*vC.a);'}
        #include <colorspace_fragment>
      }` });
  const o = new THREE.Points(g, m); o.frustumCulled = false; o.renderOrder = add ? 6 : 5; o.layers.set(E.FX_LAYER); E.scene.add(o); return { o, g };
}
function decalTex(kind){
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); let s = kind === 'hole' ? 41 : 97; const R = () => (s = (s*16807) % 2147483647)/2147483647;
  if (kind === 'hole'){ const g = x.createRadialGradient(64, 64, 0, 64, 64, 60); g.addColorStop(0, 'rgba(8,7,6,1)'); g.addColorStop(.14, 'rgba(18,15,12,.95)'); g.addColorStop(.3, 'rgba(60,55,48,.5)'); g.addColorStop(1, 'rgba(60,55,48,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(20,18,15,.55)'; x.lineWidth = 1.5; for (let i = 0; i < 8; i++){ const a = R()*6.283, l = 16 + R()*34; x.beginPath(); x.moveTo(64 + Math.cos(a)*8, 64 + Math.sin(a)*8); x.lineTo(64 + Math.cos(a + (R() - .5)*.5)*l, 64 + Math.sin(a + (R() - .5)*.5)*l); x.stroke(); } }
  else { for (let i = 0; i < 80; i++){ const a = R()*6.283, d = Math.pow(R(), .8)*42, px = 64 + Math.cos(a)*d, py = 64 + Math.sin(a)*d, r = 10 + R()*24*(1 - d/58), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(12,10,8,${.22 + R()*.2})`); g.addColorStop(1, 'rgba(12,10,8,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function initFx(){
  FX.max = E.hq ? 3000 : 1200; FX.rate = E.hq ? 1 : .5;
  FX.U = { map: { value: atlas() }, uScale: { value: 400 }, uMaxP: { value: 512 }, uLight: { value: new THREE.Color(1, 1, 1) }, fCol: { value: E.fogCol.clone() }, fDen: { value: .004 } };
  try { const gl = E.r.getContext(), r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); if (r && r[1]) FX.U.uMaxP.value = Math.min(1024, r[1]); } catch (e){}
  FX.cN = cloud(false); FX.cA = cloud(true);
  const pg = new THREE.PlaneGeometry(1, 1), dm = t => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mk = (t, n) => { const o = new THREE.InstancedMesh(pg, dm(t), n); o.count = 0; o.frustumCulled = false; o.renderOrder = 2; o.receiveShadow = true; E.scene.add(o); return { o, n, i: 0, used: 0, pos: [] }; };
  FX.dec = { hole: mk(decalTex('hole'), E.hq ? 600 : 250), scorch: mk(decalTex('scorch'), 120) }; FX.dec.scorch.o.material.opacity = .75;
  FX.light = new THREE.PointLight(0xff8a3a, 0, 30, 2); E.scene.add(FX.light); FX.lightT = 0;
}
export { FX };
export function P(t, x, y, z, o){
  if (FX.P.length >= FX.max) return;
  FX.P.push(Object.assign({ t, x, y, z, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: .5, s1: 1, r: Math.random()*6.28, vr: (Math.random() - .5)*.6, f: t === 1 ? 2 : t === 2 ? 2 : t === 5 ? 3 : Math.random() < .5 ? 0 : 1, a: 1, g: 0, drag: .5,
    add: t === 1 || t === 2, c0: col('#ffffff'), c1: col('#ffffff'), wind: t === 0 ? 1 : t === 3 ? .5 : 0 }, o));
}
const rnd = (a, b) => a + Math.random()*(b - a);
export const fx = {
  fire(x, y, z, k){ P(1, x + rnd(-.3, .3)*k, y, z + rnd(-.3, .3)*k, { vy: rnd(1.5, 3), vx: rnd(-.3, .3), vz: rnd(-.3, .3), life: rnd(.4, .8), s0: rnd(.8, 1.4)*k, s1: .25*k, vr: 0, c0: col('#ffe08a'), c1: col('#d8300a'), drag: .2 }); },
  smoke(x, y, z, k, dark){ P(0, x + rnd(-.5, .5)*k, y, z + rnd(-.5, .5)*k, { vy: rnd(.8, 1.6), vx: rnd(-.3, .3), vz: rnd(-.3, .3), life: rnd(4, 8), s0: k, s1: k*rnd(4, 6), a: dark ? .8 : .55, c0: col(dark ? '#2a2724' : '#6e6a64'), c1: col(dark ? '#5a5650' : '#a4a098'), drag: .35 }); },
  dust(x, y, z, k, n){ for (let i = 0; i < (n || 4); i++) P(3, x, y, z, { vx: rnd(-1, 1)*k, vz: rnd(-1, 1)*k, vy: rnd(.2, 1.2)*k, g: 1.2, life: rnd(1, 2.4), s0: .3*k, s1: 1.6*k, a: .65, c0: col('#9a9184'), c1: col('#b8b2a6'), drag: 1.8 }); },
  chips(x, y, z, nx, ny, nz, n, c){ for (let i = 0; i < n; i++) P(5, x, y, z, { vx: nx*rnd(1, 4) + rnd(-1.5, 1.5), vy: ny*rnd(1, 4) + rnd(0, 2.5), vz: nz*rnd(1, 4) + rnd(-1.5, 1.5), g: 9.8, life: rnd(.6, 1.4), s0: rnd(.05, .12), s1: .05, a: 1, add: false, vr: rnd(-8, 8), c0: col(c || '#6e6860'), c1: col(c || '#6e6860'), drag: .4 }); },
  sparks(x, y, z, nx, ny, nz, n){ for (let i = 0; i < n; i++) P(2, x, y, z, { vx: nx*rnd(1, 5) + rnd(-2, 2), vy: ny*rnd(1, 5) + rnd(0, 3), vz: nz*rnd(1, 5) + rnd(-2, 2), g: 9.8, life: rnd(.15, .45), s0: .07, s1: .015, c0: col('#ffc060'), c1: col('#c02800'), drag: .3 }); },
  glass(x, y, z, nx, nz, n, big){ for (let i = 0; i < n; i++) P(5, x + rnd(-.25, .25), y + rnd(-.25, .25), z + rnd(-.25, .25), { vx: nx*rnd(.5, 3) + rnd(-1, 1), vy: rnd(-.5, 2), vz: nz*rnd(.5, 3) + rnd(-1, 1), g: 9.8, life: rnd(.8, 1.6)*(big ? 2.4 : 1), s0: big ? rnd(.4, .8) : rnd(.025, .06), s1: big ? .25 : .02, a: big ? .75 : .6, add: false, vr: rnd(-10, 10), c0: col(big ? '#5e6c74' : '#7a8a92'), c1: col('#3c464c'), drag: .2 }); },
  explosion(x, y, z, k){
    for (let i = 0; i < 24*k*FX.rate; i++){ const a = Math.random()*6.283, s = rnd(2, 7)*k; P(1, x, y + .3, z, { vx: Math.cos(a)*s, vz: Math.sin(a)*s, vy: rnd(1, 6)*k, life: rnd(.3, .7), s0: rnd(1.6, 3)*k, s1: .5*k, f: 2, c0: col('#ffd890'), c1: col('#b82a08'), drag: 4 }); }
    for (let i = 0; i < 16*k*FX.rate; i++){ const a = Math.random()*6.283, s = rnd(.5, 2.5)*k; P(0, x, y + .4, z, { vx: Math.cos(a)*s, vz: Math.sin(a)*s, vy: rnd(.6, 2.2), life: rnd(5, 9), s0: 1.6*k, s1: rnd(5, 8)*k, a: .7, c0: col('#3a3530'), c1: col('#8a857c'), drag: 1.4 }); }
    for (let i = 0; i < 26*k*FX.rate; i++) P(2, x, y + .3, z, { vx: rnd(-8, 8)*k, vz: rnd(-8, 8)*k, vy: rnd(2, 9), g: 9.8, life: rnd(.4, 1.1), s0: .08, s1: .02, c0: col('#ffb048'), c1: col('#b02000'), drag: .6 });
    FX.light.position.set(x, y + 1.5, z); FX.light.intensity = 80*k; FX.lightT = .25;
  },
  // dammvägg när en byggnad rasar (BF4): tät, låg, sveper ut åt alla håll
  dustWall(x, y, z, r, k){
    // mörk kärna som väller uppåt
    for (let i = 0; i < 60*FX.rate*k; i++){ const a = Math.random()*6.283, d = Math.random()*r*.5; P(0, x + Math.cos(a)*d, y + rnd(2, 18), z + Math.sin(a)*d, { vx: Math.cos(a)*rnd(.5, 2), vz: Math.sin(a)*rnd(.5, 2), vy: rnd(1.5, 5), life: rnd(10, 18), s0: rnd(5, 8), s1: rnd(16, 26), a: .7, c0: col('#262524'), c1: col('#5e5c5a'), drag: .25 }); }
    // ljus front som rullar ut längs gatan
    for (let i = 0; i < 110*FX.rate*k; i++){ const a = Math.random()*6.283, d = r*.4 + Math.random()*r*.3, s = rnd(4, 10); P(0, x + Math.cos(a)*d, y + rnd(0, 3), z + Math.sin(a)*d, { vx: Math.cos(a)*s, vz: Math.sin(a)*s, vy: rnd(.1, 1.2), life: rnd(8, 14), s0: rnd(3, 5), s1: rnd(10, 16), a: .55, c0: col('#4a4846'), c1: col('#83807c'), drag: .55 }); }
  },
  // låg, tät dammfront som rullar ut längs marken (40–80 m)
  dustFront(x, y, z, r, k){
    for (let i = 0; i < 40*FX.rate*k; i++){ const a = Math.random()*6.283, s = rnd(7, 16); P(0, x + Math.cos(a)*r, y + rnd(.3, 2.5), z + Math.sin(a)*r, { vx: Math.cos(a)*s, vz: Math.sin(a)*s, vy: rnd(0, .5), life: rnd(9, 15), s0: rnd(4, 7), s1: rnd(16, 24), a: .5, c0: col('#5c5a57'), c1: col('#8e8b86'), drag: .32, wind: .3 }); }
  },
  decal(kind, p, n, size){
    const D = FX.dec[kind], m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random()*6.283));
    m.compose(new THREE.Vector3(p.x + n.x*.012, p.y + n.y*.012, p.z + n.z*.012), q, new THREE.Vector3(size, size, size));
    D.o.setMatrixAt(D.i, m); D.pos[D.i] = [p.x, p.y, p.z]; D.i = (D.i + 1) % D.n; D.used = Math.min(D.n, D.used + 1); D.o.count = D.used; D.o.instanceMatrix.needsUpdate = true;
  },
  // ta bort dekaler där en vägg försvann
  clearDecals(x, y, z, r){ const z0 = new THREE.Matrix4().makeScale(0, 0, 0); for (const k in FX.dec){ const D = FX.dec[k]; let ch = false; for (let i = 0; i < D.used; i++){ const p = D.pos[i]; if (p && (p[0] - x)**2 + (p[1] - y)**2 + (p[2] - z)**2 < r*r){ D.o.setMatrixAt(i, z0); D.pos[i] = null; ch = true; } } if (ch) D.o.instanceMatrix.needsUpdate = true; } },
  reset(){ FX.P.length = 0; for (const k in FX.dec){ const D = FX.dec[k]; D.i = 0; D.used = 0; D.o.count = 0; } },
};
export function updateFx(dt){
  const P = FX.P, w = FX.wind;
  FX.U.uScale.value = E.r.domElement.height/(2*Math.tan(E.cam.fov*Math.PI/360)); FX.U.fCol.value.copy(E.scene.fog.color); FX.U.fDen.value = E.scene.fog.density;
  if (FX.lightT > 0){ FX.lightT -= dt; FX.light.intensity *= .86; } else FX.light.intensity = 0;
  for (let i = P.length - 1; i >= 0; i--){
    const p = P[i]; p.age += dt; if (p.age >= p.life){ P[i] = P[P.length - 1]; P.pop(); continue; }
    const dr = Math.exp(-p.drag*dt); p.vx = p.vx*dr + w.x*p.wind*dt; p.vz = p.vz*dr + w.z*p.wind*dt; p.vy = p.vy*dr - p.g*dt;
    p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.r += p.vr*dt; const gy = FX.groundAt ? FX.groundAt(p.x, p.z) : 0; if (p.g > 0 && p.y < gy + .02){ p.y = gy + .02; p.vy *= -.2; p.vx *= .5; p.vz *= .5; }
  }
  const cam = E.cam.position, N = [], A = [];
  for (const p of P) (p.add ? A : N).push(p);
  for (const p of N) p.d = (p.x - cam.x)**2 + (p.y - cam.y)**2 + (p.z - cam.z)**2; N.sort((a, b) => b.d - a.d);
  const up = (C, L) => {
    const n = Math.min(L.length, FX.max), at = C.g.attributes, pa = at.position.array, sa = at.size.array, ca = at.pc.array, ra = at.pr.array;
    for (let i = 0; i < n; i++){ const p = L[i], k = p.age/p.life, al = p.a*Math.min(1, k*10)*(1 - k);
      pa[i*3] = p.x; pa[i*3 + 1] = p.y; pa[i*3 + 2] = p.z; sa[i] = p.s0 + (p.s1 - p.s0)*(p.t === 0 || p.t === 3 ? 1 - (1 - k)*(1 - k) : k);
      ca[i*4] = p.c0.r + (p.c1.r - p.c0.r)*k; ca[i*4 + 1] = p.c0.g + (p.c1.g - p.c0.g)*k; ca[i*4 + 2] = p.c0.b + (p.c1.b - p.c0.b)*k; ca[i*4 + 3] = al; ra[i*2] = p.r; ra[i*2 + 1] = p.f; }
    C.g.setDrawRange(0, n); for (const a of ['position', 'size', 'pc', 'pr']) at[a].needsUpdate = true;
  };
  up(FX.cN, N); up(FX.cA, A);
}
