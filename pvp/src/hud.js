// HUD i BF4-stil: minikarta med lagpoäng och flaggor, trupplista, vapenpanel, kompass, sikte, träffmarkör, mål-markörer i världen.
import * as THREE from 'three';
import { E } from './engine.js';
import { PL, WEAPONS, GADGETS } from './player.js';
import { DS } from './destruct.js';
import { MAP } from './map.js';
import { DEF } from './defense.js';

const H = { el: null, flags: [], tick: { us: 400, cn: 400, max: 400 }, feed: [], squad: ['ALFA', 'Du', 'Tom plats', 'Tom plats', 'Tom plats'] };
const $ = id => document.getElementById(id);
export function initHud(o = {}){
  Object.assign(H, o);
  const h = H.el = $('hud');
  h.innerHTML = `
  <div id="dmg"></div><div id="hdir"></div><div id="mk"></div>
  <div id="cmpw"><div id="cmp"></div></div><div id="cmpc"></div>
  <div id="xh"><i class="d"></i><i id="x1"></i><i id="x2"></i><i id="x3"></i><i id="x4"></i></div><div id="hit"></div>
  <div id="feed"></div><div id="pts"></div><div id="note"></div>
  <div id="mmw"><div id="mmtop"><div id="flags"></div><div id="tick"><span class="t us" id="tu"></span><span class="bar"><i class="b1" id="tb1"></i><i class="b2" id="tb2"></i></span><span class="t cn" id="tc"></span></div></div>
    <div id="mmbox"><canvas id="mm" width="236" height="236"></canvas></div><div id="squad"></div></div>
  <div id="wp"><div id="wpn"></div><div id="ammo"><span id="mag"></span><span id="res"></span><span id="mode"></span></div><div id="gad"></div><div id="hpw"><span id="stance"></span><span id="hpn"></span><span class="hb"><i id="hpb"></i></span></div></div>
  <div id="death"><div class="dt">DU DOG</div><div class="db" id="dby"></div><div class="dr" id="drs"></div></div>
  <div id="keys">WASD GÅ · SHIFT SPRING · C DUCKA · 1/2 VAPEN · R LADDA · B ELDLÄGE · G GRANAT · X SPRÄNGLADDNING · V C4 · F SPRÄNG · ESC MENY</div>`;
  // kompassens skala: 3 varv så att den kan rulla
  let s = ''; const px = 3.2;
  for (let d = -360; d <= 720; d += 5){ const x = (d + 360)*px; const lab = { 0: 'N', 90: 'Ö', 180: 'S', 270: 'V' }[((d % 360) + 360) % 360];
    s += `<i style="left:${x}px;height:${d % 15 === 0 ? 8 : 4}px"></i>`; if (lab) s += `<b style="left:${x}px;color:${lab === 'N' ? 'var(--cy)' : ''}">${lab}</b>`; else if (d % 45 === 0) s += `<b style="left:${x}px;font-size:11px;opacity:.7">${((d % 360) + 360) % 360}</b>`; }
  $('cmp').innerHTML = s; H.cpx = px;
  H.mm = $('mm').getContext('2d'); H.kt = 0;
  renderFlags(); renderSquad(); mapSnapshot();
}
function renderFlags(){ $('flags').innerHTML = H.flags.map(f => `<div class="flag ${f.own || ''}"><b>${f.n}</b></div>`).join(''); }
function renderSquad(){ $('squad').innerHTML = `<div class="sq">TRUPP ${H.squad[0]}</div>` + H.squad.slice(1).filter(n => n !== 'Tom plats').map((n, i) => `<div class="${i === 0 ? 'me' : ''}">◆ ${n}</div>`).join(''); }
export function hudFeed(a, b, how){ H.feed.unshift({ s: `<span class="us">${a}</span> [${how}] <span class="cn">${b}</span>`, t: 6 }); H.feed.length = Math.min(H.feed.length, 5); }
export function hudPoints(n, why){ H.pts = { s: `+${n} ${why || ''}`, t: 1.6 }; }
const v = new THREE.Vector3();
export function updateHud(dt){
  if (!H.el || H.el.classList.contains('hidden')) return;
  const W = WEAPONS[PL.slot], a = PL.ammo[PL.slot] || [0, 0];
  $('wpn').textContent = W.name; $('mag').textContent = PL.rel > 0 ? '––' : a[0]; $('res').textContent = '/ ' + a[1]; $('mode').textContent = W.modes[PL.mode[PL.slot]];
  $('gad').innerHTML = `<span><i>G</i>GRANAT ${PL.gad.gren}</span><span><i>X</i>LADDNING ${PL.gad.breach}</span><span><i>V</i>C4 ${PL.gad.c4}</span>`;
  $('stance').textContent = PL.crouch > .5 ? '▂' : '▮'; H.kt = (H.kt || 0) + dt; $('keys').style.opacity = H.kt < 7 ? .6 : 0;
  const hp = Math.max(0, Math.round(PL.hp)); $('hpn').textContent = hp; $('hpb').style.width = hp + '%'; $('hpw').className = hp < 35 ? 'low' : '';
  // kompass
  const deg = ((-PL.yaw*180/Math.PI) % 360 + 360) % 360; $('cmp').style.left = (260 - (deg + 360)*H.cpx) + 'px'; $('cmpc').textContent = Math.round(deg).toString().padStart(3, '0');
  // sikte: spridning
  const sp = 10 + (PL.speed || 0)*3 + (PL.heat || 0)*14 - (PL.aimK || 0)*8, L = 7;
  const xs = [['x1', -sp - L, -1, L, 2], ['x2', sp, -1, L, 2], ['x3', -1, -sp - L, 2, L], ['x4', -1, sp, 2, L]];
  for (const [id, x, y, w, h] of xs){ const e = $(id).style; e.left = x + 'px'; e.top = y + 'px'; e.width = w + 'px'; e.height = h + 'px'; }
  $('xh').style.opacity = PL.aimK > .7 && PL.slot !== 'rpg' ? .25 : PL.sprint ? 0 : 1;
  $('hit').style.opacity = PL.hits > 0 ? 1 : 0;
  // träffriktning (BF4): röd båge mot den som skjuter
  const hf = PL.hurtFrom; if (hf && hf.t > 0 && PL.body){ hf.t -= dt; const t = PL.body.translation(), a = Math.atan2(hf.x - t.x, hf.z - t.z), rel = a - PL.yaw + Math.PI; $('hdir').style.transform = `rotate(${-rel}rad)`; $('hdir').style.opacity = Math.min(1, hf.t*1.5); } else $('hdir').style.opacity = 0;
  $('dmg').style.boxShadow = `inset 0 0 ${160}px rgba(170,0,0,${Math.min(.75, (1 - PL.hp/100)*.9)})`;
  const dd = PL.deadT > 0; $('death').style.display = dd ? 'block' : 'none'; if (dd){ const D = PL.death || {}; $('dby').innerHTML = `DÖDAD AV <b>${D.by || 'OKÄND'}</b>${D.d != null ? ' · ' + D.d + ' M' : ''}`; $('drs').textContent = 'ÅTERUPPSTÅR OM ' + Math.ceil(PL.deadT); }
  $('xh').style.display = dd ? 'none' : ''; $('wp').style.opacity = dd ? .25 : 1;
  $('note').textContent = PL.msg || (PL.charges.length ? `[F] SPRÄNG ${PL.charges.length} LADDNING${PL.charges.length > 1 ? 'AR' : ''}` : '');
  if (H.pts){ H.pts.t -= dt; $('pts').textContent = H.pts.t > 0 ? H.pts.s : ''; }
  H.feed.forEach(f => f.t -= dt); H.feed = H.feed.filter(f => f.t > 0); $('feed').innerHTML = H.feed.map(f => `<div>${f.s}</div>`).join('');
  $('tu').textContent = 'US ' + H.tick.us; $('tc').textContent = H.tick.cn + ' CN'; $('tb1').style.width = (H.tick.us/H.tick.max*50) + '%'; $('tb2').style.width = (H.tick.cn/H.tick.max*50) + '%';
  drawMinimap();
  // mål-markörer i världen
  let mk = '';
  for (const f of H.flags){ v.set(f.x, f.y || 3, f.z).project(E.cam); if (v.z > 1) continue; const x = (v.x*.5 + .5)*innerWidth, y = (-v.y*.5 + .5)*innerHeight, d = Math.round(E.cam.position.distanceTo(new THREE.Vector3(f.x, f.y || 3, f.z)));
    const c = f.own === 'us' ? 'var(--cy)' : f.own === 'cn' ? 'var(--or)' : '#e4f2f8'; mk += `<div class="m" style="left:${Math.max(30, Math.min(innerWidth - 30, x))}px;top:${Math.max(60, Math.min(innerHeight - 120, y))}px;color:${c}"><div class="fl"><b>${f.n}</b></div>${d}M</div>`; }
  $('mk').innerHTML = mk;
}
function drawMinimap(){
  const x = H.mm, s = 236, sc = 1.3, p = E.cam.position; x.clearRect(0, 0, s, s);
  x.save(); x.translate(s/2, s/2); x.rotate(PL.yaw); x.scale(sc, sc); x.translate(-p.x, -p.z);
  x.fillStyle = 'rgba(22,40,50,.7)'; x.fillRect(p.x - 120, p.z - 120, 240, 240);
  if (H.snap){ const S = H.snap; x.globalAlpha = .92; x.drawImage(S.c, S.x0, S.z0, S.size, S.size); x.globalAlpha = 1; }
  else { x.fillStyle = 'rgba(120,160,180,.32)'; for (const [rx, rz, rw, rd] of (MAP.roads || [])) x.fillRect(rx - rw/2, rz - rd/2, rw, rd); }
  x.strokeStyle = 'rgba(200,230,245,.08)'; x.lineWidth = .3; for (let g = Math.floor((p.x - 80)/10)*10; g < p.x + 80; g += 10){ x.beginPath(); x.moveTo(g, p.z - 80); x.lineTo(g, p.z + 80); x.stroke(); } for (let g = Math.floor((p.z - 80)/10)*10; g < p.z + 80; g += 10){ x.beginPath(); x.moveTo(p.x - 80, g); x.lineTo(p.x + 80, g); x.stroke(); }
  for (const b of DS.list){ const S = b.s, gone = b.collapsed > 200; if (gone){ x.fillStyle = 'rgba(60,60,60,.55)'; x.fillRect(S.x - S.w/2, S.z - S.d/2, S.w, S.d); } x.strokeStyle = gone ? 'rgba(255,140,60,.7)' : 'rgba(240,248,252,.75)'; x.lineWidth = .5; x.strokeRect(S.x - S.w/2, S.z - S.d/2, S.w, S.d); }
  if (!H.snap) for (const [bx, bz, bw, bd] of (MAP.blocks || [])){ x.fillStyle = 'rgba(170,200,215,.45)'; x.fillRect(bx - bw/2, bz - bd/2, bw, bd); }
  // fiendens försvar som just skjutit syns som röda trianglar (BF4: upptäckt)
  for (const sp of DEF.spots){ x.save(); x.translate(sp.x, sp.z); x.rotate(-PL.yaw); x.globalAlpha = Math.min(1, sp.t); x.fillStyle = '#ff4a2a'; x.beginPath(); x.moveTo(0, -3.2); x.lineTo(2.8, 2.4); x.lineTo(-2.8, 2.4); x.closePath(); x.fill(); x.restore(); }
  x.globalAlpha = 1;
  for (const f of H.flags){ x.save(); x.translate(f.x, f.z); x.rotate(-PL.yaw); x.strokeStyle = f.own === 'us' ? '#3fc8ff' : f.own === 'cn' ? '#ff7f1e' : '#e4f2f8'; x.lineWidth = .7; x.beginPath(); x.moveTo(0, -3); x.lineTo(3, 0); x.lineTo(0, 3); x.lineTo(-3, 0); x.closePath(); x.stroke(); x.restore(); }
  x.restore();
  // spelaren i mitten
  x.fillStyle = '#9eff5a'; x.beginPath(); x.moveTo(s/2, s/2 - 7); x.lineTo(s/2 + 5, s/2 + 5); x.lineTo(s/2, s/2 + 2); x.lineTo(s/2 - 5, s/2 + 5); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(158,255,90,.25)'; x.beginPath(); x.moveTo(s/2, s/2); x.lineTo(s/2 - 40, s/2 - 80); x.moveTo(s/2, s/2); x.lineTo(s/2 + 40, s/2 - 80); x.stroke();
}

// ovanifrånbild av kartan till minikartan (BF4 visar en riktig kartbild): ortografisk kamera rakt ovanifrån, utan dis
export function mapSnapshot(){
  try {
    const R = 160, N = 768, cx = 0, cz = 0;
    const cam = new THREE.OrthographicCamera(-R, R, R, -R, 1, 900); cam.position.set(cx, 450, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld();
    const rt = new THREE.WebGLRenderTarget(N, N, { colorSpace: THREE.SRGBColorSpace }), r = E.r, s = E.scene, fog = s.fog, dome = E.dome && E.dome.visible, tm = r.toneMapping;
    s.fog = null; if (E.dome) E.dome.visible = false; r.setRenderTarget(rt); r.render(s, cam); r.setRenderTarget(null); s.fog = fog; if (E.dome) E.dome.visible = dome;
    const px = new Uint8Array(N*N*4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); rt.dispose();
    const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
    for (let y = 0; y < N; y++){ const src = (N - 1 - y)*N*4; for (let i = 0; i < N*4; i += 4){ const d = y*N*4 + i; // kall kartton som i BF4: avmättad, blåaktig
      const l = px[src + i]*.3 + px[src + i + 1]*.59 + px[src + i + 2]*.11; const L2 = Math.max(l, 70); im.data[d] = L2*.62 + 18; im.data[d + 1] = L2*.8 + 26; im.data[d + 2] = L2*.92 + 34; im.data[d + 3] = 255; } }
    x.putImageData(im, 0, 0); H.snap = { c, x0: cx - R, z0: cz - R, size: R*2 };
  } catch (e){ console.warn('Minikartan: ingen kartbild', e); H.snap = null; }
}
