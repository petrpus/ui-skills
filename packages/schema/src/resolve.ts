import {
  type ResolvedContrastPair,
  type ResolvedGroup,
  type ResolvedRoles,
  type ResolvedToken,
  type ResolvedTokens,
  type ResolvedTypographyToken,
  type RoleName,
  TOKEN_GROUPS,
  type Token,
  type TokenGroupName,
  type Tokens,
  TokensError,
} from "./types.ts";

function indexTokens(tokens: Tokens): Map<string, Token> {
  const index = new Map<string, Token>();
  for (const groupName of TOKEN_GROUPS) {
    const group = tokens[groupName];
    if (group === undefined) {
      continue;
    }
    for (const [name, token] of Object.entries(group)) {
      index.set(`${groupName}.${name}`, token);
    }
  }
  return index;
}

interface Resolution {
  readonly value: string;
  readonly chain: readonly string[];
}

/**
 * Which face of a token to read. In dark mode a token's override stands in for
 * its value *and* for its reference, at every hop — so a semantic token pointing
 * at a palette entry that darkens follows it, without needing an override of its
 * own. That is what makes a palette swap one edit instead of twenty.
 */
type Mode = "light" | "dark";

function faceOf(
  token: Token,
  mode: Mode,
): { value?: string | undefined; ref?: string | undefined } {
  if (mode === "dark" && token.dark !== undefined) {
    return "ref" in token.dark ? { ref: token.dark.ref } : { value: token.dark.value };
  }
  return token.ref === undefined ? { value: token.value } : { ref: token.ref };
}

/**
 * Records the answer for every token on the walked path, not just the one asked
 * about: each is the head of its own valid chain. Without this, resolving a
 * chain of n tokens walks it n times over.
 *
 * This buys a large constant factor, not a better complexity class. Giving each
 * token its own `chain` means a chain of n tokens produces n arrays totalling
 * n²/2 entries no matter how it is computed — a floor set by the data shape.
 * What the cache removes is the repeated graph walking on top of that, which is
 * what actually hurts: the realistic shape, many semantic tokens pointing at one
 * primitive, becomes linear.
 */
function memoize(chain: readonly string[], value: string, cache: Map<string, Resolution>): void {
  for (let i = 0; i < chain.length; i += 1) {
    const name = chain[i];
    if (name !== undefined && !cache.has(name)) {
      cache.set(name, { value, chain: chain.slice(i) });
    }
  }
}

/**
 * Walks a token's references to the literal at the end. A reference may point at
 * another reference — the chain is followed as far as it goes, since the depth
 * is the author's business, not the format's.
 */
function follow(
  qualifiedName: string,
  index: ReadonlyMap<string, Token>,
  cache: Map<string, Resolution>,
  mode: Mode = "light",
): Resolution {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = qualifiedName;

  for (;;) {
    const known = cache.get(current);
    if (known !== undefined) {
      const full = [...chain, ...known.chain];
      memoize(full, known.value, cache);
      return { value: known.value, chain: full };
    }

    if (seen.has(current)) {
      throw new TokensError(`cyklický odkaz: ${[...chain, current].join(" → ")}`, qualifiedName);
    }
    seen.add(current);
    chain.push(current);

    const token = index.get(current);
    if (token === undefined) {
      const from = chain.at(-2);
      throw new TokensError(`odkaz na neexistující token "${current}"`, from ?? qualifiedName);
    }

    const face = faceOf(token, mode);
    if (face.ref === undefined) {
      const value = face.value ?? "";
      memoize(chain, value, cache);
      return { value, chain };
    }
    current = face.ref;
  }
}

function resolveGroup(
  groupName: TokenGroupName,
  tokens: Tokens,
  index: ReadonlyMap<string, Token>,
  cache: Map<string, Resolution>,
  darkCache: Map<string, Resolution>,
): ResolvedGroup {
  const group = tokens[groupName];
  if (group === undefined) {
    return [];
  }

  return Object.entries(group).map(([name, token]) => {
    const qualifiedName = `${groupName}.${name}`;
    const { value, chain } = follow(qualifiedName, index, cache);
    const dark = follow(qualifiedName, index, darkCache, "dark").value;

    const resolved: ResolvedToken = {
      name,
      qualifiedName,
      value,
      chain: [...chain],
      // Only when it actually differs: a token that looks the same in both
      // modes should not make the demo think it has a dark mode to show.
      ...(dark === value ? {} : { dark }),
      ...(token.css === undefined ? {} : { css: token.css }),
      ...(token.description === undefined ? {} : { description: token.description }),
    };
    return resolved;
  });
}

/**
 * Resolves a token named from outside a group — a role or a contrast pair. The
 * caller's name is in the error, because "role text points nowhere" is a more
 * useful complaint than "color.ink is missing".
 */
function resolveReference(
  target: string,
  origin: string,
  index: ReadonlyMap<string, Token>,
  cache: Map<string, Resolution>,
  darkCache: Map<string, Resolution>,
): ResolvedToken {
  if (!index.has(target)) {
    throw new TokensError(`odkazuje na neexistující token "${target}"`, origin);
  }

  const { value, chain } = follow(target, index, cache);
  const dark = follow(target, index, darkCache, "dark").value;
  const token = index.get(target);
  const name = target.slice(target.indexOf(".") + 1);

  return {
    name,
    qualifiedName: target,
    value,
    chain: [...chain],
    ...(dark === value ? {} : { dark }),
    ...(token?.css === undefined ? {} : { css: token.css }),
    ...(token?.description === undefined ? {} : { description: token.description }),
  };
}

/**
 * Turns a validated document into one where every token carries its literal
 * value and the path it took to get there.
 *
 * Kept separate from validation because the two answer different questions:
 * validation asks whether the document is well formed, resolution asks whether
 * it makes sense as a whole. A dangling reference is only visible once every
 * token is known.
 */
export function resolveTokens(tokens: Tokens): ResolvedTokens {
  const index = indexTokens(tokens);
  const cache = new Map<string, Resolution>();
  const darkCache = new Map<string, Resolution>();

  const resolved: {
    schemaVersion: number;
    name?: string;
    typography?: readonly ResolvedTypographyToken[];
    roles?: ResolvedRoles;
    contrastPairs?: readonly ResolvedContrastPair[];
  } & Partial<Record<TokenGroupName, ResolvedGroup>> = {
    schemaVersion: tokens.schemaVersion,
  };

  if (tokens.name !== undefined) {
    resolved.name = tokens.name;
  }

  for (const groupName of TOKEN_GROUPS) {
    if (tokens[groupName] !== undefined) {
      resolved[groupName] = resolveGroup(groupName, tokens, index, cache, darkCache);
    }
  }

  if (tokens.typography !== undefined) {
    resolved.typography = Object.entries(tokens.typography).map(([name, step]) => ({
      name,
      ...step,
    }));
  }

  if (tokens.roles !== undefined) {
    const roles: Partial<Record<RoleName, ResolvedToken>> = {};
    for (const [role, target] of Object.entries(tokens.roles)) {
      roles[role as RoleName] = resolveReference(target, `roles.${role}`, index, cache, darkCache);
    }
    resolved.roles = roles;
  }

  if (tokens.contrastPairs !== undefined) {
    resolved.contrastPairs = tokens.contrastPairs.map((pair, position) => ({
      fg: resolveReference(pair.fg, `contrastPairs[${position}].fg`, index, cache, darkCache),
      bg: resolveReference(pair.bg, `contrastPairs[${position}].bg`, index, cache, darkCache),
    }));
  }

  return resolved;
}
