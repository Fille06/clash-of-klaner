// SPELA ONLINE: anslut till spelservern, skapa eller gå med i ett rum med kod, välj lag och bas, starta.
import { NET, netConnect, netSend } from './net.js';
import { loadSlots, encodeBase } from './builder.js';
import { startOnline, endFromHost, SIZES } from './modes.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const defaultUrl = () => { try { const v = localStorage.getItem('ck/server'); if (v) return v; } catch (e){} return (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.hostname || 'localhost') + ':8787/ws'; };

export function onlineScreen(back){
  const m = $('menu'); m.classList.remove('hidden');
  const slots = loadSlots();
  m.innerHTML = `<div class="logo">SPELA ONLINE<small>RIKTIGA SPELARE · AI FYLLER TOMMA PLATSER</small></div>
  <div class="setup" id="onl">
    <label>SERVER <input id="oUrl" value="${esc(defaultUrl())}"></label>
    <label>NAMN <input id="oName" maxlength="24" value="${esc((() => { try { return localStorage.getItem('ck/namn') || ''; } catch (e){ return ''; } })())}" placeholder="Ditt namn"></label>
    <div class="row"><div class="it" id="oConnect">ANSLUT<small>till servern ovan</small></div><div class="it" id="oBack">‹ TILLBAKA<small></small></div></div>
    <div id="oLobby" style="display:none">
      <label>LÄGE <select id="oMode"><option value="bmb">BAS MOT BAS</option><option value="fma">FÖRSVAR MOT ANFALL</option></select></label>
      <label>LAGSTORLEK <select id="oSize">${SIZES.map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} MOT ${n}</option>`).join('')}</select></label>
      <label>AI <select id="oDiff"><option value="latt">LÄTT</option><option value="normal" selected>NORMAL</option><option value="svar">SVÅR</option></select></label>
      <div class="row"><div class="it" id="oCreate">SKAPA RUM<small>du blir värd</small></div><div class="it" id="oJoinBtn">GÅ MED<small>med kod</small></div></div>
      <label>RUMSKOD <input id="oCode" maxlength="12" placeholder="R……" style="text-transform:uppercase"></label>
    </div>
    <div id="oRoom" style="display:none"></div>
    <div class="note" id="oNote"></div>
  </div>`;
  const note = (s, ok) => { const el = $('oNote'); if (!el) return; el.textContent = s; el.style.color = ok ? 'var(--gr)' : ''; };
  $('oBack').onclick = () => { if (NET.room) netSend({ t: 'r3Leave' }); back(); };
  NET.ui.onError = msg => note(msg);
  NET.ui.onClosed = reason => { note(reason || 'Rummet stängdes'); if ($('oRoom')) $('oRoom').style.display = 'none'; if (NET.ws && $('oLobby')) $('oLobby').style.display = ''; };
  NET.ui.onRoom = room => renderRoom(room, slots);
  NET.ui.onStart = msg => { note('Matchen startar…', true); startOnline(msg).catch(e => note('Kunde inte starta: ' + e.message)); };
  NET.ui.onEnd = (win, why) => endFromHost(win, why);
  // värden lämnade eller anslutningen bröts under matchen: avsluta matchen i stället för att fastna i den
  NET.ui.onStopped = reason => { note(reason); endFromHost(null, reason || 'Värden lämnade matchen'); };
  $('oConnect').onclick = async () => {
    const url = $('oUrl').value.trim(), name = $('oName').value.trim() || 'Soldat';
    try { localStorage.setItem('ck/server', url); localStorage.setItem('ck/namn', name); } catch (e){}
    if (location.protocol === 'https:' && url.startsWith('ws://')) return note('Sidan är https – servern måste nås med wss:// (eller öppna spelet via http)');
    note('Ansluter…', true);
    try { await netConnect(url, name); note('Ansluten som ' + NET.me, true); $('oLobby').style.display = ''; } catch (e){ note(e.message); }
  };
  $('oCreate').onclick = () => netSend({ t: 'r3Create', settings: { mode: $('oMode').value, size: +$('oSize').value, diff: $('oDiff').value } });
  $('oJoinBtn').onclick = () => netSend({ t: 'r3Join', room: $('oCode').value.trim().toUpperCase() });
  if (NET.room) renderRoom(NET.room, slots);
}

function renderRoom(room, slots){
  // online-skärmen kan vara stängd (t.ex. efter matchslut) – då finns inget att rita
  const el = $('oRoom'); if (!el || !$('oLobby')) return;
  $('oLobby').style.display = 'none'; el.style.display = '';
  const me = room.members.find(x => x.id === NET.me) || {}, host = room.host === NET.me, S = room.settings;
  const team = t => `<div class="rteam ${t}"><b>LAG ${t}${S.mode === 'fma' ? (S.defender === t ? ' · FÖRSVARAR' : ' · ANFALLER') : ''}</b>${room.members.filter(x => x.team === t).map(x => `<div>${esc(x.name)}${x.id === room.host ? ' ★' : ''}${x.id === NET.me ? ' (du)' : ''} <small>${x.ready || x.id === room.host ? '✔' : '…'}${x.hasBase ? ' · bas' : ''}</small></div>`).join('')}<div class="ai">${Math.max(0, S.size - room.members.filter(x => x.team === t).length)} AI</div></div>`;
  el.innerHTML = `<div class="rcode">RUM <b>${esc(room.code)}</b> <small>${S.mode === 'bmb' ? 'BAS MOT BAS' : 'FÖRSVAR MOT ANFALL'} · ${S.size} MOT ${S.size} · AI ${S.diff.toUpperCase()}</small></div>
    <div class="rteams">${team('A')}${team('B')}</div>
    <label>DIN BAS <select id="oBase"><option value="">AI-BAS</option>${slots.map((b, i) => b && b.items.some(x => x.t === 'hq') ? `<option value="${i}">PLATS ${i + 1}</option>` : '').join('')}</select></label>
    ${host && S.mode === 'fma' ? `<label>FÖRSVARAR <select id="oDef"><option value="A" ${S.defender === 'A' ? 'selected' : ''}>LAG A</option><option value="B" ${S.defender === 'B' ? 'selected' : ''}>LAG B</option></select></label>` : ''}
    <div class="row"><div class="it" id="oTeam">BYT LAG<small>till ${me.team === 'A' ? 'B' : 'A'}</small></div>${host ? `<div class="it" id="oStart">STARTA<small>när alla är redo</small></div>` : `<div class="it" id="oReady">${me.ready ? 'INTE REDO' : 'REDO'}<small></small></div>`}<div class="it" id="oLeave">LÄMNA<small></small></div></div>`;
  $('oTeam').onclick = () => netSend({ t: 'r3Set', team: me.team === 'A' ? 'B' : 'A' });
  $('oLeave').onclick = () => netSend({ t: 'r3Leave' });
  if ($('oReady')) $('oReady').onclick = () => netSend({ t: 'r3Set', ready: !me.ready });
  if ($('oStart')) $('oStart').onclick = () => netSend({ t: 'r3Start' });
  if ($('oDef')) $('oDef').onchange = () => netSend({ t: 'r3Settings', settings: { defender: $('oDef').value } });
  $('oBase').onchange = async () => { const v = $('oBase').value; netSend({ t: 'r3Set', base: v === '' ? null : await encodeBase(slots[+v]) }); };
}
