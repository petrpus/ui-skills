# ui-skills — specifikace (v2)

Sada skills (Claude Code plugin) pro design, ladění a revizi UI. Repo `petrpus/ui-skills`, veřejné, licence MIT. Plně nezávislé na `claude-code-harness`, ale kompatibilní s jeho konvencemi (SKILL.md, commands, `bin/` skripty, marketplace formát), takže je lze instalovat vedle sebe a řetězit. Sada je navržena tak, aby šly další UI skills přidávat bez zásahu do stávajících.

*v2 zapracovává rozhodnutí z review: snapshot přes SingleFile, fáze 0, desktop-only editor, pouze `--profile` režim, demo jako první krok, schemaVersion, sjednocené názvosloví.*

---

## 1. Cíl

Umožnit člověku revidovat a upravovat živé UI **vizuálně** (klikáním a psaním přímo do stránky) a předat agentovi **strojově čitelný changeset**, který agent promítne do zdrojového kódu. Dále: generování HTML dema design systému a úprava vygenerovaných HTML prezentací stejným mechanismem.

Prior art: stagewise (výběr elementů + komentáře → agent, funguje jen nad lokálním dev serverem), Onlook (vizuální editor pro React). Odlišení: **snapshot-first přístup** — pracujeme nad zmrazenou replikou stránky, proto to funguje nad čímkoli včetně aplikací za přihlášením, produkčních URL a statických HTML souborů, bez integrace do build pipeline.

## 2. Ne-cíle

Vyslovené hranice nástroje — mimo záběr trvale, ne „zatím":

- **Interaktivní stavy a chování.** Snapshot je jednostavová fotografie. Modály, dropdowny, hover/focus stavy, animace, přechody a klávesová interakce se nerevidují vizuálně, ale komentářem („zkontroluj hover primárního tlačítka"). Stav, který má být vidět, se navodí před pořízením snapshotu.
- **Vzdálený a mobilní přístup.** Editor běží výhradně na `localhost` a je navržen desktop-only (hover, klávesové zkratky, dvojklik). Review se dělá na stroji, kde běží agent. Vědomé omezení: bind na Tailscale rozhraní by šel dodat později levně, touch ovládání nikoli.
- **Tvorba nových layoutů kreslením.** Nové rozvržení se zadává komentářem; editor umí jen upravovat existující strukturu.

## 3. Komponenty

```
ui-skills/
├── .claude-plugin/           # manifest pluginu + marketplace.json
├── CLAUDE.md                 # mj. pravidlo: SingleFile jen jako externí proces, nikdy nepřebírat kód
├── LICENSE                   # MIT
├── skills/
│   ├── ui-review/            # SKILL.md — orchestrace celého review cyklu
│   ├── apply-review/         # SKILL.md — aplikace review.json do zdrojáků
│   ├── design-tokens/        # SKILL.md — extrakce design systému ze stránky/kódu
│   ├── design-system-demo/   # SKILL.md — generování HTML dema design systému
│   └── html-deck/            # SKILL.md — specifika HTML prezentací
├── commands/
│   ├── ui-review.md          # /ui-review <url|soubor> [--profile]
│   ├── apply-review.md       # /apply-review [review.json]
│   ├── extract-tokens.md     # /extract-tokens <url|soubor>
│   └── design-demo.md        # /design-demo [tokens.json|url|soubor]
├── packages/
│   ├── snapshot/             # obálka nad single-file-cli + instrumentace
│   ├── canvas-server/        # lokální server + editor overlay
│   ├── demo-generator/       # tokens.json → demo.html
│   └── schema/               # JSON schémata (review.json, tokens.json)
└── bin/
    ├── canvas-snapshot
    └── canvas-serve
```

Skills jsou tenké (orchestrace, heuristiky mapování na zdroj); veškerá deterministická práce je v CLI nástrojích v `packages/` — agent je jen volá. To drží kontext malý a chování reprodukovatelné.

Pracovní data (snapshoty, event logy, review výstupy) žijí v `.ui-skills/` v cílovém projektu — adresář patří do `.gitignore` šablony, protože snapshoty mohou obsahovat citlivá data z přihlášených session. Vyhrazený prohlížečový profil: `~/.ui-skills/profile/`.

## 4. Snapshot: SingleFile + instrumentace

Zachycení stránky deleguje na **SingleFile** (`single-file-cli`), volaný výhradně jako externí proces. SingleFile řeší těžké problémy serializace: cross-origin stylesheety, fonty, `@import` řetězce, shadow DOM, CSS-in-JS. Klíčové je, že **zachovává živé stylesheety** — kaskáda, CSS custom properties a media queries ve snapshotu fungují, takže pozdější CSS panel (fáze 2) může editovat tokeny a viewport přepínač dává smysl.

Licenční pravidlo (SingleFile je AGPL-3.0): pouze volání procesu, nikdy nelinkovat jako knihovnu, nikdy nepřebírat kód ani úryvky — instrukce je explicitně v CLAUDE.md, aby ji dodržoval i agent při vývoji. Repo si tím udrží MIT. README uvádí single-file-cli jako vyžadovanou závislost.

**Ověřovací spike (před fází 0):** pořídit SingleFile snapshot reálné aplikace (Cronos) a ověřit: (a) custom properties přežily a jsou přepsatelné, (b) media queries reagují na změnu šířky okna, (c) selektory zůstaly použitelné pro instrumentaci, (d) skripty jsou odstraněné/neaktivní. Pokud spike selže, fallback je vlastní stylesheet-preserving engine — nákladná cesta, proto se rozhoduje experimentem, ne odhadem.

**Instrumentace (vlastní krok po SingleFile):** každému elementu se přidá `data-cx-id` (stabilní ID) a uloží se mapa `cx-id → {css selektor, xpath, textový otisk, sourceHint pokud existuje}`.

## 5. Ústřední tok: `/ui-review`

1. **Zachycení.** Vstup: lokální HTML soubor, URL, nebo URL vyžadující přihlášení (`--profile`, viz §6). Výstup: jeden samostatný instrumentovaný HTML soubor v `.ui-skills/session-<ts>/`.
2. **Editor.** `canvas-serve` naservíruje snapshot s injektovaným overlay (vanilla JS + CSS, žádný framework) na `http://localhost:<port>`. Uživatel edituje (viz §7). Každá akce se ihned POSTuje na server (append-only JSONL event log — pád prohlížeče nic neztratí).
3. **Uzavření.** Tlačítko „Hotovo" (nebo Ctrl+Enter) → server zkompiluje event log do `review.json` + `review.md` (lidsky čitelný souhrn), od fáze 1 též screenshoty, ukončí se a vrátí agentovi cestu k výstupu.
4. **Aplikace.** `/apply-review` — agent načte `review.json`, namapuje položky na zdrojové soubory a provede změny (viz §9).

Agent během kroku 2 čeká (skill instruuje spustit server a blokovat na jeho ukončení), takže celý cyklus proběhne v jednom příkazu bez ručního přepínání.

## 6. Aplikace s přihlášením: `--profile`

Jediný režim: **Playwright persistent context** s vyhrazeným profilem v `~/.ui-skills/profile/`. Při prvním použití na danou aplikaci nástroj otevře okno, uživatel se normálně přihlásí (funguje i SSO a hardware klíče), session se uloží v profilu; další snapshoty téže aplikace probíhají headless. Po zachycení už backend není potřeba — edituje se zmrazená replika.

CDP attach k běžícímu prohlížeči byl zvažován a **vypuštěn**: vyžaduje restart Chromu s debug flagem, novější Chrome ho na výchozím profilu omezuje, a otevřený debug port dává lokálním procesům přístup ke všem tabům — nepřijatelné riziko u prohlížeče s přihlášenými klientskými systémy. Stav, který nejde reprodukovat prostým dokliknutím v profilu, je vzácný a mimo záběr (viz ne-cíle).

## 7. Funkce editoru (overlay)

Desktop-only interakční model (viz ne-cíle): hover, modifikátory, klávesové zkratky.

- **Výběr elementu:** hover zvýrazní blok (jako DevTools inspector), klik vybere. Breadcrumb rodičů pro výběr správné úrovně (element / komponenta / sekce).
- **Editace textu** *(fáze 0)*: dvojklik → `contentEditable` na místě. Zaznamenává se `{cx-id, before, after}`.
- **Komentáře** *(fáze 0)*: `C + klik` připne komentář k elementu — bublina s textem, volitelná kategorie (`change-request` / `question` / `idea`) a priorita. Komentáře jsou vedle přímých editů druhý, volnější kanál — a jediný kanál pro interaktivní stavy a nové layouty.
- **Operace s bloky** *(fáze 1)*: skrýt/smazat element, duplikovat; přesun v rámci rodiče (drag) až ve fázi 4.
- **Editace CSS v rámci design systému** *(fáze 2)*: panel u vybraného elementu nabízí *pouze hodnoty z design systému*: CSS custom properties nalezené na stránce a škály z `tokens.json`. Vlastnosti: barvy, typografie, spacing, border, shadow, radius. Volné hodnoty jen po explicitním přepnutí „mimo systém" (flag `offSystem: true`, aby to agent mohl zpochybnit).
- **Viewport přepínač** *(fáze 2)*: mobile / tablet / desktop — funguje díky živým media queries ze SingleFile snapshotu; edity nesou informaci, v jakém viewportu vznikly.
- **Undo/redo a seznam změn** *(fáze 1)* v postranním panelu s možností jednotlivé položky zahodit před odesláním.

## 8. Datový model `review.json`

```json
{
  "schemaVersion": 1,
  "meta": { "source": "https://…", "capturedAt": "…", "mode": "profile", "viewport": "desktop" },
  "tokens": { "detected": ["--color-primary", "--space-4"] },
  "changes": [
    {
      "id": "chg_001",
      "target": { "cxId": "cx-142", "selector": "main > section:nth-child(2) h2",
                  "textFingerprint": "Naše služby", "sourceHint": "src/components/Services.tsx:42" },
      "type": "text",
      "before": "Naše služby",
      "after": "Co pro vás uděláme"
    },
    {
      "id": "chg_002",
      "target": { "…": "…" },
      "type": "style",
      "props": { "background-color": { "before": "#f4f4f5", "after": "var(--color-surface-2)" } },
      "offSystem": false,
      "viewport": "mobile"
    },
    { "id": "chg_003", "target": { "…": "…" }, "type": "remove",
      "subtree": { "tag": "section", "elements": 12, "textFingerprint": "…" } }
  ],
  "comments": [
    { "id": "cmt_001", "target": { "…": "…" }, "category": "change-request",
      "priority": "high", "text": "Celý hero přepracovat — méně textu, jedno CTA.",
      "screenshot": "shots/cmt_001.png" }
  ]
}
```

`schemaVersion` je povinné od první verze; apply skill neznámou verzi odmítne s vysvětlením, nikdy nehádá. Fáze 0 plní jen `changes[].type: "text"` a `comments[]`. Každý target nese **tři redundantní identifikátory** (cx-id ↔ selektor ↔ textový otisk), od fáze 1 + screenshot výřez, aby mapování na zdroj přežilo minifikované class names a dynamické selektory.

## 9. `/apply-review` — mapování na zdroj

Skill instruuje agenta postupovat v pořadí:
1. `sourceHint` (zdrojové stopy, viz níže) → přímo soubor a řádek.
2. Grep `textFingerprint` / `before` textu v repu → kandidátní soubory (pozor na i18n — text může vést do překladového souboru, styl do komponenty).
3. Selektor → hledání class names / struktur v šablonách a komponentách.
4. Screenshot výřez → vizuální dohledání, pokud vše selže.

**Zdrojové stopy (fáze 2):** build-time plugin (Vite/Babel) přidávající v dev buildu `data-source-loc="soubor:řádek"`. Zvedá přesnost mapování z heuristické na deterministickou; funguje jen na vlastních projektech s dev buildem — heuristiky zůstávají fallback pro cizí a produkční stránky.

Pravidla: přímé edity (`changes`) se provádějí 1:1 bez interpretace; komentáře (`comments`) agent nejprve rozpadne na plán a u kategorie `question` odpoví místo editace. `offSystem` změny agent zkusí přemapovat na nejbližší token a rozdíl vykáže. Po aplikaci agent vygeneruje `applied.md` — tabulka změna → soubor:řádek → stav, a **od fáze 0 počítá poměr applied / needs-input / skipped** — tvrdá metrika kvality mapování. Ideálně následuje re-snapshot pro vizuální diff (fáze 3).

## 10. `/design-demo` — HTML demo design systému

**Staví se jako první, před fází 0** (viz §13) — nemá žádnou z těžkých závislostí (snapshot, server, overlay) a nese okamžitou hodnotu. Vstupem první verze je **ručně napsaný `tokens.json`**; napojení na `/extract-tokens` přijde ve fázi 2. Time-box: 1–2 Claude Code session — demo je prostředek, ne cíl, riziko donekonečna laděného vizuálního artefaktu je reálné.

Vygeneruje **jediný samostatný HTML soubor** — živý styleguide. Bez build kroku, bez závislostí — otevře se kdekoli, dá se poslat klientovi.

Obsah dema:
- **Barvy:** palety s názvy tokenů, hex hodnotami a automatickou kontrolou kontrastu (WCAG AA/AAA badge pro text na daném pozadí).
- **Typografie:** škála (velikost, řez, řádkování) předvedená na reálném textu, párování nadpis/odstavec.
- **Spacing, radii, stíny:** vizuální žebříčky s tokeny.
- **Komponenty** *(fáze 4, vyžaduje styly z kódu)*: tlačítka, formulářové prvky, karty, alerty — stavy vykreslené staticky vedle sebe.
- **Přepínače:** light/dark režim (pokud tokeny obsahují obě sady).
- **Ukázková stránka:** jedna kompozitní sekce (hero + karty + formulář) složená čistě z tokenů.

Vedlejší přínosy pořadí „demo první": schéma `tokens.json` (pozdější páteř CSS panelu) dostane tvar na reálném použití, repo začne něčím hotovým, a hotové demo poslouží jako první testovací stránka pro canvas ve fázi 0 — uzavřená smyčka bez cizích proměnných.

## 11. `/extract-tokens` (fáze 2)

Ze stránky (computed styles + custom properties) nebo ze zdrojáků (Tailwind config, CSS vars, SCSS proměnné) vytěží `tokens.json`. Slouží (a) editoru jako nabídka povolených hodnot, (b) agentovi jako reference design systému, (c) jako vstup pro `/design-demo` u existujících systémů.

## 12. HTML prezentace (`html-deck` skill, fáze 4)

Tentýž canvas, plus: navigace po slidech (snapshot per slide u reveal.js apod., nebo scroll-sekce), `review.json` se strukturou `slides[]`, a instrukce pro agenta, jak edity promítnout zpět do zdroje prezentace (reveal.js markdown, HTML export, Marp). U prezentací se povolí i volnější editace layoutu (posun absolutně pozicovaných elementů). Základní review prezentace jako obyčejné HTML stránky ale funguje už od fáze 0.

## 13. Fáze vývoje

**Krok D — demo (první, time-box 1–2 session):** `packages/demo-generator` + `design-system-demo` skill nad ručním `tokens.json`. Okamžitě použitelné (prorate.eu).

**Spike — ověření SingleFile** (den): viz §4. Rozhoduje mezi SingleFile a vlastním enginem dřív, než na snapshot cokoli naváže.

**Fáze 0 — smyčka:** snapshot lokálního HTML souboru → minimální overlay (výběr, komentáře, editace textu; bez undo, bez CSS, bez screenshotů) → `review.json` v1 → `/apply-review` s grep mapováním + metrika applied/needs-input. Kompletní end-to-end ověření konceptu; použitelné na prezentace a statické weby.

**Fáze 1 — editor:** snapshoty URL bez autentizace, skrytí/smazání/duplikace elementů, seznam změn + undo, screenshoty (před/po, výřezy ke komentářům).

**Fáze 2 — design systém:** `/extract-tokens`, CSS panel s nabídkou tokenů, viewport přepínač, zdrojové stopy (Vite/Babel plugin), napojení extrakce na `/design-demo`.

**Fáze 3 — přihlášené aplikace:** `--profile` režim, re-snapshot diff po aplikaci.

**Fáze 4 — rozšíření:** `html-deck` specializace, drag přesuny, komponentové ukázky v demu ze zdrojového kódu, integrace s harness workflow (review jako artefakt case složky).

## 14. Technologický stack

- **Node 22+, pnpm workspace** (konzistentně s harness), TypeScript v `packages/`.
- **single-file-cli** jako externí proces pro serializaci; **Playwright** pro `--profile` režim a screenshoty.
- **canvas-server:** holé `node:http` nebo Fastify; overlay čistý ES modul bez buildu.
- **demo-generator:** čistá šablona (template literals / Eta) nad `tokens.json` — žádný runtime framework v demu.
- Žádná databáze — event log je JSONL v `.ui-skills/session-<ts>/`.
- Licence **MIT**; AGPL závislosti (single-file-cli) pouze jako volané procesy — pravidlo zakotvené v CLAUDE.md.
- Distribuce: Claude Code marketplace (`/plugin marketplace add petrpus/ui-skills`), CLI přes `pnpm dlx` nebo lokální `bin/`.

## 15. Otevřené otázky

1. Jeden review = jedna stránka, nebo multi-page session? (Proklik ve snapshotu nefunguje — je zmrazený; multi-page by znamenalo sadu snapshotů se společným review.json.)
2. Formát `tokens.json` — navrhne se při stavbě dema (krok D); zvážit kompatibilitu s W3C Design Tokens draft formátem vs. vlastní jednodušší schéma.
