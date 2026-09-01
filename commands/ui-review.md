---
description: Vizuální review HTML souboru — zachytí, naservíruje s editorem a počká na „Hotovo"
argument-hint: "<soubor.html> [--work-dir <adresář>]"
---

Spusť vizuální review jedním příkazem:

Argumenty: $ARGUMENTS

1. Spusť `pnpm ui-review $ARGUMENTS` **na pozadí** — příkaz blokuje, dokud
   člověk review v prohlížeči neuzavře.
2. Jakmile vypíše `✓ canvas: http://localhost:<port>`, ukaž uživateli URL
   a požádej ho, ať v prohlížeči stránku projde: klik vybírá, dvojklik
   edituje text na místě, „Hotovo" nebo Ctrl+Enter končí.
3. Počkej, než proces skončí a vypíše `✓ review: <cesta>`.
4. Načti `review.json` z vypsané cesty a pokračuj podle něj (aplikaci změn
   řeší `/apply-review`, neaplikuj je sám od sebe).

Editor ani server nestav sám — všechna logika je v `packages/canvas-server`.
