// Världen: töm scenen och fysiken mellan kartor (övning, byggtomt, match).
import { E } from './engine.js';
import { R, PH } from './physics.js';
import { DS } from './destruct.js';
import { fx, FX } from './fx.js';
import { PL, TARGETS } from './player.js';
import { defReset } from './defense.js';

export const W = { keep: null, map: null };
// kom ihåg vad som alltid ska finnas kvar (kamera, ljus, himmel, partiklar, dekaler)
export function markPersistent(){ W.keep = new Set(E.scene.children); }
export function resetWorld(){
  for (const o of [...E.scene.children]) if (!W.keep.has(o)){ E.scene.remove(o); o.traverse && o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  PH.world.free(); PH.world = new R.World({ x: 0, y: -9.81, z: 0 }); PH.world.timestep = 1/60; PH.ground = PH.world.createRigidBody(R.RigidBodyDesc.fixed());
  PH.owner.clear(); PH.dyn.length = 0; PH.acc = 0;
  DS.list.length = 0; DS.sections.length = 0; DS.sinks.length = 0; DS.falls.length = 0; DS.debris = 0;
  PL.body = null; PL.cc = null; PL.col = null; PL.charges.length = 0; PL.nades.length = 0; PL.rockets.length = 0;
  TARGETS.length = 0; defReset(); FX.groundAt = null; fx.reset(); E.fogTarget = 0; E.fogBoost = 0;
}
