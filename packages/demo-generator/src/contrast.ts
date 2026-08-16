import type { ResolvedToken, ResolvedTokens } from "@ui-skills/schema";
import {
  type ContrastGrade,
  composite,
  contrastRatio,
  gradeContrast,
  parseColor,
} from "./color.ts";

/** How the pairs to check were arrived at. Shown in the demo, so a reader knows. */
export type ContrastSource = "roles" | "convention" | "fallback";

/** Which face of the tokens to measure. Dark mode has its own numbers. */
export type ContrastMode = "light" | "dark";

export interface ContrastCheck {
  readonly fg: ResolvedToken;
  readonly bg: ResolvedToken;
  /** Undefined when a value is not a colour this tool can read, e.g. `var(--x)`. */
  readonly ratio: number | undefined;
  readonly grade: ContrastGrade | undefined;
}

export interface ContrastReport {
  readonly source: ContrastSource;
  readonly checks: readonly ContrastCheck[];
}

/** Pairs a role map implies: text on the surfaces, and each `on-x` on its `x`. */
const ROLE_PAIRS = [
  ["text", "surface"],
  ["text", "surface-2"],
  ["text-muted", "surface"],
  ["text-muted", "surface-2"],
  ["on-primary", "primary"],
  ["on-danger", "danger"],
] as const;

/**
 * Deliberately narrow. Widening these to catch `ink`/`paper` would defeat the
 * point of roles: a system naming its colours that way is exactly the one the
 * role map exists for, and guessing at it produces pairs nobody asked to check.
 */
const FOREGROUND_PREFIXES = ["text-", "text", "fg-", "fg"];
const BACKGROUND_PREFIXES = ["surface-", "surface", "bg-", "bg"];

function startsWithAny(name: string, prefixes: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return prefixes.some((prefix) => lower === prefix || lower.startsWith(prefix));
}

/** In dark mode a token shows its override if it has one, its value otherwise. */
function faceValue(token: ResolvedToken, mode: ContrastMode): string {
  return mode === "dark" ? (token.dark ?? token.value) : token.value;
}

function check(fg: ResolvedToken, bg: ResolvedToken, mode: ContrastMode): ContrastCheck {
  const foreground = parseColor(faceValue(fg, mode));
  const background = parseColor(faceValue(bg, mode));
  const unknown = { fg, bg, ratio: undefined, grade: undefined };

  if (foreground === undefined || background === undefined) {
    return unknown;
  }

  // A translucent backdrop leaves the real colour dependent on whatever is
  // behind it, which the tool cannot know. Saying so beats inventing a number.
  if (background.a < 1) {
    return unknown;
  }

  const painted = foreground.a < 1 ? composite(foreground, background) : foreground;
  const ratio = contrastRatio(painted, background);
  return { fg, bg, ratio, grade: gradeContrast(ratio) };
}

function fromRoles(tokens: ResolvedTokens, mode: ContrastMode): ContrastReport | undefined {
  const roles = tokens.roles;
  if (roles === undefined) {
    return undefined;
  }

  const checks: ContrastCheck[] = [];
  for (const [fgRole, bgRole] of ROLE_PAIRS) {
    const fg = roles[fgRole];
    const bg = roles[bgRole];
    if (fg !== undefined && bg !== undefined) {
      checks.push(check(fg, bg, mode));
    }
  }

  return checks.length > 0 ? { source: "roles", checks } : undefined;
}

function fromConvention(tokens: ResolvedTokens, mode: ContrastMode): ContrastReport | undefined {
  const colors = tokens.color ?? [];
  const foregrounds = colors.filter((token) => startsWithAny(token.name, FOREGROUND_PREFIXES));
  const backgrounds = colors.filter((token) => startsWithAny(token.name, BACKGROUND_PREFIXES));

  if (foregrounds.length === 0 || backgrounds.length === 0) {
    return undefined;
  }

  const checks = foregrounds.flatMap((fg) => backgrounds.map((bg) => check(fg, bg, mode)));
  return { source: "convention", checks };
}

/**
 * Every colour against black and white. Says nothing about how the system is
 * used, but it is always true and needs no configuration — better than an empty
 * section that leaves a reader wondering what went wrong.
 */
function fromFallback(tokens: ResolvedTokens, mode: ContrastMode): ContrastReport {
  const black: ResolvedToken = {
    name: "černá",
    qualifiedName: "#000000",
    value: "#000000",
    chain: ["#000000"],
  };
  const white: ResolvedToken = {
    name: "bílá",
    qualifiedName: "#ffffff",
    value: "#ffffff",
    chain: ["#ffffff"],
  };

  const checks = (tokens.color ?? []).flatMap((token) => [
    check(black, token, mode),
    check(white, token, mode),
  ]);

  return { source: "fallback", checks };
}

/**
 * Works out which pairs to check, degrading through three levels: an explicit
 * role map, then a guess from naming convention, then every colour against black
 * and white.
 *
 * Explicit `contrastPairs` are added to whatever the level produced rather than
 * replacing it — they exist to cover what roles miss, not to take over the job.
 */
export function reportContrast(
  tokens: ResolvedTokens,
  mode: ContrastMode = "light",
): ContrastReport | undefined {
  if ((tokens.color ?? []).length === 0 && (tokens.contrastPairs ?? []).length === 0) {
    return undefined;
  }

  const report =
    fromRoles(tokens, mode) ?? fromConvention(tokens, mode) ?? fromFallback(tokens, mode);
  const declared = (tokens.contrastPairs ?? []).map((pair) => check(pair.fg, pair.bg, mode));

  if (declared.length === 0) {
    return report;
  }

  // Keyed on token identity, not on the colour it currently holds. Two tokens
  // sharing a hex today mean different things, and a declared pair must not
  // disappear because of an incidental match.
  const key = (entry: ContrastCheck) => `${entry.fg.qualifiedName}|${entry.bg.qualifiedName}`;
  const seen = new Set(report.checks.map(key));
  const extra = declared.filter((entry) => {
    if (seen.has(key(entry))) {
      return false;
    }
    seen.add(key(entry));
    return true;
  });

  return { source: report.source, checks: [...report.checks, ...extra] };
}
