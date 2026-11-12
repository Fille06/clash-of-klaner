// HÄNDER MED HANDSKE för vapnet i förstaperson (BF4-stil): rundad handflata, gummiskydd över knogarna,
// fingrar i tre leder som greppar, tumme med tumvalk, manschett med kardborreband och kamouflageärm.
// Handens eget koordinatsystem: Y = fingrarnas riktning, Z = handryggen, X = bredd. Fingrarna böjs mot -Z (handflatan).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function canvasTex(draw, n = 256){ const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
// läder: fin narv + sömmar (normalkarta), slitage (grovhet)
const leatherN = () => canvasTex((x, n) => { x.fillStyle = 'rgb(128,128,255)'; x.fillRect(0, 0, n, n);
  for (let i = 0; i < 5000; i++){ const v = 118 + Math.random()*20; x.fillStyle = `rgb(${v},${236 - v},250)`; x.fillRect(Math.random()*n, Math.random()*n, 1 + Math.random()*2, 1 + Math.random()*2); }
  x.strokeStyle = 'rgb(96,128,240)'; x.lineWidth = 2; x.setLineDash([4, 3]); for (let k = 0; k < 4; k++){ x.beginPath(); x.moveTo(k*64 + 32, 0); x.lineTo(k*64 + 32, n); x.stroke(); } });
const leatherR = () => canvasTex((x, n) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, n, n); for (let i = 0; i < 900; i++){ const v = 90 + Math.random()*120; x.fillStyle = `rgba(${v},${v},${v},.4)`; x.beginPath(); x.arc(Math.random()*n, Math.random()*n, 1 + Math.random()*5, 0, 7); x.fill(); } });
let MATS = null;
export function handMats(sleeveMap){
  if (MATS) return MATS;
  const n = leatherN(), r = leatherR(); n.repeat.set(3, 3); r.repeat.set(2, 2);
  MATS = {
    glove: new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 1, roughnessMap: r, normalMap: n, normalScale: new THREE.Vector2(.6, .6), envMapIntensity: .8 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: .55, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(.3, .3) }),
    strap: new THREE.MeshStandardMaterial({ color: 0x2e302a, roughness: .9 }),
    sleeve: new THREE.MeshStandardMaterial({ map: sleeveMap || null, color: sleeveMap ? 0xffffff : 0x5a5c46, roughness: .95, normalMap: n, normalScale: new THREE.Vector2(1, 1) }),
  };
  return MATS;
}
const up = new THREE.Vector3(0, 1, 0);
// en kapsel mellan två punkter
function seg(a, b, r0, r1){
  const L = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r0, L, 10, 1, true), s0 = new THREE.SphereGeometry(r0, 10, 8), s1 = new THREE.SphereGeometry(r1, 10, 8);
  g.translate(0, L/2, 0); s1.translate(0, L, 0);
  const m = mergeGeometries([g.toNonIndexed(), s0.toNonIndexed(), s1.toNonIndexed()]);
  const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
  m.applyMatrix4(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1))); return m;
}
// pose: 4 fingrar × [MCP, PIP, DIP] i grader; thumb: [ut från handen, ner, böj1, böj2]; side: tummens sida i X (+1/−1)
export function makeHand(pose, thumb, side, mats){
  const M = mats, h = new THREE.Group(), gl = [], pads = [];
  // handflata: rundad, något avsmalnande mot handleden
  const palm = new RoundedBoxGeometry(.084, .086, .028, 4, .012); palm.translate(0, .038, -.004);
  { const p = palm.attributes.position; for (let i = 0; i < p.count; i++){ const y = p.getY(i), k = .85 + .15*Math.min(1, Math.max(0, (y + .006)/.09)); p.setX(i, p.getX(i)*k); } }
  gl.push(palm.toNonIndexed());
  const xs = [side*.03, side*.0105, -side*.0105, -side*.029], ky = [.081, .085, .082, .074], rad = [.0098, .0102, .0098, .0088];
  const L = [[.038, .025, .02], [.043, .028, .021], [.04, .027, .02], [.031, .021, .018]];
  for (let i = 0; i < 4; i++){
    let p = new THREE.Vector3(xs[i], ky[i], -.002), ang = 0;
    pads.push(new THREE.BoxGeometry(.017, .02, .008).translate(xs[i], ky[i] - .004, .011).toNonIndexed());
    for (let j = 0; j < 3; j++){
      ang += THREE.MathUtils.degToRad(pose[i][j]);
      const q = p.clone().add(new THREE.Vector3(0, Math.cos(ang), -Math.sin(ang)).multiplyScalar(L[i][j]));
      gl.push(seg(p, q, rad[i]*(1 - .08*j), rad[i]*(.93 - .08*j))); p = q;
    }
  }
  // tumme: tumvalk + två leder
  { const [sp, dn, b1, b2] = thumb.map(a => THREE.MathUtils.degToRad(a));
    let p = new THREE.Vector3(side*.032, .006, -.008), d = new THREE.Vector3(side*Math.sin(sp)*.8, Math.cos(sp), -Math.sin(dn)).normalize();
    const mound = seg(new THREE.Vector3(side*.02, -.012, -.006), p, .017, .015); gl.push(mound);
    for (const [len, bend, r0, r1] of [[.032, 0, .0135, .0122], [.027, b1, .0122, .011], [.022, b2, .011, .0098]]){
      d.applyAxisAngle(up, -side*bend*.3); d.z -= Math.sin(bend)*.6; d.x -= side*Math.sin(bend)*.5; d.normalize();
      const q = p.clone().add(d.clone().multiplyScalar(len)); gl.push(seg(p, q, r0, r1)); p = q; } }
  const glove = new THREE.Mesh(mergeGeometries(gl), M.glove); glove.geometry.computeVertexNormals(); h.add(glove);
  h.add(new THREE.Mesh(mergeGeometries(pads), M.pad));
  // manschett med kardborreband och ärm bakåt (−Y)
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.034, .036, .04, 16), M.glove); cuff.position.set(0, -.012, -.002); h.add(cuff);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(.074, .016, .02), M.strap); strap.position.set(0, -.012, .028); h.add(strap);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.047, .056, .3, 14), M.sleeve); sleeve.position.set(0, -.18, -.004); h.add(sleeve);
  const fold = new THREE.Mesh(new THREE.TorusGeometry(.046, .009, 6, 16), M.sleeve); fold.rotation.x = Math.PI/2; fold.position.set(0, -.04, -.004); h.add(fold);
  h.traverse(o => { if (o.isMesh){ o.castShadow = false; o.renderOrder = 10; } });
  return h;
}
// placera en hand med en bas: fingrarnas riktning (fy) och handryggens riktning (bz) i vapenmodellens rum
export function orient(h, fy, bz, pos){
  const Y = fy.clone().normalize(), Z = bz.clone().normalize(), X = new THREE.Vector3().crossVectors(Y, Z).normalize(); Z.crossVectors(X, Y).normalize();
  h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); h.position.copy(pos); return h;
}
