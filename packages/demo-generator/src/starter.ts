import { SCHEMA_VERSION } from "@ui-skills/schema";

/**
 * A neutral system to overwrite, not to keep. Every value here is deliberately
 * unremarkable — the point is a file with the right shape and something on the
 * screen within seconds, so the first act is editing rather than authoring.
 *
 * It doubles as documentation of the format. JSON has no comments, so the
 * explanation lives in `_readme`, which validation ignores along with any other
 * key it does not know, and in `description` fields that the demo shows.
 */
export function starterTokens(): Record<string, unknown> {
  return {
    _readme: [
      "Vygenerovaný základ — přepiš hodnoty svými a spusť /design-demo znovu.",
      "Token má buď value (vlastní hodnota), nebo ref na jiný token.",
      "Odkazy drží paletu na jednom místě: změna blue-600 se propíše všude, kde se používá.",
      "css je nepovinné mapování na CSS custom property.",
      "roles říkají demu, který token je text a který pozadí — z toho se počítají kontrasty.",
      "Sekce, kterou nepotřebuješ, klidně smaž; demo ji prostě nevykreslí.",
    ],
    schemaVersion: SCHEMA_VERSION,
    name: "Můj design systém",

    color: {
      "blue-600": { value: "#2563eb" },
      "blue-700": { value: "#1d4ed8" },
      "zinc-900": { value: "#18181b" },
      "zinc-500": { value: "#71717a" },
      "zinc-200": { value: "#e4e4e7" },
      "zinc-100": { value: "#f4f4f5" },
      white: { value: "#ffffff" },
      "red-600": { value: "#dc2626" },

      ink: {
        ref: "color.zinc-900",
        css: "--color-ink",
        description: "Základní text. Sémantický token — ukazuje do palety.",
      },
      "ink-muted": { ref: "color.zinc-500", css: "--color-ink-muted" },
      paper: { ref: "color.white", css: "--color-paper" },
      canvas: { ref: "color.zinc-100", css: "--color-canvas" },
      rule: { ref: "color.zinc-200", css: "--color-rule" },
      brand: { ref: "color.blue-600", css: "--color-brand" },
      "on-brand": { ref: "color.white", css: "--color-on-brand" },
      danger: { ref: "color.red-600", css: "--color-danger" },
      "on-danger": { ref: "color.white", css: "--color-on-danger" },
    },

    roles: {
      text: "color.ink",
      "text-muted": "color.ink-muted",
      surface: "color.paper",
      "surface-2": "color.canvas",
      border: "color.rule",
      primary: "color.brand",
      "on-primary": "color.on-brand",
      danger: "color.danger",
      "on-danger": "color.on-danger",
    },

    typography: {
      display: {
        size: "3rem",
        lineHeight: "1.1",
        weight: "600",
        letterSpacing: "-0.02em",
        css: "--text-display",
        description: "Největší stupeň. Řádkování pod 1.2 sráží diakritiku — koukni níž.",
      },
      title: { size: "1.75rem", lineHeight: "1.25", weight: "600", css: "--text-title" },
      body: { size: "1rem", lineHeight: "1.6", css: "--text-body", description: "Základní text" },
      small: { size: "0.875rem", lineHeight: "1.5", css: "--text-small" },
      caption: { size: "0.75rem", lineHeight: "1.4", css: "--text-caption" },
    },

    spacing: {
      "space-1": { value: "4px", css: "--space-1" },
      "space-2": { value: "8px", css: "--space-2" },
      "space-3": { value: "12px", css: "--space-3" },
      "space-4": { value: "16px", css: "--space-4" },
      "space-6": { value: "24px", css: "--space-6" },
      "space-8": { value: "32px", css: "--space-8" },
      "space-12": { value: "48px", css: "--space-12" },
    },

    radius: {
      none: { value: "0", css: "--radius-none" },
      sm: { value: "4px", css: "--radius-sm" },
      md: { value: "8px", css: "--radius-md" },
      lg: { value: "16px", css: "--radius-lg" },
      full: { value: "999px", css: "--radius-full" },
    },

    shadow: {
      sm: { value: "0 1px 2px rgba(0,0,0,.06)", css: "--shadow-sm" },
      md: { value: "0 4px 12px rgba(0,0,0,.10)", css: "--shadow-md" },
      lg: { value: "0 12px 32px rgba(0,0,0,.14)", css: "--shadow-lg" },
    },
  };
}

export function serializeStarter(): string {
  return `${JSON.stringify(starterTokens(), null, 2)}\n`;
}
