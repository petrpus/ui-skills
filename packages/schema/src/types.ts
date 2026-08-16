export const SCHEMA_VERSION = 1;

/** Token groups the validator knows. Groups outside this list are dropped, not rejected. */
export const TOKEN_GROUPS = ["color", "spacing", "radius", "shadow"] as const;

export type TokenGroupName = (typeof TOKEN_GROUPS)[number];

/**
 * The vocabulary the demo understands. A project maps its own naming onto these
 * so the composite page and the contrast pairs work whatever the tokens are
 * called — `ink` on `paper` reads the same as `text` on `surface` once mapped.
 */
export const ROLES = [
  "surface",
  "surface-2",
  "text",
  "text-muted",
  "primary",
  "on-primary",
  "border",
  "danger",
  "on-danger",
] as const;

export type RoleName = (typeof ROLES)[number];

/** Foreground/background pair to check, named by qualified token name. */
export interface ContrastPair {
  readonly fg: string;
  readonly bg: string;
}

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

/**
 * A step on the typographic scale. Composite rather than a single value,
 * because a step is a size *and* how it is set — a size without its line height
 * says nothing about whether the text is readable.
 *
 * Deliberately outside the `ref` machinery: type steps are authored, not
 * aliased, and giving them references would mean a resolver that answers with
 * several values instead of one.
 */
export interface TypographyToken {
  readonly size: string;
  readonly lineHeight?: string;
  readonly weight?: string;
  readonly letterSpacing?: string;
  readonly family?: string;
  readonly css?: string;
  readonly description?: string;
}

export type TypographyGroup = Readonly<Record<string, TypographyToken>>;

/** A type step with its name, ready to render. */
export interface ResolvedTypographyToken extends TypographyToken {
  readonly name: string;
}

export type TokenGroup = Readonly<Record<string, Token>>;

export interface Tokens {
  readonly schemaVersion: number;
  readonly name?: string;
  readonly color?: TokenGroup;
  readonly spacing?: TokenGroup;
  readonly radius?: TokenGroup;
  readonly shadow?: TokenGroup;
  readonly typography?: TypographyGroup;
  readonly roles?: Readonly<Partial<Record<RoleName, string>>>;
  readonly contrastPairs?: readonly ContrastPair[];
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

export type ResolvedRoles = Readonly<Partial<Record<RoleName, ResolvedToken>>>;

export interface ResolvedTokens {
  readonly schemaVersion: number;
  readonly name?: string;
  readonly color?: ResolvedGroup;
  readonly spacing?: ResolvedGroup;
  readonly radius?: ResolvedGroup;
  readonly shadow?: ResolvedGroup;
  readonly typography?: readonly ResolvedTypographyToken[];
  readonly roles?: ResolvedRoles;
  readonly contrastPairs?: readonly ResolvedContrastPair[];
}

export interface ResolvedContrastPair {
  readonly fg: ResolvedToken;
  readonly bg: ResolvedToken;
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
