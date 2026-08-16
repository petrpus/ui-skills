# ui-skills

Sada Claude Code skills pro design, ladění a revizi UI.

Umožňuje revidovat živé UI **vizuálně** — klikáním a psaním přímo do stránky —
a předat agentovi strojově čitelný changeset, který promítne do zdrojového kódu.

**Snapshot-first přístup:** pracuje se nad zmrazenou replikou stránky, takže to
funguje nad čímkoli — včetně aplikací za přihlášením, produkčních URL a
statických HTML souborů, bez integrace do build pipeline.

## Stav

Ve vývoji. Kompletní specifikace: [`spec/SPEC-ui-skills.md`](spec/SPEC-ui-skills.md).

## Plánované skills a příkazy

| Příkaz | Co dělá |
| --- | --- |
| `/design-demo [tokens.json]` | vygeneruje jediný samostatný HTML soubor — živý styleguide design systému |
| `/ui-review <url\|soubor> [--profile]` | zachytí stránku, otevře vizuální editor, vrátí `review.json` |
| `/apply-review [review.json]` | namapuje změny z review na zdrojové soubory a provede je |
| `/extract-tokens <url\|soubor>` | vytěží `tokens.json` ze stránky nebo ze zdrojáků |

## Závislosti

- Node 22+, pnpm
- [single-file-cli](https://github.com/gildas-lormeau/single-file-cli) — volán
  výhradně jako externí proces (je AGPL-3.0; viz [CLAUDE.md](CLAUDE.md))
- Playwright — pro `--profile` režim a screenshoty

## Instalace

```
/plugin marketplace add petrpus/ui-skills
```

Plně nezávislé na [claude-code-harness](https://github.com/petrpus/claude-code-harness),
ale kompatibilní s jeho konvencemi — lze je instalovat vedle sebe a řetězit.

## Licence

MIT
