/**
 * Pre-capture checks for URL inputs.
 *
 * The serialiser exits 0 and writes nothing on a failed capture, so it can
 * never say WHY a page did not come — a 404, a dead domain and a hanging
 * server all look identical. One cheap fetch beforehand turns "nástroj
 * neřekl proč" into an error a person can act on. Local files skip this
 * entirely; their failure modes are the filesystem's.
 */

const LOGIN_PATH = /\/(log-?in|sign-?in|sso|auth|prihlaseni)([/?#]|$)/i;

export interface PreflightOptions {
  readonly timeoutMs?: number;
  /** Injectable for tests that need a failure no local server can produce. */
  readonly fetchFn?: typeof fetch;
}

export async function preflightUrl(input: string, options: PreflightOptions = {}): Promise<void> {
  if (!/^https?:\/\//i.test(input)) {
    return;
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const fetchFn = options.fetchFn ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(input, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    if ((error as Error).name === "TimeoutError") {
      throw new Error(`stránka neodpověděla do ${Math.round(timeoutMs / 1000)} s (timeout)`);
    }
    if (cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN") {
      throw new Error("doménu se nepodařilo přeložit (DNS) — zkontrolujte adresu");
    }
    throw new Error(`stránka není dostupná: ${(error as Error).message}`);
  }

  // Headers were all we needed — leaving the body unconsumed keeps the
  // undici connection dangling on slow-draining pages.
  await response.body?.cancel();

  if (!response.ok) {
    throw new Error(`stránka vrátila HTTP ${response.status} — není co zachycovat`);
  }
}

/**
 * Best-effort: a password field in the capture, or a login-shaped path in
 * the source address. Wrong sometimes by design — the snapshot is kept
 * either way, this only decides whether to say the sentence below.
 */
export function looksLikeLoginPage(html: string, source: string): boolean {
  if (/<input[^>]*type=["']?password/i.test(html)) {
    return true;
  }
  try {
    return LOGIN_PATH.test(new URL(source).pathname);
  } catch {
    return false;
  }
}

export function loginWarning(): string {
  return (
    "⚠ zachycená stránka vypadá jako přihlašovací obrazovka — stránky za " +
    "loginem zvládne až --profile (fáze 3); snapshot je přesto uložen"
  );
}
