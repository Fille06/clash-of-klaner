// TERRÄNG under basen – höjdkarta (1 m), skog (2 m-rutor) och vatten under havsnivån.
// Tomten (±ED m) formas med penslar i basbyggaren; utanför tonar marken ut i naturliga kullar och skog.
// Fysik: Rapier-höjdfält + stammar. Byggnader står på planad mark med betongsockel.
import * as THREE from 'three';
import { E, pbr, tex } from './engine.js';
import { R, PH } from './physics.js';
import { FX } from './fx.js';

const ED = 40, NE = ED*2 + 1, FC = 2;
let HALF = 80, N = HALF*2 + 1, FN = HALF*2/FC;
export const T = { h: new Float32Array(N*N), f: new Uint8Array(FN*FN), plots: [{ x: 0, z: 0 }], sea: -1.2, feet: [], mesh: null, water: null, trees: null, col: null, undo: [], redo: [], dirtyF: false, seed: 7 };
const id = (i, k) => k*N + i, fid = (i, k) => k*FN + i;
const hash = (x, z, s = 0) => { const v = Math.sin(x*127.1 + z*311.7 + s*74.7)*43758.5453; return v - Math.floor(v); };
const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx*fx*(3 - 2*fx), w = fz*fz*(3 - 2*fz);
  return (hash(xi, zi)*(1 - u) + hash(xi + 1, zi)*u)*(1 - w) + (hash(xi, zi + 1)*(1 - u) + hash(xi + 1, zi + 1)*u)*w; };
const fbm = (x, z) => vnoise(x/23, z/23)*.6 + vnoise(x/9, z/9)*.3 + vnoise(x/4, z/4)*.1;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a)/(b - a))); return t*t*(3 - 2*t); };
export const editable = (x, z) => Math.abs(x) <= ED && Math.abs(z) <= ED;
// MATCHKARTA: större terräng med flera tomter (bas mot bas). plots = tomternas mittpunkter; tomt 0 är alltid i origo.
export function terSetup(half, plots){
  HALF = half; N = HALF*2 + 1; FN = HALF*2/FC;
  T.h = new Float32Array(N*N); T.f = new Uint8Array(FN*FN); T.plots = plots || [{ x: 0, z: 0 }];
}
export const terHalf = () => HALF;
// avstånd utanför närmaste tomt (≤ 0 = på en tomt) och vilken tomt
function plotDist(x, z){ let best = Infinity, pi = 0; T.plots.forEach((p, i) => { const d = Math.max(Math.abs(x - p.x) - ED, Math.abs(z - p.z) - ED); if (d < best){ best = d; pi = i; } }); return [best, pi]; }
export const TER_ED = ED;

// höjd i meter (bilinjär)
export function hAt(x, z){
  const gx = Math.max(0, Math.min(N - 1.001, x + HALF)), gz = Math.max(0, Math.min(N - 1.001, z + HALF)), i = Math.floor(gx), k = Math.floor(gz), u = gx - i, w = gz - k, h = T.h;
  return (h[id(i, k)]*(1 - u) + h[id(i + 1, k)]*u)*(1 - w) + (h[id(i, k + 1)]*(1 - u) + h[id(i + 1, k + 1)]*u)*w;
}
export const isWater = (x, z) => hAt(x, z) < T.sea + .05;
export const forestAt = (x, z) => { const i = Math.floor((x + HALF)/FC), k = Math.floor((z + HALF)/FC); return i >= 0 && k >= 0 && i < FN && k < FN ? T.f[fid(i, k)] : 0; };

// utanför tomten: kanten tonar ut mot noll med kullar och skog (samma för alla, ingen del av sparningen)
function outer(){
  const h = T.h;
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++){
    const x = i - HALF, z = k - HALF, [d, pi] = plotDist(x, z); if (d <= 0) continue;
    const P = T.plots[pi], ci = Math.round(P.x) + HALF, ck = Math.round(P.z) + HALF;
    const e = h[id(Math.max(ci - ED, Math.min(ci + ED, i)), Math.max(ck - ED, Math.min(ck + ED, k)))];
    const f = 1 - sstep(0, 26, d), amp = 7*sstep(2, 16, d)*(1 - sstep(30, 40, d));
    h[id(i, k)] = e*f + Math.max(0, fbm(x, z) - .25)*amp*1.6;
  }
  for (let k = 0; k < FN; k++) for (let i = 0; i < FN; i++){
    const x = (i + .5)*FC - HALF, z = (k + .5)*FC - HALF, [d] = plotDist(x, z); if (d <= 0) continue;
    // mellan två tomter (bas mot bas) lämnas ett öppet stråk utan skog
    const lane = T.plots.length > 1 && Math.abs(x) < 26 && z < T.plots[0].z && z > T.plots[T.plots.length - 1].z;
    T.f[fid(i, k)] = !lane && d > 4 && vnoise(x/14 + 50, z/14) > .42 ? 1 : 0;
  }
}
// sparning: bara tomten. Höjder i 0,1 m (int16) + skog som bitar → komprimeras i baskoden
export function terSave(){
  const H = new Int16Array(NE*NE); for (let k = 0; k < NE; k++) for (let i = 0; i < NE; i++) H[k*NE + i] = Math.round(T.h[id(i + HALF - ED, k + HALF - ED)]*10);
  const FE = ED*2/FC, F = new Uint8Array(Math.ceil(FE*FE/8)); for (let k = 0; k < FE; k++) for (let i = 0; i < FE; i++) if (T.f[fid(i + (HALF - ED)/FC, k + (HALF - ED)/FC)]) { const n = k*FE + i; F[n >> 3] |= 1 << (n & 7); }
  return { h: b64(new Uint8Array(H.buffer)), f: b64(F), sea: T.sea };
}
// vrider en sparad terräng 180° (bas mot bas: basen på tomt 1 vänds så att fronten pekar mot fienden)
export function terRot180(s){
  if (!s || !s.h) return s;
  const hb = unb64(s.h), H = new Int16Array(hb.buffer, hb.byteOffset, Math.floor(hb.length/2)), H2 = new Int16Array(H.length); for (let i = 0; i < H.length; i++) H2[i] = H[H.length - 1 - i];
  const FE = ED*2/FC, n = FE*FE, F = unb64(s.f || ''), F2 = new Uint8Array(Math.ceil(n/8)); for (let i = 0; i < n; i++){ const j = n - 1 - i; if (F[i >> 3] & (1 << (i & 7))) F2[j >> 3] |= 1 << (j & 7); }
  return { h: b64(new Uint8Array(H2.buffer)), f: b64(F2), sea: s.sea };
}
// kontrollerar en sparad terräng (baskoder kan komma från vem som helst): rätt längd, rimliga höjder och havsnivå
export function terValid(s){
  if (!s) return true;
  if (typeof s !== 'object') return false;
  if (s.sea != null && !(typeof s.sea === 'number' && Number.isFinite(s.sea) && s.sea >= -6 && s.sea <= 6)) return false;
  try {
    if (s.h != null){ const u = unb64(String(s.h)); if (u.length !== NE*NE*2) return false; const H = new Int16Array(u.buffer); for (let i = 0; i < H.length; i++) if (H[i] < -80 || H[i] > 220) return false; }
    if (s.f != null){ const FE = ED*2/FC; if (unb64(String(s.f)).length > Math.ceil(FE*FE/8)) return false; }
  } catch (e){ return false; }
  return true;
}
export function terLoad(s, extra){
  if (!terValid(s)) s = null;
  T.h.fill(0); T.f.fill(0); T.sea = s && s.sea != null ? s.sea : -1.2;
  // fler tomter (bas mot bas): deras höjder läggs in på sina platser; havsnivån tas från tomt 0
  for (let n = 1; n < T.plots.length; n++){ const e = extra && extra[n - 1]; if (!e || !terValid(e) || !e.h) continue; const H = new Int16Array(unb64(e.h).buffer), P = T.plots[n];
    for (let k = 0; k < NE; k++) for (let i = 0; i < NE; i++){ const gi = i + HALF - ED + Math.round(P.x), gk = k + HALF - ED + Math.round(P.z); if (gi >= 0 && gk >= 0 && gi < N && gk < N) T.h[id(gi, gk)] = Math.max(H[k*NE + i]/10, T.sea - 2.5); } }
  if (s && s.h){ const H = new Int16Array(unb64(s.h).buffer); for (let k = 0; k < NE; k++) for (let i = 0; i < NE; i++) T.h[id(i + HALF - ED, k + HALF - ED)] = H[k*NE + i]/10;
    const FE = ED*2/FC, F = unb64(s.f || ''); for (let k = 0; k < FE; k++) for (let i = 0; i < FE; i++){ const n = k*FE + i; if (F[n >> 3] & (1 << (n & 7))) T.f[fid(i + (HALF - ED)/FC, k + (HALF - ED)/FC)] = 1; } }
  outer();
}
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

// MALLAR – startterräng för tomten
export function terPreset(name){
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++){
    const x = i - HALF, z = k - HALF; if (!editable(x, z)) continue; let v = 0; const r = Math.hypot(x, z);
    if (name === 'kulle') v = 7*Math.exp(-(r*r)/(2*16*16)) + (fbm(x + 9, z)*1.2 - .6);
    else if (name === 'sjo') v = -3.2*Math.exp(-((x + 18)**2 + (z - 14)**2)/(2*9*9)) + fbm(x, z)*1.4 - .2 + Math.max(0, -z - 20)*.12;
    else if (name === 'plata') v = 5*sstep(26, 18, Math.max(Math.abs(x), Math.abs(z))) + fbm(x, z)*.6;
    else if (name === 'dal') v = Math.abs(x)*.16 + (Math.abs(x) < 4 ? -2.6*(1 - Math.abs(x)/4) : 0) + fbm(x, z)*.8;
    T.h[id(i, k)] = v;
  }
  if (name === 'platt') for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) if (editable(i - HALF, k - HALF)) T.h[id(i, k)] = 0;
  for (let k = 0; k < FN; k++) for (let i = 0; i < FN; i++){ const x = (i + .5)*FC - HALF, z = (k + .5)*FC - HALF; if (!editable(x, z)) continue;
    T.f[fid(i, k)] = name === 'platt' ? 0 : (Math.max(Math.abs(x), Math.abs(z)) > 26 && vnoise(x/10 + 3, z/10) > .5 ? 1 : 0); }
  protectFeet(); outer(); terRefresh(true);
}

// PENSLAR: höj, sänk, plana, jämna, vatten, skog, röj. r = radie i m, s = styrka
const inFoot = (x, z, m = 1) => T.feet.some(f => x > f[0] - m && x < f[2] + m && z > f[1] - m && z < f[3] + m);
export function terBrush(tool, cx, cz, r, dt){
  const h = T.h;
  // radera: marken går tillbaka till plan grundnivå (0 m), skog och vatten under penseln försvinner
  if (tool === 'radera') terBrush('roj', cx, cz, r, dt);
  if (tool === 'skog' || tool === 'roj'){
    for (let k = 0; k < FN; k++) for (let i = 0; i < FN; i++){ const x = (i + .5)*FC - HALF, z = (k + .5)*FC - HALF; if (!editable(x, z) || Math.hypot(x - cx, z - cz) > r) continue;
      const v = tool === 'skog' && !inFoot(x, z) && hAt(x, z) > T.sea + .2 ? 1 : 0; if (T.f[fid(i, k)] !== v){ T.f[fid(i, k)] = v; T.dirtyF = true; } }
    return;
  }
  const i0 = Math.max(0, Math.floor(cx - r + HALF)), i1 = Math.min(N - 1, Math.ceil(cx + r + HALF)), k0 = Math.max(0, Math.floor(cz - r + HALF)), k1 = Math.min(N - 1, Math.ceil(cz + r + HALF));
  const tgt = T.flatH != null ? T.flatH : hAt(cx, cz), src = tool === 'jamna' ? h.slice() : null;
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++){
    const x = i - HALF, z = k - HALF, d = Math.hypot(x - cx, z - cz); if (d > r || !editable(x, z) || inFoot(x, z, .5)) continue;
    const f = .5 + .5*Math.cos(Math.PI*d/r), n = id(i, k);
    if (tool === 'hoj') h[n] += 3.5*dt*f;
    else if (tool === 'sank') h[n] -= 3.5*dt*f;
    else if (tool === 'plana') h[n] += (tgt - h[n])*Math.min(1, dt*6*f);
    else if (tool === 'vatten') h[n] += (T.sea - 1.8 - h[n])*Math.min(1, dt*3*f);
    else if (tool === 'radera') h[n] += (0 - h[n])*Math.min(1, dt*14*f);
    // DIKE: gräv ner till 1,6 m under där du började (skyttegrav), VALL: bygg upp till 1,6 m över
    else if (tool === 'dike'){ const g = tgt - 1.6; if (h[n] > g) h[n] += (g - h[n])*Math.min(1, dt*6*f); }
    else if (tool === 'vall'){ const g = tgt + 1.6; if (h[n] < g) h[n] += (g - h[n])*Math.min(1, dt*6*f); }
    // TERRASS: marken lägger sig i hela metersteg
    else if (tool === 'terrass') h[n] += (Math.round(h[n]) - h[n])*Math.min(1, dt*5*f);
    // KRATER: skålformad grop (2,5 m djup i mitten) med en liten vall runt kanten
    else if (tool === 'krater'){ const q = d/r, g = q < .8 ? tgt - 2.5*(1 - (q/.8)**2) : tgt + .6*Math.sin((q - .8)/.2*Math.PI); h[n] += (g - h[n])*Math.min(1, dt*4); }
    else if (tool === 'jamna'){ const a = (src[id(Math.max(0, i - 1), k)] + src[id(Math.min(N - 1, i + 1), k)] + src[id(i, Math.max(0, k - 1))] + src[id(i, Math.min(N - 1, k + 1))])/4; h[n] += (a - h[n])*Math.min(1, dt*8*f); }
    h[n] = Math.max(-8, Math.min(22, h[n]));
    if (h[n] < T.sea + .1){ const fi = Math.floor((x + HALF)/FC), fk = Math.floor((z + HALF)/FC); if (fi < FN && fk < FN && T.f[fid(fi, fk)]){ T.f[fid(fi, fk)] = 0; T.dirtyF = true; } }
  }
  T.dirtyH = true;
}
// byggplats: medelhöjd över fotavtrycket, plana den och tona ut kanten (1,5 m). Ger höjden byggnaden ska stå på.
export function footHeight(x, z, w, d){ let s = 0, n = 0; for (let zz = z - d/2; zz <= z + d/2 + .01; zz += 1) for (let xx = x - w/2; xx <= x + w/2 + .01; xx += 1){ s += hAt(xx, zz); n++; } return Math.round(s/n*10)/10; }
export function footWater(x, z, w, d){ let n = 0, m = 0; for (let zz = z - d/2; zz <= z + d/2 + .01; zz += 1) for (let xx = x - w/2; xx <= x + w/2 + .01; xx += 1){ m++; if (isWater(xx, zz)) n++; } return n/m; }
export function flattenFoot(x, z, w, d, y){
  const M = 2.5, h = T.h;
  for (let k = Math.floor(z - d/2 - M + HALF); k <= Math.ceil(z + d/2 + M + HALF); k++) for (let i = Math.floor(x - w/2 - M + HALF); i <= Math.ceil(x + w/2 + M + HALF); i++){
    if (i < 0 || k < 0 || i >= N || k >= N) continue; const px = i - HALF, pz = k - HALF; if (!editable(px, pz)) continue;
    const dx = Math.max(0, Math.abs(px - x) - w/2), dz = Math.max(0, Math.abs(pz - z) - d/2), e = Math.hypot(dx, dz); if (e > M) continue;
    if (e > 0 && T.feet.some(f => px > f[0] - .5 && px < f[2] + .5 && pz > f[1] - .5 && pz < f[3] + .5)) continue;
    const f = e <= .6 ? 1 : 1 - sstep(.6, M, e); h[id(i, k)] += (y - h[id(i, k)])*f;
  }
  for (let k = 0; k < FN; k++) for (let i = 0; i < FN; i++){ const px = (i + .5)*FC - HALF, pz = (k + .5)*FC - HALF; if (Math.abs(px - x) < w/2 + 2 && Math.abs(pz - z) < d/2 + 2) T.f[fid(i, k)] = 0; }
  T.dirtyH = T.dirtyF = true;
}
function protectFeet(){ /* byggnader behåller sin planade mark – planas om av byggaren efter mall */ T.reflatten && T.reflatten(); }
// stråle mot marken (stegning längs höjdkartan) – för musen i byggaren
export function terRay(o, d){
  let t = 0, prev = o.y - hAt(o.x, o.z);
  for (let n = 0; n < 900; n++){ t += .5; const x = o.x + d.x*t, y = o.y + d.y*t, z = o.z + d.z*t, g = y - Math.max(hAt(x, z), T.sea);
    if (g <= 0){ const tt = t - .5*g/(g - prev); return new THREE.Vector3(o.x + d.x*tt, 0, o.z + d.z*tt).setY(Math.max(hAt(o.x + d.x*tt, o.z + d.z*tt), T.sea)); } prev = g; if (y < -20) break; }
  return null;
}

// GRAFIK: markytan blandar gräs, klippa (branter) och lera (strand/botten) i världskoordinater
let MAT = null, WMAT = null, TRM = null;
function terMat(){
  if (MAT) return MAT;
  const g = pbr('aerial_grass_rock'), rock = tex('rocky_terrain_02_diff.jpg', true), mud = tex('brown_mud_leaves_01_diff.jpg', true), rockN = tex('rocky_terrain_02_nor.jpg');
  g.roughnessMap = null; g.roughness = .96; g.map.repeat.set(1, 1); g.normalMap.repeat.set(1, 1);
  g.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tRock: { value: rock }, tMud: { value: mud }, tRockN: { value: rockN }, uSea: { value: T.sea }, uGrid: { value: T.grid ? 1 : 0 }, uPlot: { value: 32 } }); MAT.userData.sh = sh;
    sh.vertexShader = 'attribute vec3 tw; varying vec3 vTw; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vTw = tw; vWP = (modelMatrix*vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D tRock; uniform sampler2D tMud; uniform sampler2D tRockN; uniform float uSea; uniform float uGrid; uniform float uPlot; varying vec3 vTw; varying vec3 vWP;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 uv = vWP.xz/7.0; vec3 gC = texture2D(map, uv).rgb, gC2 = texture2D(map, vWP.xz/31.0 + .37).rgb; gC = mix(gC, gC2, .35);
        vec3 rC = (texture2D(tRock, vWP.xz/9.0).rgb*.5 + texture2D(tRock, vec2(vWP.x + vWP.z, vWP.y)/9.0).rgb*.5), mC = texture2D(tMud, vWP.xz/5.0).rgb;
        float wet = smoothstep(uSea + .6, uSea - .1, vWP.y);
        vec3 col = gC*vTw.x + rC*vTw.y + mC*vTw.z; col *= mix(1.0, .55, wet);
        if (uGrid > .5 && abs(vWP.x) < uPlot && abs(vWP.z) < uPlot){ vec2 gq = abs(fract(vWP.xz/2.0 + .5) - .5)*2.0; float ln = 1.0 - smoothstep(0.0, .06, min(gq.x, gq.y)); col = mix(col, vec3(.55,.85,1.0), ln*.22); }
        diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `{ vec3 nA = texture2D(normalMap, vWP.xz/7.0).xyz*2. - 1., nB = texture2D(tRockN, vWP.xz/9.0).xyz*2. - 1.; vec3 mapN = normalize(mix(nA, nB, vTw.y)); mapN.xy *= normalScale;
        normal = normalize(normal + mapN.x*.6*normalize(cross(normal, vec3(0.,0.,1.))) + mapN.y*.6*normalize(cross(normal, vec3(1.,0.,0.)))); }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(.96, .35, smoothstep(uSea + .5, uSea, vWP.y));');
  };
  g.customProgramCacheKey = () => 'terrain1';
  MAT = g; return g;
}
function waterMat(){
  if (WMAT) return WMAT;
  const n = tex('rocky_terrain_02_nor.jpg');
  WMAT = new THREE.MeshStandardMaterial({ color: 0x1d3640, roughness: .06, metalness: .1, transparent: true, opacity: .86, normalMap: n, normalScale: new THREE.Vector2(.08, .08), envMapIntensity: 1.4 });
  WMAT.onBeforeCompile = sh => { sh.uniforms.uT = { value: 0 }; WMAT.userData.sh = sh; sh.vertexShader = 'varying vec3 vWP2;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP2 = (modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = 'uniform float uT; varying vec3 vWP2;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `{ vec3 a = texture2D(normalMap, vWP2.xz/11. + vec2(uT*.013, uT*.007)).xyz*2. - 1., b = texture2D(normalMap, vWP2.xz/6.5 - vec2(uT*.009, -uT*.011)).xyz*2. - 1.; vec3 mapN = normalize(a + b); mapN.xy *= normalScale;
      normal = normalize(normal + mapN.x*normalize(cross(normal, vec3(0.,0.,1.))) + mapN.y*normalize(cross(normal, vec3(1.,0.,0.)))); }`); };
  WMAT.customProgramCacheKey = () => 'water1'; return WMAT;
}
// barrträd: stam + tre koner, instansade (en mesh för alla stammar, en för alla kronor)
function treeGeo(){
  if (TRM) return TRM;
  const trunk = new THREE.CylinderGeometry(.09, .2, 4, 6).translate(0, 2, 0), crowns = [];
  for (let n = 0; n < 4; n++){ const c = new THREE.ConeGeometry(1.9 - n*.4, 2.6 - n*.25, 8, 1, true).translate(0, 2.1 + n*1.35, 0); const p = c.attributes.position; for (let i = 0; i < p.count; i++){ const y = p.getY(i); if (y < 2 + n*1.35){ p.setX(i, p.getX(i)*(1 + (Math.sin(i*7.1 + n)*.12))); p.setZ(i, p.getZ(i)*(1 + Math.cos(i*5.3 + n)*.12)); p.setY(i, y - .25); } } crowns.push(c); }
  const crown = mergeG(crowns); crown.computeVertexNormals();
  const needles = document.createElement('canvas'); needles.width = needles.height = 128; const x = needles.getContext('2d'); x.fillStyle = '#2c3d22'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++){ const g = 40 + Math.random()*50; x.strokeStyle = `rgb(${g*.55|0},${g|0},${g*.45|0})`; x.lineWidth = 1; const px = Math.random()*128, py = Math.random()*128, a = Math.PI/2 + (Math.random() - .5)*1.2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a)*7, py + Math.sin(a)*7); x.stroke(); }
  const nt = new THREE.CanvasTexture(needles); nt.colorSpace = THREE.SRGBColorSpace; nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(3, 2);
  TRM = { trunk, crown, bark: new THREE.MeshStandardMaterial({ color: 0x3d3026, roughness: .95 }), leaf: new THREE.MeshStandardMaterial({ map: nt, roughness: .9, color: 0xc8d8b8, side: THREE.DoubleSide }) };
  return TRM;
}
function mergeG(list){ // enkel sammanslagning (samma attribut)
  let nv = 0, ni = 0; for (const g of list){ nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv*3), uv = new Float32Array(nv*2), idx = new Uint32Array(ni); let ov = 0, oi = 0;
  for (const g of list){ pos.set(g.attributes.position.array, ov*3); uv.set(g.attributes.uv.array, ov*2); const I = g.index.array; for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + ov; ov += g.attributes.position.count; oi += I.length; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
}

// bygg scenen för terrängen (efter resetWorld)
export function buildTerrain(save, extra){
  terLoad(save, extra); T.feet.length = 0; T.col = null; FX.groundAt = (x, z) => Math.max(hAt(x, z), T.sea);
  const geo = new THREE.PlaneGeometry(HALF*2, HALF*2, N - 1, N - 1); geo.rotateX(-Math.PI/2);
  geo.setAttribute('tw', new THREE.BufferAttribute(new Float32Array(N*N*3), 3));
  T.mesh = new THREE.Mesh(geo, terMat()); T.mesh.receiveShadow = true; T.mesh.castShadow = true; E.scene.add(T.mesh);
  // marken runt omkring med ett hål för terrängen
  const RR = HALF + 180, sh = new THREE.Shape(); sh.moveTo(-RR, -RR); sh.lineTo(RR, -RR); sh.lineTo(RR, RR); sh.lineTo(-RR, RR);
  const hole = new THREE.Path(); hole.moveTo(-HALF + .02, -HALF + .02); hole.lineTo(-HALF + .02, HALF - .02); hole.lineTo(HALF - .02, HALF - .02); hole.lineTo(HALF - .02, -HALF + .02); sh.holes.push(hole);
  const rg = new THREE.ShapeGeometry(sh); rg.rotateX(-Math.PI/2); rg.setAttribute('tw', new THREE.BufferAttribute(new Float32Array(rg.attributes.position.count*3).map((v, i) => i % 3 === 0 ? 1 : 0), 3));
  const ring = new THREE.Mesh(rg, terMat()); ring.receiveShadow = true; E.scene.add(ring);
  const RO = HALF + 90; for (const [x, z, w, d] of [[0, -RO, RO + 90, 90], [0, RO, RO + 90, 90], [-RO, 0, 90, HALF], [RO, 0, 90, HALF]]) PH.world.createCollider(R.ColliderDesc.cuboid(w, .5, d).setTranslation(x, -.5, z), PH.ground);
  T.water = new THREE.Mesh(new THREE.PlaneGeometry(HALF*2, HALF*2).rotateX(-Math.PI/2), waterMat()); T.water.position.y = T.sea; T.water.renderOrder = 2; E.scene.add(T.water);
  const tg = treeGeo(), MX = FN*FN;
  T.trees = [new THREE.InstancedMesh(tg.trunk, tg.bark, MX), new THREE.InstancedMesh(tg.crown, tg.leaf, MX)];
  for (const m of T.trees){ m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; E.scene.add(m); }
  terRefresh(true);
}
// uppdatera mesh (höjder, normaler, blandvikter), vatten och träd
export function terRefresh(all){
  if (!T.mesh) return;
  if (all || T.dirtyH){
    outer(); const g = T.mesh.geometry, p = g.attributes.position, tw = g.attributes.tw;
    for (let n = 0; n < N*N; n++) p.setY(n, T.h[n]);
    p.needsUpdate = true; g.computeVertexNormals(); const nr = g.attributes.normal;
    for (let n = 0; n < N*N; n++){ const ny = nr.getY(n), y = T.h[n], rock = sstep(.86, .7, ny), mud = sstep(T.sea + 1.1, T.sea + .2, y)*(1 - rock); tw.setXYZ(n, Math.max(0, 1 - rock - mud), rock, mud); }
    tw.needsUpdate = true; g.computeBoundingSphere(); T.dirtyH = false; T.dirtyF = true;
  }
  if (all || T.dirtyF){
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color(); let n = 0; T.treeList = [];
    for (let k = 0; k < FN; k++) for (let i = 0; i < FN; i++){ if (!T.f[fid(i, k)]) continue;
      const x = (i + .2 + hash(i, k, 1)*.6)*FC - HALF, z = (k + .2 + hash(i, k, 2)*.6)*FC - HALF, y = hAt(x, z); if (y < T.sea + .15) continue;
      const sc = .75 + hash(i, k, 3)*.65; q.setFromAxisAngle(up, hash(i, k, 4)*6.28); s.set(sc*(.9 + hash(i, k, 5)*.2), sc*(.85 + hash(i, k, 6)*.4), sc); v.set(x, y - .15, z); m4.compose(v, q, s);
      T.trees[0].setMatrixAt(n, m4); T.trees[1].setMatrixAt(n, m4); c.setHSL(.24 + hash(i, k, 7)*.07, .35 + hash(i, k, 8)*.2, .5 + hash(i, k, 9)*.25); T.trees[1].setColorAt(n, c); T.treeList.push([x, y, z, sc]); n++; }
    for (const m of T.trees){ m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    T.dirtyF = false;
  }
}
// fysik: höjdfält + stammar (byggs om när man går in i spelet)
export function terPhysics(){
  if (T.col){ PH.world.removeCollider(T.col, false); T.col = null; }
  const hf = new Float32Array(N*N); for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) hf[i*N + k] = T.h[id(i, k)]; // kolumnvis: rad = z, kolumn = x
  T.col = PH.world.createCollider(R.ColliderDesc.heightfield(N - 1, N - 1, hf, { x: HALF*2, y: 1, z: HALF*2 }), PH.ground);
  for (const [x, y, z, sc] of T.treeList || []) PH.world.createCollider(R.ColliderDesc.cylinder(2*sc, .18*sc).setTranslation(x, y + 2*sc, z), PH.ground);
}
export function terUpdate(dt){ const s = WMAT && WMAT.userData.sh; if (s) s.uniforms.uT.value += dt; const m = MAT && MAT.userData.sh; if (m){ m.uniforms.uGrid.value = T.grid ? 1 : 0; m.uniforms.uPlot.value = T.plot || 32; m.uniforms.uSea.value = T.sea; } if (T.water) T.water.position.y = T.sea; }
