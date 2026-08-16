import {
  type ResolvedGroup,
  type ResolvedToken,
  type ResolvedTokens,
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

/**
 * Walks a token's references to the literal at the end. A reference may point at
 * another reference — the chain is followed as far as it goes, since the depth
 * is the author's business, not the format's.
 */
function follow(
  qualifiedName: string,
  index: ReadonlyMap<string, Token>,
): { value: string; chain: string[] } {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = qualifiedName;

  for (;;) {
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
    if (token.ref === undefined) {
      return { value: token.value, chain };
    }
    current = token.ref;
  }
}

function resolveGroup(
  groupName: TokenGroupName,
  tokens: Tokens,
  index: ReadonlyMap<string, Token>,
): ResolvedGroup {
  const group = tokens[groupName];
  if (group === undefined) {
    return [];
  }

  return Object.entries(group).map(([name, token]) => {
    const qualifiedName = `${groupName}.${name}`;
    const { value, chain } = follow(qualifiedName, index);

    const resolved: ResolvedToken = {
      name,
      qualifiedName,
      value,
      chain,
      ...(token.css === undefined ? {} : { css: token.css }),
      ...(token.description === undefined ? {} : { description: token.description }),
    };
    return resolved;
  });
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

  const resolved: {
    schemaVersion: number;
    name?: string;
  } & Partial<Record<TokenGroupName, ResolvedGroup>> = {
    schemaVersion: tokens.schemaVersion,
  };

  if (tokens.name !== undefined) {
    resolved.name = tokens.name;
  }

  for (const groupName of TOKEN_GROUPS) {
    if (tokens[groupName] !== undefined) {
      resolved[groupName] = resolveGroup(groupName, tokens, index);
    }
  }

  return resolved;
}
