# ui-skills — pravidla projektu

## Licenční pravidlo: SingleFile (AGPL-3.0)

`single-file-cli` je AGPL-3.0. Toto repo je MIT. Proto **bez výjimky**:

- SingleFile se volá **výhradně jako externí proces** (spawn CLI).
- **Nikdy** se nelinkuje jako knihovna (žádný `import`/`require`).
- **Nikdy** se z něj nepřebírá kód ani úryvky — ani „jen ta jedna funkce".
- V README je uveden jako vyžadovaná externí závislost, ne jako vendored kód.

Totéž platí pro jakoukoli další AGPL/GPL závislost.

## Struktura

- `skills/`, `commands/` — tenká orchestrační vrstva pro agenta.
- `packages/` — veškerá deterministická práce (TypeScript CLI nástroje). Agent je
  jen volá. Drží to kontext malý a chování reprodukovatelné.
- `spec/SPEC-ui-skills.md` — zdroj pravdy pro záběr a fázování.

Nová logika patří do `packages/`, ne do SKILL.md.

## Stack

Node 22+, pnpm workspace, TypeScript v `packages/`. Overlay editoru je čistý ES
modul bez buildu a bez frameworku. Demo generátor nesmí do výstupu vložit žádný
runtime framework — výstupem je jeden samostatný HTML soubor.

## Pracovní data

Snapshoty, event logy a review výstupy patří do `.ui-skills/` v cílovém projektu
a vždy do `.gitignore` — mohou obsahovat citlivá data z přihlášených session.
