# CONTEXT — sdílený jazyk projektu ui-skills

Slovník pojmů, jak je používá spec, kód i issues. Když se pojem posune,
posune se tady.

## Smyčka

- **Snapshot** — jeden samostatný HTML soubor pořízený SingleFile (externí
  proces, AGPL — viz CLAUDE.md). Zmrazený: bez skriptů, se živými stylesheety.
- **Instrumentace** — čistá funkce nad snapshotem: každý prvek dostane
  `data-cx-id` a do `map.json` se uloží trojice stop (selektor, xpath, textový
  otisk). Duplikáty vzniklé v editoru dostávají **syntetická id** (`cx-d…`)
  od overlaye — v mapě nejsou, nese je změna `duplicate`.
- **Session** — adresář `.ui-skills/session-<ts>/` s celým pracovním stavem:
  snapshot, mapa, event log, review výstupy, screenshoty. Dá se zabalit a
  předat. Vždy v gitignore (může nést citlivá data).
- **Event log** — append-only JSONL na disku, jediný zdroj pravdy. Každá akce
  editoru se zapisuje okamžitě; nic se needituje ani nemaže — i undo/zahození
  je nová událost. Pád prohlížeče nic neztratí.
- **Overlay** — editor injektovaný do servírované kopie snapshotu. Čistý ES
  modul bez buildu a frameworku, UI v shadow rootu (izolace stylů oběma
  směry). Soubor snapshotu na disku zůstává netknutý.
- **Kompilace** — čistá funkce event log → `review.json`. Skládá stav až na
  konci: koalescence editací, reverty ven, zahozené položky ven, neznámé
  typy událostí přeskočit s varováním.
- **Review** — `review.json` (kontrakt pro agenta, `schemaVersion` povinná)
  + `review.md` (pro člověka). **Změna** (`changes[]`) je pokyn provedený
  1:1; **komentář** (`comments[]`) je volnější kanál — `question` se
  zodpovídá, ostatní se rozpadají na plán.
- **Aplikace** — `apply-review`: mapování od nejspolehlivější stopy
  (sourceHint → text → selektor), nejednoznačnost = `needs-input`, nikdy se
  nehádá. Metrika **applied / needs-input / skipped** je jediné tvrdé měřítko
  kvality mapování.
- **Replay** — přehrání zkompilovaných změn na čistý snapshot v headless
  prohlížeči na serveru. Zavedeno kvůli screenshotu stavu „po" (ADR 0002);
  tatáž cesta ponese re-snapshot diff ve fázi 3.

## Typy změn (fáze 1)

- **text** — přepis textu prvku, `before`/`after`.
- **hide** — hypotéza („co kdyby tohle nebylo?"); agent čte jako otázku.
- **remove** — pokyn; změna nese popis odstraněného podstromu (tag, počet
  potomků, textový otisk), aby agent poznal rozsah.
- **duplicate** — pokyn „chci jich víc"; nese mapování originál → syntetická
  id duplikátu, aby šel duplikát dál editovat.

Skrýt a smazat jsou **dvě operace, ne jedna s příznakem** — liší se tím, co
má agent udělat se zdrojákem. Neznámý `type` apply skill přeskočí jako
`skipped` s poznámkou, nikdy nespadne (`schemaVersion` se zvedá jen při
breaking změně).

## Rozhodnuté hranice fáze 1

- URL snapshoty čekají networkIdle + krátkou rezervu; lazy obsah pod foldem
  může chybět — plné řešení patří k #37 (řídit prohlížeč sami).
- Login screen se detekuje best-effort heuristikou (password input, redirect
  na login URL) → varování odkazující na `--profile` (fáze 3); snapshot se
  přesto uloží.
- Screenshot „po" vzniká replayem event logu na serveru, ne posíláním DOM
  z klienta (ADR 0002).
