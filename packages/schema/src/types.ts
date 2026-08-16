export const SCHEMA_VERSION = 1;

/** Token groups the validator knows. Groups outside this list are dropped, not rejected. */
export const TOKEN_GROUPS = ["color", "spacing", "radius", "shadow"] as const;

export type TokenGroupName = (typeof TOKEN_GROUPS)[number];

interface TokenMeta {
  /** CSS custom property this token maps to, e.g. `--color-primary`. */
  readonly css?: string;
  readonly description?: string;
}

/** A primitive: the value is written out. */
export interface LiteralToken extends TokenMeta {
  readonly value: string;
  readonly ref?: undefined;
}

/**
 * A semantic token: points at another token by qualified name (`color.blue-600`).
 * What it means stays in one place, so changing the palette moves every token
 * that leans on it instead of leaving copies behind.
 */
export interface RefToken extends TokenMeta {
  readonly ref: string;
  readonly value?: undefined;
}

export type Token = LiteralToken | RefToken;

export type TokenGroup = Readonly<Record<string, Token>>;

export interface Tokens {
  readonly schemaVersion: number;
  readonly name?: string;
  readonly color?: TokenGroup;
  readonly spacing?: TokenGroup;
  readonly radius?: TokenGroup;
  readonly shadow?: TokenGroup;
}

/** A token with its reference chain followed to the literal value at the end. */
export interface ResolvedToken {
  readonly name: string;
  readonly qualifiedName: string;
  readonly value: string;
  /**
   * Every hop from this token to the literal, starting with the token itself.
   * A primitive has a chain of one; the demo shows the rest so a reader can see
   * where a semantic value comes from.
   */
  readonly chain: readonly string[];
  readonly css?: string;
  readonly description?: string;
}

/**
 * A list rather than a map, so consumers iterate one agreed order instead of
 * each calling Object.entries and hoping.
 *
 * Known limitation: this does not recover the author's order for names that
 * look like integers. `{"100": …, "50": …}` is already reordered to 50, 100 by
 * the time JSON.parse hands it over, and no later conversion can undo that.
 * For a palette that ordering is usually the wanted one, so it is documented
 * rather than fought; fixing it properly would mean parsing JSON ourselves.
 */
export type ResolvedGroup = readonly ResolvedToken[];

export interface ResolvedTokens {
  readonly schemaVersion: number;
  readonly name?: string;
  readonly color?: ResolvedGroup;
  readonly spacing?: ResolvedGroup;
  readonly radius?: ResolvedGroup;
  readonly shadow?: ResolvedGroup;
}

/**
 * Raised for every rejected `tokens.json`. Carries the path to the offending
 * place in the document so the message can point at it rather than at the file.
 */
export class TokensError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = "TokensError";
    this.path = path;
  }
}
