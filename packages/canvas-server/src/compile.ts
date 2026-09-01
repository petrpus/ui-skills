import {
  COMMENT_CATEGORIES,
  COMMENT_PRIORITIES,
  type CommentCategory,
  type CommentPriority,
  REVIEW_SCHEMA_VERSION,
  type Review,
  type ReviewComment,
  type ReviewMeta,
  type ReviewTarget,
  type TextChange,
} from "@ui-skills/schema";
import type { LocationMap } from "@ui-skills/snapshot";
import type { CanvasEvent } from "./events.ts";

export interface CompileOptions {
  readonly meta?: Omit<ReviewMeta, "compiledAt">;
  readonly now?: Date;
}

function targetFor(cxId: string, map: LocationMap): ReviewTarget {
  const location = map[cxId];
  if (location === undefined) {
    // The log outlives the map's assumptions: an id the map does not know is
    // recorded as it stands, so the review still points somewhere.
    return { cxId };
  }
  return {
    cxId,
    selector: location.selector,
    ...(location.hostPath.length === 0 ? {} : { hostPath: location.hostPath }),
    ...(location.xpath === undefined ? {} : { xpath: location.xpath }),
    textFingerprint: location.textFingerprint,
    ...(location.sourceHint === undefined ? {} : { sourceHint: location.sourceHint }),
  };
}

function changeId(ordinal: number): string {
  return `chg_${String(ordinal).padStart(3, "0")}`;
}

function commentId(ordinal: number): string {
  return `cmt_${String(ordinal).padStart(3, "0")}`;
}

interface Edit {
  before: string;
  after: string;
}

/**
 * Folds the raw event stream into the review the agent will act on.
 *
 * Pure on purpose: log in, document out, no clock and no disk unless handed
 * one. Repeated edits of the same element collapse into a single change —
 * `before` from the first event, `after` from the last — and an edit that
 * ends where it began is no change at all, so it does not appear.
 */
export function compileReview(
  events: readonly CanvasEvent[],
  map: LocationMap,
  options: CompileOptions = {},
): Review {
  // Insertion order is the order of each element's first edit, which keeps
  // change ids stable however many times the reviewer went back and forth.
  const edits = new Map<string, Edit>();
  const comments: ReviewComment[] = [];

  for (const event of events) {
    if (event.type === "text-edit") {
      const existing = edits.get(event.cxId);
      if (existing === undefined) {
        edits.set(event.cxId, { before: event.before, after: event.after });
      } else {
        existing.after = event.after;
      }
      continue;
    }

    const category = (COMMENT_CATEGORIES as readonly string[]).includes(event.category ?? "")
      ? (event.category as CommentCategory)
      : undefined;
    const priority = (COMMENT_PRIORITIES as readonly string[]).includes(event.priority ?? "")
      ? (event.priority as CommentPriority)
      : undefined;

    comments.push({
      id: commentId(comments.length + 1),
      target: targetFor(event.cxId, map),
      text: event.text,
      ...(category === undefined ? {} : { category }),
      ...(priority === undefined ? {} : { priority }),
    });
  }

  const changes: TextChange[] = [];
  for (const [cxId, edit] of edits) {
    if (edit.before === edit.after) {
      continue;
    }
    changes.push({
      id: changeId(changes.length + 1),
      target: targetFor(cxId, map),
      type: "text",
      before: edit.before,
      after: edit.after,
    });
  }

  const meta: ReviewMeta = {
    ...options.meta,
    compiledAt: (options.now ?? new Date()).toISOString(),
  };

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    meta,
    changes,
    comments,
  };
}

function quote(text: string): string {
  return text === "" ? "*(prázdné)*" : `„${text}"`;
}

/** The human-readable half of the output: same content as review.json, for people. */
export function renderReviewMarkdown(review: Review): string {
  const lines: string[] = ["# Review", ""];

  const counts = `${review.changes.length} změn, ${review.comments.length} komentářů`;
  lines.push(
    review.changes.length === 0 && review.comments.length === 0
      ? "Žádné změny ani komentáře."
      : counts,
    "",
  );

  if (review.changes.length > 0) {
    lines.push("## Změny", "");
    for (const change of review.changes) {
      const where = change.target.selector ?? change.target.cxId;
      lines.push(
        `- **${change.id}** \`${where}\`: ${quote(change.before)} → ${quote(change.after)}`,
      );
    }
    lines.push("");
  }

  if (review.comments.length > 0) {
    lines.push("## Komentáře", "");
    for (const comment of review.comments) {
      const where = comment.target.selector ?? comment.target.cxId;
      const badges = [comment.category, comment.priority].filter(Boolean).join(", ");
      lines.push(
        `- **${comment.id}**${badges ? ` (${badges})` : ""} \`${where}\`: ${comment.text}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
