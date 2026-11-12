// Fysik med Rapier (öppen källkod, WASM). Fast tidssteg 60 Hz. Varje kolliderare kan peka på en ägare (cell, spelare …).
import RAPIER from 'rapier';
export let R = null;
export const PH = { world: null, owner: new Map(), acc: 0, dyn: [] };

export async function initPhysics(){
  await RAPIER.init(); R = RAPIER;
  PH.world = new R.World({ x: 0, y: -9.81, z: 0 }); PH.world.timestep = 1/60;
  PH.ground = PH.world.createRigidBody(R.RigidBodyDesc.fixed());
}
export function own(col, o){ PH.owner.set(col.handle, o); return col; }
export function ownerOf(col){ return col ? PH.owner.get(col.handle) : null; }
export function removeCollider(col){ if (!col) return; PH.owner.delete(col.handle); PH.world.removeCollider(col, false); }
// stråle: ger { point, normal, toi, col, owner } eller null
export function ray(o, d, max, exclude){
  const r = new R.Ray(o, d), hit = PH.world.castRayAndGetNormal(r, max, true, undefined, undefined, exclude);
  if (!hit) return null; const p = r.pointAt(hit.timeOfImpact);
  return { point: { x: p.x, y: p.y, z: p.z }, normal: hit.normal, toi: hit.timeOfImpact, col: hit.collider, owner: ownerOf(hit.collider) };
}
// dynamiska kroppar som följs av en three-mesh
export function addDyn(body, mesh, life){ PH.dyn.push({ body, mesh, life: life || 0, t: 0 }); }
export function stepPhysics(dt){
  PH.acc = Math.min(PH.acc + dt, .1); let n = 0;
  while (PH.acc >= 1/60 && n < 4){ PH.world.step(); PH.acc -= 1/60; n++; }
  for (let i = PH.dyn.length - 1; i >= 0; i--){
    const d = PH.dyn[i], t = d.body.translation(), q = d.body.rotation(); d.t += dt;
    d.mesh.position.set(t.x, t.y, t.z); d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    // vilande skräp blir fast (sparar kraft) – raset ligger kvar som spillror
    if ((d.t > 2 && d.body.isSleeping()) || d.t > 14 || t.y < -50){
      if (d.life && d.t > d.life){ d.mesh.parent && d.mesh.parent.remove(d.mesh); }
      PH.world.removeRigidBody(d.body); PH.dyn.splice(i, 1); if (d.done) d.done(d);
    }
  }
}
