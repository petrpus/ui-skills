---
description: Promítne review.json do zdrojáků — editace 1:1, komentáře do plánu, poměr applied/needs-input
argument-hint: "[review.json] [--root <adresář>] [--dry-run]"
---

Aplikuj review do zdrojových souborů:

Argumenty: $ARGUMENTS

1. Bez argumentu najdi nejnovější `review.json` v `.ui-skills/session-*/`.
2. Spusť `pnpm apply-review <cesta> [--root …]`. Přímé editace provede CLI
   samo 1:1; nic neinterpretuj a nemapuj ručně — mapování je deterministická
   práce CLI.
3. Otevři vzniklý `applied.md` a dořeš, co CLI nechalo člověku/agentovi:
   - položky `needs-input` — prozkoumej vysvětlení a navrhni uživateli řešení,
     **nehádej a neměň náhodný podobný řádek**,
   - komentáře `odpovědět` (kategorie `question`) — odpověz, needituj,
   - komentáře `rozpadnout na plán` — rozpadni na plán a navrhni postup
     podle priority.
4. Uživateli vykaž poměr **applied / needs-input / skipped** — je to metrika
   kvality mapování, ne detail.

Nález v překladovém souboru je v poznámce označen — změna platí jen pro danou
lokalizaci, na ostatní jazyky upozorni.
