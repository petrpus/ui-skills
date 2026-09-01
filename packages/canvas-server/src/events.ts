/**
 * The event log — append-only JSONL on disk, the single source of truth.
 *
 * Every action is written the moment it happens, so a browser crash loses
 * nothing; `review.json` is compiled from this log at the end, never from
 * server memory. That also means the log must be read defensively: the last
 * line may be cut mid-write, and an editor a version ahead may log event
 * types this reader has never heard of. Neither may cost the rest of the log.
 */

export interface TextEditEvent {
  readonly type: "text-edit";
  readonly cxId: string;
  readonly before: string;
  readonly after: string;
  readonly at?: string;
}

export interface CommentEvent {
  readonly type: "comment";
  readonly cxId: string;
  readonly text: string;
  readonly category?: string;
  readonly priority?: string;
  readonly at?: string;
}

export type CanvasEvent = TextEditEvent | CommentEvent;

export interface ParsedEventLog {
  readonly events: readonly CanvasEvent[];
  readonly warnings: readonly string[];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Structure only, not policy: an unknown comment category still parses,
 * because the log records what the editor sent — judging values is the
 * compiler's job, whose output goes through schema validation.
 */
function toEvent(raw: Record<string, unknown>): CanvasEvent | null {
  const { type, cxId } = raw;
  if (typeof cxId !== "string" || cxId === "") {
    return null;
  }

  if (type === "text-edit") {
    const { before, after } = raw;
    if (typeof before !== "string" || typeof after !== "string") {
      return null;
    }
    const at = optionalString(raw.at);
    return { type, cxId, before, after, ...(at === undefined ? {} : { at }) };
  }

  if (type === "comment") {
    const text = raw.text;
    if (typeof text !== "string" || text.trim() === "") {
      return null;
    }
    const category = optionalString(raw.category);
    const priority = optionalString(raw.priority);
    const at = optionalString(raw.at);
    return {
      type,
      cxId,
      text,
      ...(category === undefined ? {} : { category }),
      ...(priority === undefined ? {} : { priority }),
      ...(at === undefined ? {} : { at }),
    };
  }

  return null;
}

const KNOWN_TYPES = new Set(["text-edit", "comment"]);

/** Reads a JSONL event log leniently: what cannot be read is a warning, not a crash. */
export function parseEventLog(raw: string): ParsedEventLog {
  const events: CanvasEvent[] = [];
  const warnings: string[] = [];

  const endsComplete = raw.endsWith("\n");
  const lines = raw.split("\n");

  lines.forEach((line, index) => {
    if (line.trim() === "") {
      return;
    }
    const lineNumber = index + 1;
    const isLastLine = index === lines.length - 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A complete log ends with a newline — every append writes one. A final
      // line without it that will not parse is a write cut short, most likely
      // by the browser or server dying mid-append.
      warnings.push(
        isLastLine && !endsComplete
          ? `řádek ${lineNumber}: useknutý poslední záznam přeskočen`
          : `řádek ${lineNumber}: neplatný JSON přeskočen`,
      );
      return;
    }

    if (!isRecord(parsed)) {
      warnings.push(`řádek ${lineNumber}: záznam není objekt, přeskočen`);
      return;
    }

    if (typeof parsed.type !== "string" || !KNOWN_TYPES.has(parsed.type)) {
      warnings.push(
        `řádek ${lineNumber}: neznámý typ události ${JSON.stringify(parsed.type)} přeskočen`,
      );
      return;
    }

    const event = toEvent(parsed);
    if (event === null) {
      warnings.push(`řádek ${lineNumber}: událost "${parsed.type}" bez povinných polí přeskočena`);
      return;
    }

    events.push(event);
  });

  return { events, warnings };
}
