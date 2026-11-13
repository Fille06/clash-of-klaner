# Clash of Klaner

Bygg din bas, forma terrängen, träna din armé och anfall i 3D – direkt i webbläsaren.

Spela: öppna `index.html` eller sidan på GitHub Pages.

**Nya PvP-versionen** (spelare mot spelare, förstörbara byggnader, basbyggare med terräng): `pvp/`

## Upphov
- Spelet: Filip, byggt med Claude Code.
- 3D-motor: [three.js](https://threejs.org) (MIT).
- Soldaten: SWAT av Quaternius, CC0 – https://poly.pizza/m/Btfn3G5Xv4
- Himmel och marktexturer: [Poly Haven](https://polyhaven.com), CC0.


## PvP: lägen, AI och online (pvp/)

- **Basbyggaren** har stapling (bygg på tak, upp till 4 nivåer, ras när det som bär sprängs) och 15 nya delar i varje flik (byggnader, försvar, mark).
- **BAS MOT BAS** och **FÖRSVAR MOT ANFALL** spelas mot AI-soldater i lag från 1 mot 1 till 20 mot 20. Välj din bas, en AI-bas eller en väns baskod.
- **SPELA ONLINE**: riktiga spelare möts via spelservern i repot `clash-of-klaner-core` (`npm start`, port 8080). Skapa ett rum, dela rumskoden, välj lag och bas. Tomma platser fylls med AI som värden kör.
  - GitHub Pages körs över https, då måste servern nås med `wss://` (t.ex. bakom en https-proxy). Lokalt fungerar `ws://<dator>:8080/ws`.
  - Varje spelare simulerar sin egen fysik; positioner, sprängningar, skott på byggnader och träffar skickas via servern. Små skillnader i hur hålens kanter ser ut kan förekomma.
