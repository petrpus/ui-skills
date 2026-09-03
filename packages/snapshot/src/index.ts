export { type CaptureResult, capture, targetUrl } from "./capture.ts";
export { instrument } from "./instrument.ts";
export { loginWarning, looksLikeLoginPage, preflightUrl } from "./preflight.ts";
export { sanitize } from "./sanitize.ts";
export {
  type CdpNode,
  closedShadowWarning,
  countClosedShadowRoots,
  probeClosedShadowRoots,
  reportClosedShadowRoots,
} from "./shadow-probe.ts";
export {
  CX_ID_ATTRIBUTE,
  type ElementLocation,
  type Instrumented,
  type LocationMap,
} from "./types.ts";
