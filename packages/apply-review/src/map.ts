import type { ReviewTarget } from "@ui-skills/schema";

export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

export interface Candidate {
  readonly path: string;
  /** 1-based line of the match. */
  readonly line: number;
  /** Byte offset of the match in the file, for a precise later replacement. */
  readonly offset: number;
  readonly via: "sourceHint" | "text" | "selector";
  readonly translation: boolean;
}

export interface Mapping {
  readonly candidates: readonly Candidate[];
  /** Czech explanation whenever the result is anything but one clean candidate. */
  readonly reason?: string;
}

/**
 * Paths where a matched text is a translation entry, not the component that
 * renders it. The distinction matters because editing the wrong one looks
 * identical in a diff and only breaks the other locales.
 */
const TRANSLATION_DIR = /(^|\/)(locales?|i18n|lang|translations?)(\/|$)/i;
// Deliberately narrow outside a translation directory: a bare two-letter
// name would also catch ci.yml or db.json, and "messages" without an i18n
// extension catches ordinary source like messagesSlice.ts. A false positive
// here turns a clean applied into a spurious needs-input and corrupts the
// one metric this tool exists to keep honest.
const TRANSLATION_FILE =
  /(^|\/)([a-z]{2}-[A-Z]{2}\.(json|ya?ml)|messages[^/]*\.(json|ya?ml|po)|[^/]+\.po)$/;

export function isTranslationPath(path: string): boolean {
  return TRANSLATION_DIR.test(path) || TRANSLATION_FILE.test(path);
}

function lineOf(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function occurrences(
  needle: string,
  files: readonly SourceFile[],
  via: Candidate["via"],
): Candidate[] {
  const found: Candidate[] = [];
  for (const file of files) {
    let offset = file.content.indexOf(needle);
    while (offset !== -1) {
      found.push({
        path: file.path,
        line: lineOf(file.content, offset),
        offset,
        via,
        translation: isTranslationPath(file.path),
      });
      offset = file.content.indexOf(needle, offset + 1);
    }
  }
  return found;
}

function ambiguityReason(candidates: readonly Candidate[]): string {
  const paths = [...new Set(candidates.map((candidate) => candidate.path))];
  const base = `text nalezen ve ${paths.length > 1 ? `${paths.length} souborech` : "více výskytech jednoho souboru"} (${paths.join(", ")})`;
  const hasTranslation = candidates.some((candidate) => candidate.translation);
  const hasComponent = candidates.some((candidate) => !candidate.translation);
  if (hasTranslation && hasComponent) {
    return `${base} — jeden z nich je překladový soubor; text může patřit do překladu a styl do komponenty, rozhodnutí je na člověku`;
  }
  return `${base} — nelze rozhodnout, který výskyt je ten pravý`;
}

/** `soubor:řádek` left by a build-time plugin; the most reliable trace there is. */
function fromSourceHint(hint: string, files: readonly SourceFile[]): Candidate | null {
  const separator = hint.lastIndexOf(":");
  const path = separator === -1 ? hint : hint.slice(0, separator);
  const line = separator === -1 ? 1 : Number(hint.slice(separator + 1)) || 1;
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) {
    return null;
  }
  return { path, line, offset: 0, via: "sourceHint", translation: isTranslationPath(path) };
}

/**
 * Greppable tokens a positional selector may still carry: ids and class
 * names. The instrumented snapshot emits pure nth-child paths, which yield
 * nothing — but a sourceHint-era selector or a future richer one does.
 */
function selectorTokens(selector: string): string[] {
  return [...selector.matchAll(/[#.]([\w-]+)/g)].map((match) => match[1] ?? "");
}

/**
 * Finds where a review target lives in the source tree, trying the traces
 * from the most reliable to the least: sourceHint, then the text itself,
 * then whatever the selector still carries. Never guesses — zero or many
 * candidates come back as exactly that, with the reason spelled out.
 */
export function mapTarget(
  target: ReviewTarget,
  needle: string,
  files: readonly SourceFile[],
): Mapping {
  if (target.sourceHint !== undefined) {
    const hinted = fromSourceHint(target.sourceHint, files);
    if (hinted !== null) {
      return { candidates: [hinted] };
    }
  }

  const text = needle !== "" ? needle : (target.textFingerprint ?? "");
  if (text !== "") {
    const found = occurrences(text, files, "text");
    if (found.length === 1) {
      return { candidates: found };
    }
    if (found.length > 1) {
      return { candidates: found, reason: ambiguityReason(found) };
    }
  }

  for (const token of selectorTokens(target.selector ?? "")) {
    const found = occurrences(token, files, "selector");
    const paths = new Set(found.map((candidate) => candidate.path));
    if (paths.size === 1 && found[0] !== undefined) {
      // A file-level lead, not a position: the caller treats selector hits
      // as needs-input, so the location is advisory either way.
      return {
        candidates: [found[0]],
        ...(found.length > 1
          ? {
              reason: `token selektoru nalezen ${found.length}× v jednom souboru — uveden první výskyt`,
            }
          : {}),
      };
    }
  }

  return {
    candidates: [],
    reason:
      text === ""
        ? "cíl nenese žádný text ani použitelný selektor, není podle čeho hledat"
        : `text ${JSON.stringify(text.slice(0, 60))} nebyl ve zdrojích nalezen`,
  };
}
