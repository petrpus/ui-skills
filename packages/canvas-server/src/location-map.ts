import type { LocationMap } from "@ui-skills/snapshot";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/**
 * Reads `map.json` the way the rest of the repo reads untrusted JSON: through
 * a throwing structural check, never a bare cast. The map is written by
 * `canvas-snapshot`, but nothing guarantees the file on disk is the one it
 * wrote — a stale format or a hand edit must fail here, with a message naming
 * the file, not surface later as a half-formed target in review.json.
 */
export function parseLocationMap(raw: string): LocationMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("map.json není platný JSON");
  }
  if (!isRecord(parsed)) {
    throw new Error("map.json musí obsahovat objekt cx-id → umístění");
  }

  for (const [cxId, location] of Object.entries(parsed)) {
    if (!isRecord(location)) {
      throw new Error(`map.json: "${cxId}" musí být objekt`);
    }
    if (typeof location.selector !== "string" || location.selector === "") {
      throw new Error(`map.json: "${cxId}" nemá neprázdný "selector"`);
    }
    if (
      !Array.isArray(location.hostPath) ||
      location.hostPath.some((step) => typeof step !== "string")
    ) {
      throw new Error(`map.json: "${cxId}" nemá "hostPath" jako pole řetězců`);
    }
    if (typeof location.textFingerprint !== "string") {
      throw new Error(`map.json: "${cxId}" nemá "textFingerprint"`);
    }
    for (const key of ["xpath", "sourceHint"] as const) {
      if (location[key] !== undefined && typeof location[key] !== "string") {
        throw new Error(`map.json: "${cxId}" má "${key}", ale není to řetězec`);
      }
    }
  }

  return parsed as LocationMap;
}
