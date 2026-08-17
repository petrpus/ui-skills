import type { JSDOM } from "jsdom";

type Document = JSDOM["window"]["document"];

/** The document back to HTML, doctype included. */
export function serialize(document: Document): string {
  const doctype = document.doctype === null ? "" : "<!doctype html>\n";
  return `${doctype}${document.documentElement.outerHTML}`;
}
