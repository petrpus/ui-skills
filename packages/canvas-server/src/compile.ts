import {
  COMMENT_CATEGORIES,
  COMMENT_PRIORITIES,
  type CommentCategory,
  type CommentPriority,
  REVIEW_SCHEMA_VERSION,
  type Review,
  type ReviewChange,
  type ReviewComment,
  type ReviewMeta,
  type ReviewTarget,
} from "@ui-skills/schema";
import type { LocationMap } from "@ui-skills/snapshot";
import type { CanvasEvent, SubtreeInfo } from "./events.ts";

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

interface PendingElement {
  edit?: { before: string; after: string };
  block?: { type: "hide" | "remove"; subtree: SubtreeInfo };
  /** An array on purpose: two clicks mean two more copies, never coalesced. */
  duplicates?: Readonly<Record<string, string>>[];
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
  // First pass: which actions the reviewer took back. Undo writes revoke,
  // redo writes restore — replayed in log order, the last word wins. An
  // event without an actionId (a phase-0 log) can never be revoked.
  const revoked = new Set<string>();
  for (const event of events) {
    if (event.type === "revoke") {
      revoked.add(event.actionId);
    } else if (event.type === "restore") {
      revoked.delete(event.actionId);
    }
  }
  const isRevoked = (event: { actionId?: string }): boolean =>
    event.actionId !== undefined && revoked.has(event.actionId);

  // Insertion order is the order of each element's first touch, which keeps
  // change ids stable however many times the reviewer went back and forth.
  const perElement = new Map<string, PendingElement>();
  const comments: ReviewComment[] = [];

  const pendingFor = (cxId: string): PendingElement => {
    const existing = perElement.get(cxId);
    if (existing !== undefined) {
      return existing;
    }
    const created: PendingElement = {};
    perElement.set(cxId, created);
    return created;
  };

  for (const event of events) {
    if (event.type === "revoke" || event.type === "restore") {
      continue;
    }
    if (isRevoked(event)) {
      continue;
    }
    if (event.type === "text-edit") {
      const pending = pendingFor(event.cxId);
      // An edit after a remove has nothing to land on — the reviewer is
      // editing a corpse; the removal is the change that counts.
      if (pending.block?.type === "remove") {
        continue;
      }
      if (pending.edit === undefined) {
        pending.edit = { before: event.before, after: event.after };
      } else {
        pending.edit.after = event.after;
      }
      continue;
    }

    if (event.type === "duplicate") {
      // The log is untrusted: a mapping value colliding with a REAL cx-id
      // would hijack that element's later edits into the duplicate path.
      // Colliding entries are stripped; a mapping with nothing left is not
      // a duplication anyone can follow.
      const entries = Object.entries(event.mapping).filter(([, synthetic]) => !(synthetic in map));
      if (entries.length === 0) {
        continue;
      }
      const pending = pendingFor(event.cxId);
      pending.duplicates = [...(pending.duplicates ?? []), Object.fromEntries(entries)];
      continue;
    }

    if (event.type === "hide" || event.type === "remove") {
      const pending = pendingFor(event.cxId);
      // Remove supersedes hide — the question was answered by the verdict —
      // and drops the element's own edits: nothing left to apply them to.
      if (event.type === "remove") {
        pending.block = { type: "remove", subtree: event.subtree };
        pending.edit = undefined;
      } else if (pending.block?.type !== "remove") {
        pending.block = { type: "hide", subtree: event.subtree };
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

  // Pruning by ancestry (the PRD test: a child edited, then its parent
  // removed — the edit has nowhere to apply). Descendance is read from the
  // map's positional selectors: a child's path extends its ancestor's.
  // Synthetic ids are not in the map and stay untouched.
  const removedSelectors: string[] = [];
  for (const [cxId, pending] of perElement) {
    if (pending.block?.type === "remove") {
      const location = map[cxId];
      if (location !== undefined && location.hostPath.length === 0) {
        removedSelectors.push(location.selector);
      }
    }
  }
  const underRemovedAncestor = (cxId: string): boolean => {
    const location = map[cxId];
    if (location === undefined || location.hostPath.length > 0) {
      return false;
    }
    return removedSelectors.some((ancestor) => location.selector.startsWith(`${ancestor} > `));
  };
  for (const [cxId, pending] of perElement) {
    if (underRemovedAncestor(cxId)) {
      pending.edit = undefined;
      if (pending.block?.type === "hide") {
        pending.block = undefined;
      }
    }
  }

  // Emission is stable-by-slot per element (edit, block, duplicates), not
  // chronological across types — ids stay stable, review.md may narrate a
  // same-element remove before its earlier duplicate.
  const changes: ReviewChange[] = [];
  for (const [cxId, pending] of perElement) {
    if (pending.edit !== undefined && pending.edit.before !== pending.edit.after) {
      changes.push({
        id: changeId(changes.length + 1),
        target: targetFor(cxId, map),
        type: "text",
        before: pending.edit.before,
        after: pending.edit.after,
      });
    }
    if (pending.block !== undefined) {
      const base = {
        id: changeId(changes.length + 1),
        target: targetFor(cxId, map),
        subtree: pending.block.subtree,
      };
      changes.push(
        pending.block.type === "hide" ? { ...base, type: "hide" } : { ...base, type: "remove" },
      );
    }
    for (const mapping of pending.duplicates ?? []) {
      changes.push({
        id: changeId(changes.length + 1),
        target: targetFor(cxId, map),
        type: "duplicate",
        mapping,
      });
    }
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
      if (change.type === "text" && "before" in change) {
        lines.push(
          `- **${change.id}** \`${where}\`: ${quote(change.before)} → ${quote(change.after)}`,
        );
      } else if ("mapping" in change) {
        lines.push(
          `- **${change.id}** duplikovat \`${where}\` (${Object.keys(change.mapping).length} prvků → nové id)`,
        );
      } else if ("subtree" in change) {
        const verb = change.type === "hide" ? "skrýt (hypotéza)" : "smazat (pokyn)";
        lines.push(
          `- **${change.id}** ${verb} \`${where}\`: <${change.subtree.tag}>, ${change.subtree.elements} prvků — ${quote(change.subtree.textFingerprint)}`,
        );
      } else {
        lines.push(`- **${change.id}** neznámý typ \`${change.type}\` \`${where}\``);
      }
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
