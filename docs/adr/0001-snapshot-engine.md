# ADR-0001: Snapshot engine

**Stav:** přijato předběžně · **Datum:** 17. 8. 2026 · **Rozhoduje:** issue #2

## Kontext

Celý projekt stojí na předpokladu, že snapshot zachová **živé stylesheety** — ne
obrázek stránky, ne computed styly zapečené na každém elementu, ale skutečnou
kaskádu, ve které dál fungují custom properties a media queries.

Na tom předpokladu visí CSS panel a viewport přepínač (fáze 2), instrumentace
(fáze 0) i bezpečnost servírování snapshotu z localhostu. Rozdíl mezi „SingleFile
stačí" a „musíme napsat vlastní stylesheet-preserving engine" je řádově týdny
práce, a spec §4 proto žádá, aby se rozhodlo experimentem, ne odhadem.

Měření je v `packages/snapshot/spike/`, spustitelné přes
`pnpm spike:snapshot <url|soubor>`. Reprodukovatelné na jiné stránce a jiný den.

## Na čem se měřilo — a na čem ne

| Cíl | Proč |
| --- | --- |
| `packages/snapshot/fixtures/control.html` | vlastní vzorek se známými odpověďmi: custom properties, media queries, shadow DOM, běhově vložený styl, skript přepisující text |
| github.com (stránka repozitáře) | vlastní design systém (Primer), klientsky renderovaný výpis souborů |
| mui.com (dokumentace) | jiný design systém, barvy skládané z kanálů, Emotion |

**Cronos, tedy cíl, který spec jmenuje, změřený nebyl.** Spec ho volí záměrně:
je to netriviální aplikace za přihlášením a „snapshot statické marketingové
stránky by prošel a nic by neověřil". Přihlášení se podle issue #2 mělo vyřešit
ručně; k té aplikaci ale nemá přístup ten, kdo spike prováděl. Nahrazen byl
dvěma veřejnými aplikacemi srovnatelné složitosti — což je **slabší důkaz**, ne
rovnocenný. Proto je stav *přijato předběžně*: viz „Co by rozhodnutí obrátilo".

## Měření

| Kritérium | Kontrolní vzorek | GitHub | MUI |
| --- | --- | --- | --- |
| (a) custom properties přežily | 5 z 5 | 2035 z 2230 | 776 ze 777 |
| (a) a jsou přepsatelné | **5 z 5** | **4 z 12** | **3 z 12** |
| (b) media queries reagují | ano, 8→8 skrytých | ano, 154→208 skrytých | ano, 55→60 skrytých |
| (c) obsahová kostra sedí | 100 % (šum 0 %) | **78,5 %** (šum 0 %) | 67,7 % (šum 29,6 %) |
| (d) kopie je netečná | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Velikost a čas: 3 kB / 4,1 s · 1027 kB / 11,4 s · 1292 kB / 7,8 s.

U (a) se zapisuje zlomek, ne „ano" — polovina hodnoty tohohle čísla je v tom,
jak je těsné. U (c) je vedle výsledku šum, tedy jak moc se stránka liší sama od
sebe mezi dvěma načteními; bez něj to číslo nejde číst. U MUI je šum 29,6 %,
takže 67,7 % znamená „ne horší než sama stránka", u GitHubu je šum nulový a
78,5 % je skutečná ztráta.

## Rozhodnutí

**Pokračuje se se SingleFile.** Kritéria (a) a (b) prošla na všech třech cílech,
což je podle rozhodovacího pravidla v issue #2 podmínka pro to nezahajovat
vlastní engine.

Custom properties nepřežijí jen jako text — přepsání jedné z nich ve snapshotu
skutečně změní, co se vykreslí. Media query se v kopii přepne a layout na to
reaguje skrýváním a odkrýváním prvků. Kopie neběží: nula skriptů, nula síťových
požadavků, nula změn DOM.

## Co měření také ukázalo

**Kritérium (c) neprošlo na GitHubu — 78,5 % proti nulovému šumu.** Chybí výpis
souborů, který se vykresluje Reactem. Markup je v souboru přítomný, ale ne jako
živé prvky.

**Kritéria (c) a (d) jdou proti sobě.** `--block-scripts` má výchozí hodnotu
`true`, tedy SingleFile blokuje skripty **už při zachycení** — proto se klientský
obsah nevykreslí. Vypnutí toho příznaku vrátí 15 `<script>` elementů do výstupu,
čímž padá netečnost, a počet živých prvků se stejně nezmění.

**Nápad, jak z toho ven, není ověřený.** SingleFile má `--browser-server` pro
připojení k běžícímu prohlížeči, což by dovolilo nechat stránku ustálit
prohlížečem, který řídíme my, a teprve pak ji serializovat. CLI ale pořád
vyžaduje URL a řídí si vlastní načtení; že jde připojit se k už hydratované
záložce a navigaci přeskočit, **změřené není**. Fáze 0 to musí brát jako
otevřené riziko, ne jako hotové řešení.

**SingleFile potřebuje ukázat na prohlížeč se sítí.** Jeho vlastní prohlížeč
v tomhle prostředí otevřel lokální soubory, ale na žádnou URL nedosáhl a hlásil
jen `fetch failed`. S `--browser-executable-path` na chromium z Playwrightu
funguje — a obě strany pak renderují týmž prohlížečem, což porovnání stejně
předpokládá.

**Výstup se nikdy nepřepisuje.** Existující cílový soubor SingleFile nechá být
a zapíše vedle něj `snapshot (1).html`, s návratovým kódem 0. Skript, který pak
čte původní cestu, měří první zachycení, které kdy udělal — a to bez jediného
varování. Spike proto cílový adresář před každým během maže a kontroluje, že
zapsaný soubor je mladší než ten běh.

**Selhání se tváří jako úspěch.** Při nezachycení skončí proces s kódem 0 a jen
nic nezapíše; a neplatná hodnota `--browser-wait-until` se neodmítne, ale spadne
do řetězu opakování, kde se čeká na timeout — jeden překlep stál 68 s místo 4 s
na každý snapshot.

**Instrumentace nesmí přenášet selektory z originálu.** Odstranění skriptů posune
`nth-child` indexy (13/17 na kontrolním vzorku, 0/20 na obou aplikacích). Spec
s tím počítá — instrumentace je vlastní krok **nad snapshotem** — ale je to past,
na kterou by se dalo snadno šlápnout.

**Cross-origin stylesheety nejdou přečíst přes CSSOM.** Na živé MUI vidí prohlížeč
přes `document.styleSheets` jediné media rule, přestože jich snapshot obsahuje
142. Cokoli, co bude chtít fáze 2 vytěžit ze stránky, musí počítat s tím, že
z živé stránky je čitelná jen část — ze snapshotu, který je same-origin, všechno.

**HTML se minifikuje** a shadow DOM se serializuje deklarativně. Porovnávání
proto musí normalizovat bílé místo a procházet i shadow rooty.

## Důsledky

- Fáze 0 může začít; vlastní snapshot engine se nepíše.
- Fáze 0 musí vyřešit zachycení klientsky renderovaného obsahu a brát
  `--browser-server` jako neověřenou hypotézu.
- Instrumentace dostane redundantní identifikátory (xpath + textový otisk) ne
  jako pojistku, ale jako nutnost.
- `single-file-cli` zůstává vývojová závislost volaná jako proces. Nikdy se
  nelinkuje ani nepřebírá kód; repo zůstává MIT (viz CLAUDE.md).

## Co by rozhodnutí obrátilo

- **Měření na Cronosu**, které by u (a) nebo (b) dopadlo jinak. Dokud
  neproběhne, je tenhle verdikt podložený dvěma náhradními cíli.
- **Nemožnost zachytit klientsky renderovaný obsah** ani přes `--browser-server`.
  Znamenalo by to, že nástroj nefunguje na většině moderních aplikací, a otázka
  vlastního enginu se otevírá znovu.

V obou případech se toto ADR nahrazuje, ne edituje.
