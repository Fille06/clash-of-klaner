// AI-BASER i 3D: en bas byggd av samma delar som spelarens (inklusive stapling), i tomtens egna koordinater.
// Används när fienden är AI i BAS MOT BAS och FÖRSVAR MOT ANFALL. Basen kontrolleras av rebuild() som alla andra.
let s0 = 1;
const rnd = () => (s0 = (s0*16807) % 2147483647)/2147483647;

export function aiBase3d(seed = 1, diff = 'normal'){
  s0 = 1 + (Math.abs(seed | 0) % 2147483000);
  const it = (t, x, z, rot = 0, extra = {}) => ({ t, x, z, rot, ...extra });
  const items = [it('hq', 0, 0)];
  const R = 18;
  // murring: tre 12 m-murar per sida, porten mot +z (där anfallet kommer ifrån i bas mot bas)
  for (const c of [-12, 0, 12]){
    items.push(it('mur12', c, -R - .5));
    items.push(it('mur12', -R - .5, c, 1));
    items.push(it('mur12', R + .5, c, 1));
    if (c !== 0) items.push(it('mur12', c, R + .5)); else items.push(it('port', 0, R + .5));
  }
  // alla svårighetsgrader ryms inom 2000 byggpoäng (förut kapades försvaren bort av budgeten)
  // alla under 2000 (lätt 1554 · normal 1919 · svår ≈ 1990) – försvaren prioriteras; svår har tyngre vapen i stället för fler minor
  for (const [x, z] of [[-23, 23], [23, 23]]) items.push(it('tower', x, z, 0, { dir: Math.round(Math.atan2(x, z)*180/Math.PI + 360) % 360, sec: 360, pri: 'nar', mode: 'fri' }));
  // innanför: tegelhus med tung kulspruta på taket
  items.push(it('house', -11, -11));
  items.push(it('tungmg', -11.5, -11.5, 0, { up: 1, dir: 0, sec: 360, pri: 'nar', mode: 'fri' }));
  // normal och svår: bunker med prickskyttetorn på
  if (diff !== 'latt'){ items.push(it('bunker', 12, -11)); items.push(it('prick', 12.5, -11.5, 0, { up: 1, dir: 0, sec: 360, pri: 'nar', mode: 'fri' })); }
  // MG-nästen framför porten
  items.push(it('mg', -7.5, 25.5, 0, { dir: 0, sec: 120, pri: 'nar', mode: 'fri' }));
  items.push(it('mg', 7.5, 25.5, 0, { dir: 0, sec: 120, pri: 'nar', mode: 'fri' }));
  // svår: dubbel kulspruta på flanken
  if (diff === 'svar') items.push(it('dubbelmg', 27.5, 0.5, 0, { dir: 90, sec: 120, pri: 'nar', mode: 'fri' }));
  // hinder och minor ute på fältet
  for (const x of [-12, 12]) items.push(it('wire', x, 29.5));
  items.push(it('sand', -3, 22.5)); if (diff !== 'svar') items.push(it('sand', 3, 22.5));
  if (diff === 'normal') items.push(it('stralk', 0.5, 24.5));
  const mines = diff === 'normal' ? 6 : 4;
  for (let k = 0; k < mines; k++) items.push(it('mine', Math.round((rnd() - .5)*50) + .5, Math.round(27 + rnd()*3) + .5));
  return { items, ter: null };
}
