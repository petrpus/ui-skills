export const SCHEMA_VERSION = 1;

/** Token groups the validator knows. Groups outside this list are dropped, not rejected. */
export const TOKEN_GROUPS = ["color", "spacing", "radius", "shadow"] as const;

export type TokenGroupName = (typeof TOKEN_GROUPS)[number];

export interface Token {
  readonly value: string;
  readonly description?: string;
}

export type TokenGroup = Readonly<Record<string, Token>>;

export interface Tokens {
  readonly schemaVersion: number;
  readonly name?: string;
  readonly color?: TokenGroup;
  readonly spacing?: TokenGroup;
  readonly radius?: TokenGroup;
  readonly shadow?: TokenGroup;
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
