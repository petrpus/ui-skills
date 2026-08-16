import {
  type ContrastPair,
  ROLES,
  type RoleName,
  SCHEMA_VERSION,
  TOKEN_GROUPS,
  type Token,
  type TokenGroup,
  type TokenGroupName,
  type Tokens,
  TokensError,
  type TypographyGroup,
  type TypographyToken,
} from "./types.ts";

const TOKEN_KEYS = new Set(["value", "ref", "css", "description"]);

const CSS_CUSTOM_PROPERTY = /^--[a-zA-Z0-9_-]+$/;
const QUALIFIED_NAME = /^[^.]+\.[^.]+$/;

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

  const { value, ref, css, description } = raw;

  if (value !== undefined && ref !== undefined) {
    throw new TokensError('token má "value" i "ref" — smí mít právě jedno', path);
  }
  if (description !== undefined && typeof description !== "string") {
    throw new TokensError('"description" musí být řetězec', path);
  }
  if (css !== undefined) {
    if (typeof css !== "string" || !CSS_CUSTOM_PROPERTY.test(css)) {
      throw new TokensError('"css" musí být CSS custom property, např. "--color-primary"', path);
    }
  }

  const meta = {
    ...(css === undefined ? {} : { css }),
    ...(description === undefined ? {} : { description }),
  };

  if (ref !== undefined) {
    if (typeof ref !== "string" || !QUALIFIED_NAME.test(ref)) {
      throw new TokensError('"ref" musí být kvalifikované jméno, např. "color.blue-600"', path);
    }
    return { ref, ...meta };
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new TokensError('chybí neprázdná hodnota "value" nebo odkaz "ref"', path);
  }

  return { value, ...meta };
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
    if (name.includes(".")) {
      // A dot separates group from token in a `ref`, so a dotted name would
      // produce a qualified name nobody could ever point at. Rejected here,
      // where the message can name the actual problem.
      throw new TokensError(
        `jméno tokenu nesmí obsahovat tečku — ta odděluje skupinu od jména v odkazech`,
        `${path}.${name}`,
      );
    }
    group[name] = validateToken(token, `${path}.${name}`);
  }
  return group;
}

const TYPOGRAPHY_KEYS = new Set([
  "size",
  "lineHeight",
  "weight",
  "letterSpacing",
  "family",
  "css",
  "description",
]);

function validateTypographyToken(raw: unknown, path: string): TypographyToken {
  if (!isRecord(raw)) {
    throw new TokensError("stupeň typografie musí být objekt", path);
  }

  for (const key of Object.keys(raw)) {
    if (!TYPOGRAPHY_KEYS.has(key)) {
      throw new TokensError(
        `neznámý klíč "${key}" (povolené: ${[...TYPOGRAPHY_KEYS].join(", ")})`,
        path,
      );
    }
    const value = raw[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new TokensError(`"${key}" musí být neprázdný řetězec`, path);
    }
  }

  if (raw.css !== undefined && !CSS_CUSTOM_PROPERTY.test(raw.css as string)) {
    throw new TokensError('"css" musí být CSS custom property, např. "--text-lg"', path);
  }
  if (typeof raw.size !== "string") {
    throw new TokensError('chybí povinná velikost "size"', path);
  }

  return raw as unknown as TypographyToken;
}

function validateTypography(raw: unknown): TypographyGroup {
  if (!isRecord(raw)) {
    throw new TokensError("skupina typografie musí být objekt", "typography");
  }

  const group: Record<string, TypographyToken> = Object.create(null);
  for (const [name, token] of Object.entries(raw)) {
    group[name] = validateTypographyToken(token, `typography.${name}`);
  }
  return group;
}

function validateRoles(raw: unknown): Partial<Record<RoleName, string>> {
  if (!isRecord(raw)) {
    throw new TokensError("skupina rolí musí být objekt", "roles");
  }

  const roles: Partial<Record<RoleName, string>> = {};
  for (const [name, target] of Object.entries(raw)) {
    if (!(ROLES as readonly string[]).includes(name)) {
      throw new TokensError(`neznámá role "${name}" (demo umí: ${ROLES.join(", ")})`, "roles");
    }
    if (typeof target !== "string" || !QUALIFIED_NAME.test(target)) {
      throw new TokensError(
        'role musí ukazovat na kvalifikované jméno tokenu, např. "color.ink"',
        `roles.${name}`,
      );
    }
    roles[name as RoleName] = target;
  }
  return roles;
}

function validateContrastPairs(raw: unknown): ContrastPair[] {
  if (!Array.isArray(raw)) {
    throw new TokensError("contrastPairs musí být pole", "contrastPairs");
  }

  return raw.map((entry, position) => {
    const path = `contrastPairs[${position}]`;
    if (!isRecord(entry)) {
      throw new TokensError("dvojice musí být objekt s poli fg a bg", path);
    }
    const { fg, bg } = entry;
    for (const [key, value] of [
      ["fg", fg],
      ["bg", bg],
    ] as const) {
      if (typeof value !== "string" || !QUALIFIED_NAME.test(value)) {
        throw new TokensError(
          `"${key}" musí být kvalifikované jméno tokenu, např. "color.ink"`,
          path,
        );
      }
    }
    return { fg: fg as string, bg: bg as string };
  });
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

  const tokens: {
    schemaVersion: number;
    name?: string;
    typography?: TypographyGroup;
    roles?: Partial<Record<RoleName, string>>;
    contrastPairs?: ContrastPair[];
  } & Partial<Record<TokenGroupName, TokenGroup>> = { schemaVersion: SCHEMA_VERSION };

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

  if (raw.typography !== undefined) {
    tokens.typography = validateTypography(raw.typography);
  }
  if (raw.roles !== undefined) {
    tokens.roles = validateRoles(raw.roles);
  }
  if (raw.contrastPairs !== undefined) {
    tokens.contrastPairs = validateContrastPairs(raw.contrastPairs);
  }

  return tokens;
}
