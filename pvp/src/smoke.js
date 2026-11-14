// RÖK: rökmoln från rökgranater blockerar sikten för AI-soldater och försvar (bots.js, defense.js).
export const SMOKES = [];
// går linjen a→b genom ett rökmoln?
export function smokeBlocks(ax, ay, az, bx, by, bz){
  if (!SMOKES.length) return false;
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx*dx + dy*dy + dz*dz || 1;
  for (const s of SMOKES){
    const r = s.r*Math.min(1, s.age/1.5)*(s.t < 4 ? s.t/4 : 1); if (r < .5) continue;
    let k = ((s.x - ax)*dx + (s.y - ay)*dy + (s.z - az)*dz)/L2; k = Math.max(0, Math.min(1, k));
    const px = ax + dx*k - s.x, py = ay + dy*k - s.y, pz = az + dz*k - s.z;
    if (px*px + py*py*.6 + pz*pz < r*r) return true;
  }
  return false;
}
