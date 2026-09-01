import type { DOMWindow } from "jsdom";

/**
 * Types for the no-build overlay module, for the benefit of the jsdom tests —
 * the browser loads overlay.js as-is and never sees this file. jsdom's types
 * stand in for the DOM lib, which this repo's tsconfig deliberately omits.
 */
type OverlayHost = ReturnType<DOMWindow["document"]["createElement"]>;

export function initOverlay(win: DOMWindow): OverlayHost | null;
