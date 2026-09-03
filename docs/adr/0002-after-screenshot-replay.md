# ADR 0002 — Screenshot stavu „po" vzniká replayem event logu na serveru

Datum: 2026-09-03 · Stav: přijato · Souvisí: PRD #4 (fáze 1), ADR 0001

## Kontext

Fáze 1 přidává celostránkové screenshoty „před" a „po" editacích. „Před" je
triviální: server naservíruje čistý snapshot headless prohlížeči a vyfotí.
„Po" ale naráží na architekturu smyčky: editovaný DOM existuje **jen
v záložce uživatele** — server má čistý snapshot a append-only event log.
PRD větu „screenshoty se pořizují na serveru nad servírovaným snapshotem"
šlo pro „po" naplnit dvěma způsoby, a rozhodnutí mění tvar kódu.

## Zvažované možnosti

1. **Replay event logu na serveru.** Při `/done` server otevře čistý
   snapshot v headless prohlížeči, přehraje na něj zkompilované změny
   (text, hide, remove, duplicate jsou deterministické DOM operace nad
   `data-cx-id`) a vyfotí výsledek.
2. **Klient pošle finální DOM.** Overlay při „Hotovo" serializuje
   `outerHTML` a pošle ho serveru; ten ho naservíruje a vyfotí.
3. **Odložit do fáze 3** a fotit jen „před" + výřezy.

## Rozhodnutí

**Replay event logu na serveru (1).**

- Jednotné podmínky: screenshot nezávisí na velikosti okna, zoomu ani
  rozdělané práci v záložce uživatele — dva běhy nad týmž logem dají týž
  obrázek.
- Žádný nový datový kanál: klient neposílá megabytové payloady; event log
  zůstává jediným zdrojem pravdy a screenshot je jeho důkazem — fotí se
  přesně to, co agent dostane k aplikaci, ne to, co náhodou zbylo v DOM.
- Replay engine není jednorázovost: re-snapshot diff ve fázi 3 potřebuje
  totéž (aplikovat změny a porovnat), takže cesta 1 staví to, co bude
  stejně potřeba.

Cena: replay musí umět všechny typy změn, které kompilátor vydává, a
neznámé typy přeskočit (stejné pravidlo dopředné kompatibility jako apply).
Rozdíl mezi replayem a klientovým DOM je přijatelný — screenshot má
dokládat review, ne stav konkrétní záložky.

## Důsledky

- `packages/canvas-server` dostává modul replay (headless Playwright nad
  session snapshotem) — Playwright se stává běhovou závislostí plného
  `/ui-review` (patří do README).
- Výřezy ke komentářům se pořizují nad čistým snapshotem („před" stavem) —
  deterministické a laciné; komentář popisuje, co člověk viděl, a to bylo
  před aplikací jeho pokynů.
