# ADR-0001: Snapshot engine

**Stav:** přijato · **Datum:** 17. 8. 2026 · **Rozhoduje:** issue #2

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

## Měření

Dva cíle: vlastní kontrolní vzorek se známými odpověďmi
(`packages/snapshot/fixtures/control.html`) a veřejná stránka GitHubu, tedy
netriviální aplikace s vlastním design systémem (Primer) a klientským
renderováním.

| Kritérium | Kontrolní vzorek | GitHub |
| --- | --- | --- |
| (a) custom properties přežily | 4 ze 4 | **2035 z 2230** |
| (a) a jsou přepsatelné | ano | ano |
| (b) media queries reagují | 2 prvky | **75 prvků** mezi 1280 a 400 px |
| (c) obsahová kostra sedí | 100 % | **78,5 %** |
| (d) kopie je netečná | 0 skriptů, 0 požadavků, 0 změn DOM | totéž |

Velikost a čas: 2 kB / 4,1 s pro kontrolní vzorek, 1 MB / 9,7 s pro GitHub.

## Rozhodnutí

**Pokračuje se se SingleFile.** Kritéria (a) a (b) prošla, což je podle
rozhodovacího pravidla v issue #2 podmínka pro to nezahajovat vlastní engine.

Custom properties nepřežijí jen jako text — přepsání jedné z nich ve snapshotu
skutečně překreslí prvky, které ji používají. Media queries reagují na změnu
šířky okna. Kopie neběží: nula skriptů, nula síťových požadavků, nula změn DOM.

## Co měření také ukázalo

Tohle je užitečnější než samotný verdikt, protože to jsou věci, na které by se
jinak narazilo až uprostřed fáze 0.

**Kritérium (c) neprošlo na klientsky renderované aplikaci — 78,5 %.** Číslo je
smysluplné jen proti šumu, a ten je nulový: **stránka se sama se sebou shodne na
100 %**, takže rozdíl nejde na vrub tomu, že se aplikace mezi dvěma načteními
mění. Chybí konkrétně výpis souborů, který GitHub vykresluje Reactem
(`react-directory-*`), a ikony v něm. Markup je v souboru přítomný, ale ne jako
živé prvky.

**Kritéria (c) a (d) jdou proti sobě.** `--block-scripts` má výchozí hodnotu
`true`, tedy SingleFile blokuje skripty **už při zachycení** — proto se klientský
obsah nevykreslí. Vypnutí toho příznaku ale vrátí 15 `<script>` elementů do
výstupu, čímž padá netečnost kopie. Ani při vypnutých skriptech se navíc počet
živých prvků nezměnil (1253 v obou případech), takže samotný příznak problém
neřeší.

**Cesta ven, kterou fáze 0 musí vyřešit:** nechat stránku načíst a ustálit
prohlížeč, který řídíme my (Playwright), a teprve pak ji serializovat — SingleFile
umí `--browser-server` a připojit se k běžícímu prohlížeči. Tím se odděluje
„dostat stránku do stavu, který chci revidovat" od „uložit ji", což je stejně
oddělení, které si vyžádá `--profile` režim ve fázi 3.

**SingleFile potřebuje ukázat na prohlížeč se sítí.** Jeho vlastní prohlížeč
v tomhle prostředí otevřel lokální soubory, ale na žádnou URL nedosáhl a hlásil
jen `fetch failed`. S `--browser-executable-path` na chromium z Playwrightu
funguje. Navíc pak obě strany renderují týmž prohlížečem, což porovnání stejně
předpokládá.

**Selhání se tváří jako úspěch.** Při nezachycení skončí proces s kódem 0 a jen
nic nezapíše; a neplatná hodnota `--browser-wait-until` se neodmítne, ale spadne
do řetězu opakování, kde se čeká na timeout — jeden překlep stál 68 s místo 4 s
na každý snapshot.

**Instrumentace nesmí přenášet selektory z originálu.** Odstranění skriptů posune
`nth-child` indexy, takže poziční selektory z originálu ve snapshotu neplatí
(13/17 na kontrolním vzorku, 0/20 na GitHubu). Spec s tím počítá — instrumentace
je vlastní krok **nad snapshotem** — ale je to past, na kterou by se dalo snadno
šlápnout.

**HTML se minifikuje** a shadow DOM se serializuje deklarativně. Obojí znamená,
že porovnávání musí normalizovat bílé místo a procházet i shadow rooty.

## Důsledky

- Fáze 0 může začít; vlastní snapshot engine se nepíše.
- Fáze 0 musí vyřešit zachycení klientsky renderovaného obsahu. Dokud to není
  hotové, je nástroj spolehlivý na serverem renderovaných stránkách a na
  prezentacích, což je přesně to, co fáze 0 slibuje.
- Instrumentace dostane redundantní identifikátory (xpath + textový otisk) ne
  jako pojistku, ale jako nutnost — poziční selektory tu nefungují.
- `single-file-cli` zůstává vývojová závislost volaná jako proces. Nikdy se
  nelinkuje ani nepřebírá kód; repo zůstává MIT (viz CLAUDE.md).

## Co by rozhodnutí obrátilo

Kdyby se ukázalo, že klientsky renderovaný obsah nejde zachytit ani přes
`--browser-server`, znamenalo by to, že nástroj nefunguje na většině moderních
aplikací — a otázka vlastního enginu se otevírá znovu. Toto ADR se pak nahrazuje,
ne edituje.
