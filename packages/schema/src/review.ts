/**
 * The `review.json` contract — what holds the editor and the agent together.
 *
 * Deliberately defined here, before any overlay exists to shape it: the apply
 * skill reads this document long after the page and the server are gone, so
 * the contract cannot lean on anything only the editor session knows.
 */

export const REVIEW_SCHEMA_VERSION = 1;

/**
 * Same three-way redundancy as the snapshot's location map (see
 * `@ui-skills/snapshot`): each identifier fails differently, and mapping back
 * to source survives because they rarely fail together. Only `cxId` is
 * required — it is the one identifier the editor always has.
 */
export interface ReviewTarget {
  readonly cxId: string;
  readonly selector?: string;
  readonly hostPath?: readonly string[];
  readonly xpath?: string;
  readonly textFingerprint?: string;
  readonly sourceHint?: string;
}

/** Phase 0 knows direct edits of text only; styles and removals come later. */
export interface TextChange {
  readonly id: string;
  readonly target: ReviewTarget;
  readonly type: "text";
  readonly before: string;
  readonly after: string;
}

export const COMMENT_CATEGORIES = ["change-request", "question", "idea"] as const;
export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

export const COMMENT_PRIORITIES = ["low", "medium", "high"] as const;
export type CommentPriority = (typeof COMMENT_PRIORITIES)[number];

export interface ReviewComment {
  readonly id: string;
  readonly target: ReviewTarget;
  readonly text: string;
  readonly category?: CommentCategory;
  readonly priority?: CommentPriority;
}

export interface ReviewMeta {
  readonly source?: string;
  readonly capturedAt?: string;
  readonly compiledAt?: string;
}

export interface Review {
  readonly schemaVersion: number;
  readonly meta?: ReviewMeta;
  readonly changes: readonly TextChange[];
  readonly comments: readonly ReviewComment[];
}

/** Same shape as TokensError: the path points into the document, not the file. */
export class ReviewError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = "ReviewError";
    this.path = path;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function requireString(value: unknown, what: string, path: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ReviewError(`"${what}" musí být neprázdný řetězec`, path);
  }
  return value;
}

function optionalString(value: unknown, what: string, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ReviewError(`"${what}" musí být řetězec`, path);
  }
  return value;
}

function validateTarget(raw: unknown, path: string): ReviewTarget {
  if (!isRecord(raw)) {
    throw new ReviewError('"target" musí být objekt', path);
  }

  const cxId = requireString(raw.cxId, "target.cxId", path);
  const target: {
    cxId: string;
    selector?: string;
    hostPath?: readonly string[];
    xpath?: string;
    textFingerprint?: string;
    sourceHint?: string;
  } = { cxId };

  for (const key of ["selector", "xpath", "textFingerprint", "sourceHint"] as const) {
    const value = optionalString(raw[key], `target.${key}`, path);
    if (value !== undefined) {
      target[key] = value;
    }
  }

  if (raw.hostPath !== undefined) {
    if (!Array.isArray(raw.hostPath) || raw.hostPath.some((step) => typeof step !== "string")) {
      throw new ReviewError('"target.hostPath" musí být pole řetězců', path);
    }
    target.hostPath = raw.hostPath as string[];
  }

  return target;
}

function validateChange(raw: unknown, path: string): TextChange {
  if (!isRecord(raw)) {
    throw new ReviewError("změna musí být objekt", path);
  }
  if (raw.type !== "text") {
    throw new ReviewError(
      `neznámý typ změny ${JSON.stringify(raw.type)} (tato verze umí: "text")`,
      path,
    );
  }

  return {
    id: requireString(raw.id, "id", path),
    target: validateTarget(raw.target, path),
    type: "text",
    // Empty is legal on both sides: text may be added to an empty element or
    // deleted entirely. What cannot happen is the field missing altogether.
    before: typeof raw.before === "string" ? raw.before : missing("before", path),
    after: typeof raw.after === "string" ? raw.after : missing("after", path),
  };
}

function missing(what: string, path: string): never {
  throw new ReviewError(`chybí povinné pole "${what}"`, path);
}

function validateComment(raw: unknown, path: string): ReviewComment {
  if (!isRecord(raw)) {
    throw new ReviewError("komentář musí být objekt", path);
  }

  const text = requireString(raw.text, "text", path);
  if (text.trim() === "") {
    throw new ReviewError('"text" musí být neprázdný řetězec', path);
  }

  const result: {
    id: string;
    target: ReviewTarget;
    text: string;
    category?: CommentCategory;
    priority?: CommentPriority;
  } = {
    id: requireString(raw.id, "id", path),
    target: validateTarget(raw.target, path),
    text,
  };

  if (raw.category !== undefined) {
    if (!(COMMENT_CATEGORIES as readonly unknown[]).includes(raw.category)) {
      throw new ReviewError(
        `neznámá kategorie ${JSON.stringify(raw.category)} (povolené: ${COMMENT_CATEGORIES.join(", ")})`,
        path,
      );
    }
    result.category = raw.category as CommentCategory;
  }

  if (raw.priority !== undefined) {
    if (!(COMMENT_PRIORITIES as readonly unknown[]).includes(raw.priority)) {
      throw new ReviewError(
        `neznámá priorita ${JSON.stringify(raw.priority)} (povolené: ${COMMENT_PRIORITIES.join(", ")})`,
        path,
      );
    }
    result.priority = raw.priority as CommentPriority;
  }

  return result;
}

function validateMeta(raw: unknown): ReviewMeta {
  if (!isRecord(raw)) {
    throw new ReviewError('"meta" musí být objekt', "meta");
  }

  const meta: { source?: string; capturedAt?: string; compiledAt?: string } = {};
  for (const key of ["source", "capturedAt", "compiledAt"] as const) {
    const value = optionalString(raw[key], key, "meta");
    if (value !== undefined) {
      meta[key] = value;
    }
  }
  return meta;
}

function validateSchemaVersion(raw: Record<string, unknown>): void {
  const { schemaVersion } = raw;

  if (schemaVersion === undefined) {
    throw new ReviewError(
      `chybí povinné pole "schemaVersion" (očekávaná verze: ${REVIEW_SCHEMA_VERSION})`,
      "",
    );
  }
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new ReviewError('"schemaVersion" musí být celé číslo', "");
  }
  if (schemaVersion !== REVIEW_SCHEMA_VERSION) {
    throw new ReviewError(
      `nepodporovaná schemaVersion ${schemaVersion} (tento nástroj umí ${REVIEW_SCHEMA_VERSION})`,
      "",
    );
  }
}

/**
 * Turns an untrusted `review.json` document into `Review`, or explains why it
 * cannot. Never guesses — an unknown schemaVersion or change type is rejected
 * outright, because the apply step edits source files on the strength of it.
 */
export function validateReview(raw: unknown): Review {
  if (!isRecord(raw)) {
    throw new ReviewError("review.json musí obsahovat objekt", "");
  }

  validateSchemaVersion(raw);

  if (!Array.isArray(raw.changes)) {
    throw new ReviewError('chybí povinné pole "changes" (pole změn, klidně prázdné)', "");
  }
  if (!Array.isArray(raw.comments)) {
    throw new ReviewError('chybí povinné pole "comments" (pole komentářů, klidně prázdné)', "");
  }

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    ...(raw.meta === undefined ? {} : { meta: validateMeta(raw.meta) }),
    changes: raw.changes.map((change, index) => validateChange(change, `changes[${index}]`)),
    comments: raw.comments.map((comment, index) => validateComment(comment, `comments[${index}]`)),
  };
}
