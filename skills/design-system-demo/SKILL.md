---
name: design-system-demo
description: Vygeneruje z tokens.json jediný samostatný HTML soubor — živý styleguide design systému (barvy, kontrasty, typografie, spacing, radii, stíny). Použij, když uživatel chce vidět design systém, ukázat ho klientovi, zkontrolovat kontrasty, nebo řekne "demo design systému", "styleguide", "/design-demo".
---

# Skill: design-system-demo

Tenká orchestrace nad `packages/demo-generator`. Veškerá deterministická práce
je v CLI — tvůj úkol je najít vstup, zavolat nástroj a výsledek srozumitelně
předat. **Nesestavuj HTML sám** a negeneruj tokeny odhadem.

## Postup

### 1. Najdi `tokens.json`

V tomto pořadí:

1. cesta, kterou uživatel předal;
2. `tokens.json` v kořeni projektu;
3. `design/tokens.json`, `docs/tokens.json`.

Když soubor neexistuje, nástroj ho **sám založí** s neutrálním základem a rovnou
z něj vygeneruje demo. Nech to na něm: **nezakládej `tokens.json` sám podle
svého odhadu** a neopisuj tokeny z Tailwind configu ani z CSS — vytěžení ze
zdrojáků je `/extract-tokens` (fáze 2).

Po založení základu řekni uživateli, že hodnoty jsou zástupné a čekají na
přepsání. Existující `tokens.json` nástroj nikdy nepřepíše.

### 2. Zavolej generátor

```bash
pnpm design-demo <cesta-k-tokens.json> [--out <soubor>]
```

Bez `--out` vznikne `demo.html` vedle `tokens.json`.

### 3. Předej výsledek

- Vypiš cestu k demu jako klikatelný `file://` odkaz.
- Když nástroj skončí chybou, **předej ji doslova** — hlášky pojmenovávají
  konkrétní token a problém. Nezkoušej `tokens.json` opravit sám, pokud tě
  o to uživatel nepožádal.
- Zmiň, co v demu chybí a proč, pokud to nástroj hlásil (typicky chybějící
  role → vynechaná ukázková sekce).

## Hranice

- Demo je **jeden samostatný soubor** bez externích zdrojů — žádné CDN, žádné
  stahované fonty, žádný framework. Kdyby to někdy přestalo platit, je to chyba
  v generátoru, ne věc k obejití ve skillu.
- Vizuální ladění dema patří do `packages/demo-generator`, ne do jednorázových
  úprav vygenerovaného HTML. Vygenerovaný soubor je výstup, ne zdroj.
