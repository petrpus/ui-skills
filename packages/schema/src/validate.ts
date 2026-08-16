import {
  SCHEMA_VERSION,
  TOKEN_GROUPS,
  type Token,
  type TokenGroup,
  type TokenGroupName,
  type Tokens,
  TokensError,
} from "./types.ts";

const TOKEN_KEYS = new Set(["value", "description"]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validateToken(raw: unknown, path: string): Token {
  if (!isRecord(raw)) {
    throw new TokensError("token musí být objekt", path);
  }

  for (const key of Object.keys(raw)) {
    if (!TOKEN_KEYS.has(key)) {
      throw new TokensError(
        `neznámý klíč "${key}" (povolené: ${[...TOKEN_KEYS].join(", ")})`,
        path,
      );
    }
  }

  const { value, description } = raw;
  if (typeof value !== "string" || value.trim() === "") {
    throw new TokensError('chybí neprázdná hodnota "value"', path);
  }
  if (description !== undefined && typeof description !== "string") {
    throw new TokensError('"description" musí být řetězec', path);
  }

  return description === undefined ? { value } : { value, description };
}

function validateGroup(raw: unknown, path: string): TokenGroup {
  if (!isRecord(raw)) {
    throw new TokensError("skupina tokenů musí být objekt", path);
  }

  // A null prototype, because token names come from an untrusted document: a
  // token called `__proto__` would otherwise hit the inherited setter and
  // vanish from every later Object.entries instead of being rendered.
  const group: Record<string, Token> = Object.create(null);
  for (const [name, token] of Object.entries(raw)) {
    group[name] = validateToken(token, `${path}.${name}`);
  }
  return group;
}

function validateSchemaVersion(raw: Record<string, unknown>): void {
  const { schemaVersion } = raw;

  if (schemaVersion === undefined) {
    throw new TokensError(
      `chybí povinné pole "schemaVersion" (očekávaná verze: ${SCHEMA_VERSION})`,
      "",
    );
  }
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new TokensError('"schemaVersion" musí být celé číslo', "");
  }
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new TokensError(
      `nepodporovaná schemaVersion ${schemaVersion} (tento nástroj umí ${SCHEMA_VERSION})`,
      "",
    );
  }
}

/**
 * Turns an untrusted `tokens.json` document into `Tokens`, or explains why it
 * cannot. Never guesses: an unknown schemaVersion is rejected outright rather
 * than parsed on the assumption that it is close enough.
 */
export function validateTokens(raw: unknown): Tokens {
  if (!isRecord(raw)) {
    throw new TokensError("tokens.json musí obsahovat objekt", "");
  }

  validateSchemaVersion(raw);

  const tokens: { schemaVersion: number; name?: string } & Partial<
    Record<TokenGroupName, TokenGroup>
  > = { schemaVersion: SCHEMA_VERSION };

  if (raw.name !== undefined) {
    if (typeof raw.name !== "string") {
      throw new TokensError('"name" musí být řetězec', "");
    }
    tokens.name = raw.name;
  }

  for (const groupName of TOKEN_GROUPS) {
    const group = raw[groupName];
    if (group !== undefined) {
      tokens[groupName] = validateGroup(group, groupName);
    }
  }

  return tokens;
}
