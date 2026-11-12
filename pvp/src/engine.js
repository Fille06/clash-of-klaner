// Motor: renderare, scen, kamera, ljus, HDR-himmel, dis och efterbehandling (GTAO, glöd, ACES, SMAA).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const E = { hq: !(matchMedia('(pointer: coarse)').matches), time: 0, texBase: 'tex/', FX_LAYER: 1 };
import { Pass } from 'three/addons/postprocessing/Pass.js';
class FxPass extends Pass {
  constructor(scene, cam){ super(); this.scene = scene; this.cam = cam; this.needsSwap = false; this.depth = new THREE.MeshDepthMaterial(); this.depth.colorWrite = false; }
  render(r, wb, rb){
    const s = this.scene, c = this.cam, bg = s.background, fog = s.fog, ac = r.autoClear;
    r.setRenderTarget(this.renderToScreen ? null : rb); r.autoClear = false; r.clearDepth();
    s.background = null; s.overrideMaterial = this.depth; c.layers.set(0); r.render(s, c);
    s.overrideMaterial = null; c.layers.set(E.FX_LAYER); r.render(s, c);
    c.layers.set(0); s.background = bg; s.fog = fog; r.autoClear = ac;
  }
}

export function initEngine(canvas){
  // ?test: bilden sparas mellan bilder så att skärmdumpar fungerar när webbläsaren pausar animationen
  const r = E.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: location.search.includes('test') });
  r.setPixelRatio(Math.min(devicePixelRatio, E.hq ? 1.5 : 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.32;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const s = E.scene = new THREE.Scene();
  E.cam = new THREE.PerspectiveCamera(70, 16/9, .05, 1500); s.add(E.cam);
  // dis som på Shanghai-kartan: ljust och blågrått
  E.fogCol = new THREE.Color(0xb8b3a9); E.fogBase = .0036; s.fog = new THREE.FogExp2(E.fogCol, E.fogBase); E.fogBoost = 0;
  E.hemi = new THREE.HemisphereLight(0xd6dce2, 0x8a7a66, .85); s.add(E.hemi);
  // lägre, varmare sol snett bakifrån – disigt motljus som på Shanghai-kartan
  const sun = E.sun = new THREE.DirectionalLight(0xffd9b0, 3.4); sun.position.set(-110, 48, -60); s.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(E.hq ? 4096 : 2048, E.hq ? 4096 : 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  E.sunDir = sun.position.clone().normalize();
  // efterbehandling
  const c = E.comp = new EffectComposer(r);
  c.addPass(new RenderPass(s, E.cam));
  if (E.hq){ const ao = E.ao = new GTAOPass(s, E.cam, 1280, 720); ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.3, thickness: 1.5, scale: 1.1, samples: 16 }); ao.blendIntensity = .9; c.addPass(ao); }
  // partiklar ritas efter GTAO (som annars döljer dem): djupet ritas om först, sedan partikellagret ovanpå
  c.addPass(new FxPass(s, E.cam));
  E.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), .28, .5, .92); c.addPass(E.bloom);
  // färgtoning: lätt kall i skuggor, varm i ljus, vinjett – Frostbite-känsla
  E.grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uVig: { value: .3 }, uSat: { value: .9 }, uCon: { value: 1.1 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uCon, uFlash; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(.2126, .7152, .0722));
        c = mix(vec3(l), c, uSat); c = mix(c*vec3(.96, 1., 1.05), c*vec3(1.04, 1., .95), smoothstep(.1, .7, l));
        c = (c - .5)*uCon + .5; vec2 d = vUv - .5; c *= 1. - uVig*dot(d, d)*2.2; c += uFlash; gl_FragColor = vec4(max(c, 0.), 1.); }` });
  c.addPass(new OutputPass());
  c.addPass(E.grade);
  if (E.hq) c.addPass(E.smaa = new SMAAPass());
  addEventListener('resize', resize); resize();
}
export function resize(){
  const w = innerWidth, h = innerHeight; E.r.setSize(w, h, false); E.comp.setSize(w, h); E.cam.aspect = w/h; E.cam.updateProjectionMatrix();
  if (E.ao) E.ao.setSize(w*E.r.getPixelRatio(), h*E.r.getPixelRatio());
}
export function loadSky(name){
  return new Promise(res => new HDRLoader().load(E.texBase + name, t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(E.r); E.env = pm.fromEquirectangular(t).texture; pm.dispose();
    E.scene.environment = E.env; E.scene.environmentIntensity = 1.0;
    // himmelskupol: HDR-himlen avmättad och blandad med diset mot horisonten
    E.skyU = { t: { value: t }, fogC: { value: E.fogCol }, sat: { value: .3 }, inten: { value: 1.18 } };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), new THREE.ShaderMaterial({ uniforms: E.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.); gl_Position = p.xyww; }',
      fragmentShader: `uniform sampler2D t; uniform vec3 fogC; uniform float sat, inten; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); vec2 uv = vec2(atan(d.z, d.x)*0.15915 + .5, asin(clamp(d.y, -1., 1.))*0.31831 + .5);
          vec3 c = texture2D(t, uv).rgb*inten; float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, sat);
          float h = smoothstep(-.02, .55, d.y); c = mix(fogC*1.32, c, h); c = mix(c, vec3(.52, .56, .6)*inten, smoothstep(.45, .95, d.y)*.18); gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }` }));
    dome.renderOrder = -100; dome.frustumCulled = false; E.scene.add(dome); E.dome = dome; E.scene.background = null; res();
  }, undefined, () => { E.scene.background = E.fogCol; res(); }));
}
const texCache = new Map();
export function tex(name, srgb, rep){
  const k = name + (srgb ? 's' : ''); if (texCache.has(k)) return texCache.get(k);
  const t = new THREE.TextureLoader().load(E.texBase + name); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = E.hq ? 8 : 2;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.repeat.set(rep, rep); texCache.set(k, t); return t;
}
// PBR-material från Poly Haven (diffus, normal, grovhet)
export function pbr(id, o = {}){
  const m = new THREE.MeshStandardMaterial({ map: tex(id + '_diff.jpg', true), normalMap: tex(id + '_nor.jpg'), roughnessMap: tex(id + '_rough.jpg'), roughness: 1, metalness: o.metal || 0, color: o.color || 0xffffff });
  m.normalScale.set(o.ns || 1, o.ns || 1); if (o.tri) triplanar(m, o.tri); return m;
}
// världsrums-texturering (triplanar) så att väggar av många små celler ser ut som en hel yta, även med hål i
export function triplanar(m, scale){
  m.onBeforeCompile = sh => {
    sh.uniforms.uTri = { value: 1/scale };
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 wp4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix*wp4;
      #endif
      vWP = (modelMatrix*wp4).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);`);
    const tri = s => `vec4 triS(sampler2D t){ vec3 b = pow(abs(vWN), vec3(4.)); b /= (b.x + b.y + b.z); vec3 p = vWP*uTri;
      return texture2D(t, p.zy)*b.x + texture2D(t, p.xz)*b.y + texture2D(t, p.xy)*b.z; }`;
    sh.fragmentShader = 'uniform float uTri; varying vec3 vWP; varying vec3 vWN;\n' + tri() + '\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor *= triS(map);\n#endif')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n roughnessFactor *= triS(roughnessMap).g;\n#endif')
      .replace('#include <normal_fragment_maps>', '#ifdef USE_NORMALMAP_TANGENTSPACE\n { vec3 mapN = triS(normalMap).xyz*2. - 1.; mapN.xy *= normalScale; normal = normalize(normal + (mapN.x*0.5)*normalize(cross(normal, vec3(0.,1.,0.001))) + (mapN.y*0.5)*normalize(cross(normal, vec3(1.,0.001,0.)))); }\n#endif');
  };
  m.customProgramCacheKey = () => 'tri' + scale;
  return m;
}
// skuggkameran följer spelaren
export function followSun(p){
  const s = E.sun, snap = 4, x = Math.round(p.x/snap)*snap, z = Math.round(p.z/snap)*snap;
  s.target.position.set(x, 0, z); s.position.set(x, 0, z).addScaledVector(E.sunDir, 160); s.target.updateMatrixWorld();
}
// skuggkartan ritas en gång per bild (inte i varje extra pass)
export function render(dt){
  E.time += dt;
  // efter ett stort ras ligger dammet kvar över kartan och lättar sakta (BF4)
  if (E.fogTarget > 0){ E.fogBoost = Math.min(E.fogTarget, E.fogBoost + dt/14); E.fogT = (E.fogT || 0) + dt; if (E.fogT > 22){ E.fogTarget = 0; E.fogT = 0; } } else E.fogBoost = Math.max(0, E.fogBoost - dt/50);
  E.scene.fog.density = E.fogBase*(1 + E.fogBoost*2.6); if (E.dome) E.dome.position.copy(E.cam.position);
  // efter raset blir staden grå och himlen mörknar (BF4:s väderskifte), sedan ljusnar det sakta igen
  if (!E.fogCol0){ E.fogCol0 = E.fogCol.clone(); E.fogGrey = new THREE.Color(0x7e7d7b); }
  const k = Math.min(1, E.fogBoost); E.fogCol.copy(E.fogCol0).lerp(E.fogGrey, k*.75); E.scene.fog.color.copy(E.fogCol);
  if (E.skyU){ E.skyU.inten.value = 1.18*(1 - .4*k); E.skyU.sat.value = .3*(1 - .6*k); }
  E.r.toneMappingExposure = 1.32*(1 - .12*k); if (E.hemi) E.hemi.intensity = .85*(1 - .25*k);
  E.r.shadowMap.autoUpdate = false; E.r.shadowMap.needsUpdate = true; E.comp.render(dt);
}
