/**
 * The demo's own chrome. Deliberately neutral and desaturated: it frames the
 * design system being shown and must never compete with it for attention.
 */
export const DEMO_STYLES = `
:root {
  color-scheme: light;
  --ui-bg: #fbfbfc;
  --ui-panel: #ffffff;
  --ui-ink: #1c1c1f;
  --ui-ink-soft: #6b6b76;
  --ui-line: #e4e4e9;
  --ui-radius: 10px;
  --ui-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ui-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}

/*
 * The demo's own chrome follows the switch as well. Without this the page frame
 * would stay bright around a system that has gone dark, which tells a reader
 * nothing about how their own design behaves.
 */
html:has(#theme-dark:checked) {
  color-scheme: dark;
  --ui-bg: #121214;
  --ui-panel: #1c1c1f;
  --ui-ink: #f4f4f5;
  --ui-ink-soft: #a1a1aa;
  --ui-line: #2e2e33;
}

* { box-sizing: border-box; }

.theme__input { position: absolute; opacity: 0; pointer-events: none; }
.theme {
  display: inline-flex; align-items: center; gap: 0.5rem;
  margin-top: 1rem; cursor: pointer; user-select: none;
  font-size: 0.8125rem; color: var(--ui-ink-soft);
}
.theme__track {
  width: 2.25rem; height: 1.25rem; border-radius: 999px;
  background: var(--ui-line); position: relative; transition: background 120ms;
}
.theme__knob {
  position: absolute; top: 0.1875rem; left: 0.1875rem;
  width: 0.875rem; height: 0.875rem; border-radius: 999px;
  background: var(--ui-panel); box-shadow: 0 1px 2px rgba(0,0,0,.3);
  transition: transform 120ms;
}
html:has(#theme-dark:checked) .theme__knob { transform: translateX(1rem); }
.theme__input:focus-visible + .theme .theme__track { outline: 2px solid var(--ui-ink); outline-offset: 2px; }

/*
 * Scoped to their container rather than left as bare class rules. A later
 * `.mode { display: … }` written for spacing would otherwise tie on specificity
 * and win on source order, which is precisely how both modes ended up visible
 * at once the first time.
 */
.contrast__ratio .mode--dark { display: none; }
html:has(#theme-dark:checked) .contrast__ratio .mode--light { display: none; }
html:has(#theme-dark:checked) .contrast__ratio .mode--dark { display: block; }
.contrast__grade { display: block; margin-top: 0.25rem; }

body {
  margin: 0;
  padding: 0 0 6rem;
  background: var(--ui-bg);
  color: var(--ui-ink);
  font-family: var(--ui-font);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.wrap { max-width: 68rem; margin: 0 auto; padding: 0 1.5rem; }

.masthead { padding: 3.5rem 0 2rem; border-bottom: 1px solid var(--ui-line); margin-bottom: 2.5rem; }
.masthead__eyebrow {
  font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ui-ink-soft); margin: 0 0 0.5rem;
}
.masthead__title { font-size: 2rem; font-weight: 600; margin: 0; letter-spacing: -0.02em; }
.masthead__meta { color: var(--ui-ink-soft); font-size: 0.875rem; margin: 0.75rem 0 0; }

.section { margin-bottom: 3.5rem; }
.section__title {
  font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ui-ink-soft);
  margin: 0 0 1.25rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--ui-line);
}

.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 1rem; }

.swatch {
  background: var(--ui-panel); border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius); overflow: hidden;
}
.swatch__chip {
  height: 5rem; border-bottom: 1px solid var(--ui-line);
  background-image:
    linear-gradient(45deg, #ececed 25%, transparent 25%, transparent 75%, #ececed 75%),
    linear-gradient(45deg, #ececed 25%, transparent 25%, transparent 75%, #ececed 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}
.swatch__chip span { display: block; height: 100%; }
.swatch__body { padding: 0.75rem 0.875rem 0.875rem; }
.swatch__name { font-family: var(--ui-mono); font-size: 0.8125rem; font-weight: 600; }
.swatch__value {
  font-family: var(--ui-mono); font-size: 0.75rem;
  color: var(--ui-ink-soft); margin-top: 0.125rem;
}
.swatch__chain {
  font-family: var(--ui-mono); font-size: 0.6875rem;
  color: var(--ui-ink-soft); margin-top: 0.25rem;
}
.swatch__css {
  font-family: var(--ui-mono); font-size: 0.6875rem;
  color: var(--ui-ink-soft); margin-top: 0.25rem; opacity: 0.8;
}
.swatch__dark {
  font-family: var(--ui-mono); font-size: 0.6875rem;
  color: var(--ui-ink-soft); margin-top: 0.25rem;
}
.swatch__note { font-size: 0.75rem; color: var(--ui-ink-soft); margin-top: 0.5rem; }

.section__note {
  font-size: 0.8125rem; color: var(--ui-ink-soft); margin: -0.5rem 0 1rem;
}

.contrast {
  width: 100%; border-collapse: separate; border-spacing: 0;
  background: var(--ui-panel); border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius); overflow: hidden;
}
.contrast td { padding: 0.625rem 0.875rem; border-bottom: 1px solid var(--ui-line); }
.contrast tr:last-child td { border-bottom: 0; }
.contrast__pair { font-family: var(--ui-mono); font-size: 0.75rem; white-space: nowrap; }
.contrast__pair span { color: var(--ui-ink); font-weight: 600; }
.contrast__preview { font-size: 0.875rem; }
.contrast__preview--none { color: var(--ui-ink-soft); font-style: italic; }
.contrast__ratio {
  font-family: var(--ui-mono); font-size: 0.8125rem;
  text-align: right; white-space: nowrap;
}
.contrast__ratio .badge { font-family: var(--ui-font); }

.badge {
  display: inline-block; font-size: 0.6875rem; font-weight: 600;
  letter-spacing: 0.04em; padding: 0.125rem 0.5rem; border-radius: 999px;
  white-space: nowrap;
}
.badge--pass { background: #dcfce7; color: #14532d; }
html:has(#theme-dark:checked) .badge--pass { background: #14532d; color: #dcfce7; }
.badge--partial { background: #fef3c7; color: #713f12; }
html:has(#theme-dark:checked) .badge--partial { background: #713f12; color: #fef3c7; }
.badge--fail { background: #fee2e2; color: #7f1d1d; }
html:has(#theme-dark:checked) .badge--fail { background: #7f1d1d; color: #fee2e2; }
.badge--unknown { background: #f4f4f5; color: #52525b; }

.types { display: grid; gap: 1rem; }

.type {
  background: var(--ui-panel); border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius); padding: 1rem 1.25rem;
}
.type__label { display: flex; gap: 0.75rem; align-items: baseline; flex-wrap: wrap; }
.type__name { font-family: var(--ui-mono); font-size: 0.75rem; font-weight: 600; }
.type__meta { font-family: var(--ui-mono); font-size: 0.6875rem; color: var(--ui-ink-soft); }
.type__sample { margin: 0.625rem 0 0; overflow-wrap: anywhere; }

.pairing {
  background: var(--ui-panel); border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius); padding: 1.5rem;
}
.pairing__heading { margin: 0.5rem 0 0.75rem; }
.pairing__body { margin: 0; max-width: 42em; }

.scale__caption {
  font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ui-ink-soft); margin: 0;
}
.scale__note { font-size: 0.75rem; color: var(--ui-ink-soft); margin: 0.5rem 0 0; }
.scale__css { font-family: var(--ui-mono); font-size: 0.6875rem; color: var(--ui-ink-soft); }

.rulers { display: grid; gap: 0.625rem; }
.ruler {
  background: var(--ui-panel); border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius); padding: 0.75rem 1rem;
}
.ruler__label { display: flex; gap: 0.75rem; align-items: baseline; }
.ruler__name { font-family: var(--ui-mono); font-size: 0.75rem; font-weight: 600; }
.ruler__value { font-family: var(--ui-mono); font-size: 0.6875rem; color: var(--ui-ink-soft); }
.ruler__bar {
  height: 0.75rem; margin-top: 0.5rem; border-radius: 2px; min-width: 2px;
  background: repeating-linear-gradient(
    45deg, #c7d2fe, #c7d2fe 6px, #a5b4fc 6px, #a5b4fc 12px
  );
}

.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 1rem; }
.tiles--roomy { gap: 1.75rem; }
.tile {
  background: var(--ui-panel); border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius); padding: 1rem; text-align: center;
}
.tile__shape { height: 4.5rem; margin-bottom: 0.75rem; }
.tile__shape--radius { background: #c7d2fe; }
.tile__shape--shadow { background: var(--ui-panel); border-radius: 6px; }
.tile__name { font-family: var(--ui-mono); font-size: 0.75rem; font-weight: 600; }
.tile__value {
  font-family: var(--ui-mono); font-size: 0.6875rem;
  color: var(--ui-ink-soft); overflow-wrap: anywhere;
}

.showcase { display: grid; gap: 1.5rem; }
.showcase__hero { max-width: 40em; }
.showcase__heading { margin: 0; }
.showcase__lead { margin: 0; }
.showcase__button {
  display: inline-block; border: 0; cursor: default;
  padding: 0.625rem 1.25rem; font-weight: 600;
}
.showcase__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; }
.showcase__card { border: 1px solid; }
.showcase__card-title { margin: 0; font-weight: 600; }
.showcase__card-text { margin: 0; }
.showcase__form { border: 1px solid; max-width: 26rem; }
.showcase__label { display: block; font-weight: 600; }
.showcase__field { display: block; width: 100%; border: 1px solid; font: inherit; }
.showcase__error { margin: 0; }

.empty {
  color: var(--ui-ink-soft); font-size: 0.9375rem;
  border: 1px dashed var(--ui-line); border-radius: var(--ui-radius); padding: 1.5rem;
}
`.trim();
