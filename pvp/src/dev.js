// UTVECKLARLÄGE – tryck 0 (var som helst utom i textfält) för att slå på/av.
// Låser upp allt: obegränsade byggpoäng, gudsläge, oändlig ammunition utan omladdning, obegränsat med granater,
// sprängladdningar och C4. Sparas i webbläsaren (localStorage ckpvp_dev) så att det är kvar nästa gång.
import { PL, WEAPONS } from './player.js';
import { BD } from './builder.js';

const KEY = 'ckpvp_dev', BUDGET = 2000, MAXB = 99999;
export const DEV = { on: (() => { try { return localStorage.getItem(KEY) === '1'; } catch (e){ return false; } })() };

function badge(){
  let b = document.getElementById('devb');
  if (!b){ b = document.createElement('div'); b.id = 'devb'; b.title = 'Tryck 0 för att stänga av'; document.body.appendChild(b); }
  b.style.display = DEV.on ? '' : 'none';
  b.innerHTML = 'UTVECKLARLÄGE <small>ALLT UPPLÅST · GUDSLÄGE · OÄNDLIG AMMO · ∞ BYGGPOÄNG · [0] AV</small>';
}
function toast(s){
  let t = document.getElementById('devt'); if (!t){ t = document.createElement('div'); t.id = 'devt'; document.body.appendChild(t); }
  t.textContent = s; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
export function setDev(on){
  DEV.on = !!on; try { localStorage.setItem(KEY, DEV.on ? '1' : '0'); } catch (e){}
  BD.budget = DEV.on ? MAXB : BUDGET; if (BD.on && BD.refresh) BD.refresh();
  badge(); toast(DEV.on ? 'UTVECKLARLÄGE PÅ – allt upplåst' : 'Utvecklarläge av');
}
// körs först i varje bild: fyll på allt innan spelet räknar skada och skott
export function devTick(){
  if (!DEV.on) return;
  if (BD.budget !== MAXB){ BD.budget = MAXB; if (BD.on && BD.refresh) BD.refresh(); }
  if (!PL.on) return;
  PL.hp = 100; PL.dmgT = 0;
  for (const k in WEAPONS){ const a = PL.ammo[k]; if (a){ a[0] = WEAPONS[k].mag; a[1] = WEAPONS[k].res; } }
  PL.rel = 0;
  if (PL.gad) for (const k in PL.gad) PL.gad[k] = 99;
}
export function bindDev(){
  BD.budget = DEV.on ? MAXB : BUDGET; badge();
  addEventListener('keydown', e => {
    if (e.code !== 'Digit0' && e.code !== 'Numpad0') return;
    const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    e.preventDefault(); setDev(!DEV.on);
  });
}
