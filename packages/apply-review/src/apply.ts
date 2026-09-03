import type { Review, ReviewChange, ReviewComment, TextChange } from "@ui-skills/schema";
import { type Candidate, mapTarget, type SourceFile } from "./map.ts";

export type ApplyStatus = "applied" | "needs-input" | "skipped";

export interface AppliedChange {
  readonly id: string;
  readonly status: ApplyStatus;
  /** `soubor:řádek`, when the item mapped anywhere at all. */
  readonly location?: string;
  readonly note: string;
}

export interface CommentRow {
  readonly id: string;
  readonly action: "odpovědět" | "rozpadnout na plán";
  readonly category?: string;
  readonly priority?: string;
  readonly location?: string;
  readonly text: string;
}

export interface ApplyRatio {
  readonly applied: number;
  readonly needsInput: number;
  readonly skipped: number;
}

export interface ApplyResult {
  readonly changes: readonly AppliedChange[];
  readonly comments: readonly CommentRow[];
  /** path → new content, only for files an applied change actually touched. */
  readonly updates: ReadonlyMap<string, string>;
  readonly ratio: ApplyRatio;
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

function locate(candidate: Candidate): string {
  return `${candidate.path}:${candidate.line}`;
}

function translationNote(candidate: Candidate): string {
  return candidate.translation
    ? "pozor: překladový soubor — změna platí pro tuhle lokalizaci, ostatní jazyky zůstávají"
    : "";
}

/** Where the finished text already sits, when it sits anywhere. */
function findAfter(after: string, files: readonly SourceFile[]): string | null {
  if (after === "") {
    return null;
  }
  for (const file of files) {
    const offset = file.content.indexOf(after);
    if (offset !== -1) {
      return `${file.path}:${lineOf(file.content, offset)}`;
    }
  }
  return null;
}

/**
 * Applies one review to an in-memory source tree. Pure: files in, updated
 * contents and a verdict per item out — the disk is the caller's business.
 *
 * Direct edits go in 1:1, because the human already decided what the result
 * should look like. Anything short of one unambiguous place to put the edit
 * becomes needs-input with the reason spelled out; changing a plausible
 * similar line would corrupt exactly the files the reviewer trusted us with.
 */
export function applyReview(review: Review, files: readonly SourceFile[]): ApplyResult {
  // Later changes must see earlier ones: two edits in one file are the norm.
  const working = new Map(files.map((file) => [file.path, file.content]));
  const updated = new Set<string>();

  const currentFiles = (): SourceFile[] =>
    [...working.entries()].map(([path, content]) => ({ path, content }));

  const changes: AppliedChange[] = [];

  function apply(change: TextChange, candidate: Candidate): AppliedChange {
    const content = working.get(candidate.path) ?? "";
    const next =
      content.slice(0, candidate.offset) +
      change.after +
      content.slice(candidate.offset + change.before.length);
    working.set(candidate.path, next);
    updated.add(candidate.path);
    return {
      id: change.id,
      status: "applied",
      location: locate(candidate),
      note: translationNote(candidate),
    };
  }

  function applyViaHint(change: TextChange, hinted: Candidate): AppliedChange {
    const content = working.get(hinted.path) ?? "";
    const offsets: number[] = [];
    let offset = content.indexOf(change.before);
    while (offset !== -1) {
      offsets.push(offset);
      offset = content.indexOf(change.before, offset + 1);
    }

    if (offsets.length === 0) {
      const alreadyAt = findAfter(change.after, currentFiles());
      if (alreadyAt !== null) {
        return {
          id: change.id,
          status: "skipped",
          location: alreadyAt,
          note: "cílový text už ve zdrojích je — nejspíš aplikováno dřív",
        };
      }
      return {
        id: change.id,
        status: "needs-input",
        location: locate(hinted),
        note: `sourceHint ukazuje na ${locate(hinted)}, ale původní text tam není`,
      };
    }

    // More matches in the hinted file: the hint's line decides, deterministically.
    const nearest = offsets.reduce((best, current) =>
      Math.abs(lineOf(content, current) - hinted.line) <
      Math.abs(lineOf(content, best) - hinted.line)
        ? current
        : best,
    );
    return apply(change, { ...hinted, offset: nearest, line: lineOf(content, nearest) });
  }

  /**
   * Anything but a direct text edit is never applied automatically. Hide is
   * a hypothesis and remove an instruction whose blast radius belongs to
   * the agent's plan; an unknown type is a newer editor talking to an older
   * apply — one skipped change, never a crash.
   */
  function nonTextRow(change: Exclude<ReviewChange, TextChange>): AppliedChange {
    if (!("subtree" in change)) {
      return {
        id: change.id,
        status: "skipped",
        note: `neznámý typ změny "${change.type}" — přeskočeno (novější editor než apply)`,
      };
    }
    const mapping = mapTarget(change.target, change.target.textFingerprint ?? "", currentFiles());
    const [first] = mapping.candidates;
    const location =
      mapping.candidates.length === 1 && first !== undefined ? locate(first) : undefined;
    const scope = `<${change.subtree.tag}>, ${change.subtree.elements} prvků`;
    const note =
      change.type === "hide"
        ? `hypotéza „skrýt" (${scope}) — otázka do plánu, automaticky se needituje`
        : `pokyn „smazat" (${scope}) — rozsah ve zdrojích provede agent${
            location === undefined && mapping.reason !== undefined ? `; ${mapping.reason}` : ""
          }`;
    return {
      id: change.id,
      status: "needs-input",
      ...(location === undefined ? {} : { location }),
      note,
    };
  }

  for (const change of review.changes) {
    // Structural, not by type string: UnknownChange's `type` is an open
    // string, so only the presence of `before` proves a direct text edit.
    if (!("before" in change)) {
      changes.push(nonTextRow(change));
      continue;
    }

    if (change.before === "") {
      // Insertion has no anchor to replace: splicing `after` at the
      // fingerprint's offset would put it at an arbitrary spot inside the
      // element's own text. Phase 0 hands that to a human instead of
      // guessing a position.
      changes.push({
        id: change.id,
        status: "needs-input",
        note: "prázdný původní text — vložení nového obsahu nemá kotvu, umístění musí určit člověk",
      });
      continue;
    }

    const mapping = mapTarget(change.target, change.before, currentFiles());
    const [first] = mapping.candidates;

    if (first !== undefined && mapping.candidates.length === 1) {
      if (first.via === "sourceHint") {
        changes.push(applyViaHint(change, first));
        continue;
      }
      if (first.via === "selector") {
        // A selector token narrows the file, not the exact text — that is a
        // lead for a human or the agent, never grounds for an automatic edit.
        changes.push({
          id: change.id,
          status: "needs-input",
          location: locate(first),
          note: "nalezeno jen přes selektor — místo je třeba ověřit ručně",
        });
        continue;
      }
      changes.push(apply(change, first));
      continue;
    }

    if (mapping.candidates.length > 1) {
      changes.push({ id: change.id, status: "needs-input", note: mapping.reason ?? "" });
      continue;
    }

    const alreadyAt = findAfter(change.after, currentFiles());
    if (alreadyAt !== null) {
      changes.push({
        id: change.id,
        status: "skipped",
        location: alreadyAt,
        note: "cílový text už ve zdrojích je — nejspíš aplikováno dřív",
      });
      continue;
    }

    changes.push({ id: change.id, status: "needs-input", note: mapping.reason ?? "" });
  }

  function commentRow(comment: ReviewComment): CommentRow {
    const mapping = mapTarget(comment.target, comment.target.textFingerprint ?? "", currentFiles());
    const location =
      mapping.candidates.length === 1 && mapping.candidates[0] !== undefined
        ? locate(mapping.candidates[0])
        : undefined;
    return {
      id: comment.id,
      // A question gets an answer, not an edit; everything else is raw
      // material for a plan the agent draws up before touching anything.
      action: comment.category === "question" ? "odpovědět" : "rozpadnout na plán",
      ...(comment.category === undefined ? {} : { category: comment.category }),
      ...(comment.priority === undefined ? {} : { priority: comment.priority }),
      ...(location === undefined ? {} : { location }),
      text: comment.text,
    };
  }

  const updates = new Map<string, string>();
  for (const path of updated) {
    updates.set(path, working.get(path) ?? "");
  }

  return {
    changes,
    comments: review.comments.map(commentRow),
    updates,
    ratio: {
      applied: changes.filter((change) => change.status === "applied").length,
      needsInput: changes.filter((change) => change.status === "needs-input").length,
      skipped: changes.filter((change) => change.status === "skipped").length,
    },
  };
}
