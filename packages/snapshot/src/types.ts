/**
 * Where an element can be found again, said three different ways.
 *
 * Three identifiers for one element is not belt and braces. Serialisation drops
 * scripts, which shifts every `nth-child` after them — a positional selector
 * carried over from the original page matched none of twenty sampled elements
 * on a real application (see docs/adr/0001-snapshot-engine.md). Each of these is
 * therefore computed against the snapshot, and each fails differently: a
 * selector breaks on minified class names, an xpath on a changed tree, a text
 * fingerprint on edited copy. Mapping a review back to source survives because
 * they rarely fail together.
 */
export interface ElementLocation {
  readonly selector: string;
  readonly xpath: string;
  readonly textFingerprint: string;
  /** `soubor:řádek` left by a build-time plugin, when the project has one (phase 2). */
  readonly sourceHint?: string;
}

/** cx-id → where that element is. */
export type LocationMap = Readonly<Record<string, ElementLocation>>;

export interface Instrumented {
  readonly html: string;
  readonly map: LocationMap;
  readonly count: number;
}

/** The attribute an instrumented element carries. */
export const CX_ID_ATTRIBUTE = "data-cx-id";
