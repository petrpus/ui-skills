/**
 * The review overlay — a pure ES module, no build step, no framework.
 *
 * Injected by canvas-serve at request time, never written into the stored
 * snapshot. Everything visual lives in a shadow root so the styles are
 * isolated both ways: the frozen page's cascade cannot reach the overlay,
 * and the overlay adds nothing to the page's own stylesheets.
 *
 * Every action is POSTed the moment it happens — durability belongs to the
 * server's append-only log, not to this tab surviving until "Hotovo".
 */

const STYLES = `
  :host {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    font-family: system-ui, sans-serif;
  }
  .box {
    position: fixed;
    pointer-events: none;
    box-sizing: border-box;
  }
  [data-role="hover"] {
    background: rgba(79, 128, 255, 0.18);
    outline: 1px solid rgba(79, 128, 255, 0.85);
  }
  [data-role="select"] {
    outline: 2px solid #1d4ed8;
    outline-offset: 1px;
  }
  [data-role="toolbar"] {
    position: fixed;
    right: 16px;
    bottom: 16px;
    pointer-events: auto;
  }
  button[data-role="done"] {
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    background: #1d4ed8;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  [data-role="toast"] {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    max-width: 80vw;
    padding: 10px 16px;
    border-radius: 8px;
    background: #111827;
    color: #f9fafb;
    font-size: 13px;
    pointer-events: auto;
  }
  [hidden] {
    display: none;
  }
`;

const MARKUP = `
  <style>${STYLES}</style>
  <div class="box" data-role="hover" hidden></div>
  <div class="box" data-role="select" hidden></div>
  <div data-role="toolbar">
    <button type="button" data-role="done" title="Ctrl+Enter">Hotovo</button>
  </div>
  <div data-role="toast" hidden></div>
`;

/**
 * Boots the overlay into a window. Returns the host element, or null when an
 * overlay is already present — booting twice would double every event.
 */
export function initOverlay(win) {
  const doc = win.document;
  if (doc.getElementById("cx-overlay-host") !== null) {
    return null;
  }

  const host = doc.createElement("div");
  host.id = "cx-overlay-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = MARKUP;
  doc.body.appendChild(host);

  const hoverBox = shadow.querySelector("[data-role='hover']");
  const selectBox = shadow.querySelector("[data-role='select']");
  const doneButton = shadow.querySelector("[data-role='done']");
  const toast = shadow.querySelector("[data-role='toast']");

  let hovered = null;
  let selected = null;
  /** { element, before } while an inline edit is open, otherwise null. */
  let editing = null;
  let closed = false;

  function place(box, element) {
    if (element === null) {
      box.setAttribute("hidden", "");
      return;
    }
    const rect = element.getBoundingClientRect();
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.removeAttribute("hidden");
  }

  function instrumentedFrom(event) {
    const target = event.target;
    if (target === host || closed || typeof target.closest !== "function") {
      return null;
    }
    return target.closest("[data-cx-id]");
  }

  function say(message) {
    toast.textContent = message;
    toast.removeAttribute("hidden");
  }

  function send(event) {
    return win
      .fetch("/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      })
      .catch(() => say("⚠ událost se neuložila — server neodpovídá"));
  }

  function stopEditing(element) {
    element.removeAttribute("contenteditable");
    element.removeEventListener("blur", onEditBlur);
    element.removeEventListener("keydown", onEditKeydown);
    editing = null;
  }

  function commitEdit() {
    if (editing === null) {
      return undefined;
    }
    const { element, before } = editing;
    const after = element.textContent ?? "";
    stopEditing(element);
    if (after === before) {
      return undefined;
    }
    return send({ type: "text-edit", cxId: element.getAttribute("data-cx-id"), before, after });
  }

  function cancelEdit() {
    if (editing === null) {
      return;
    }
    const { element, before } = editing;
    element.textContent = before;
    stopEditing(element);
  }

  function onEditBlur() {
    commitEdit();
  }

  function onEditKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      commitEdit();
    }
  }

  function startEditing(element) {
    if (editing !== null) {
      commitEdit();
    }
    editing = { element, before: element.textContent ?? "" };
    // plaintext-only where the browser knows it. The "true" fallback allows
    // rich paste, whose inline event handlers are dead only because the
    // served copy's CSP has no 'unsafe-inline' — keep the two in sync.
    element.setAttribute("contenteditable", "plaintext-only");
    if (!element.isContentEditable) {
      element.setAttribute("contenteditable", "true");
    }
    element.addEventListener("blur", onEditBlur);
    element.addEventListener("keydown", onEditKeydown);
    element.focus();
  }

  async function finishReview() {
    if (closed) {
      return;
    }
    // Flush, don't discard: "finish typing, hit Ctrl+Enter" is the normal
    // way to leave the last edit — and /done must not outrun it to the log,
    // so the flush is awaited before the review compiles.
    const flush = commitEdit();
    closed = true;
    if (flush !== undefined) {
      await flush;
    }
    hovered = null;
    place(hoverBox, null);
    try {
      const response = await win.fetch("/done", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "server vrátil chybu");
      }
      say(`✓ review: ${result.reviewPath} — okno můžete zavřít`);
    } catch (error) {
      say(`⚠ review se nesložilo: ${error.message}`);
    }
  }

  doc.addEventListener("mousemove", (event) => {
    if (editing !== null) {
      return;
    }
    hovered = instrumentedFrom(event);
    place(hoverBox, hovered);
  });

  // Capture phase, so a click selects even where the frozen page once had
  // its own handlers, and a link never navigates away from the session.
  doc.addEventListener(
    "click",
    (event) => {
      if (event.target === host) {
        return;
      }
      const element = instrumentedFrom(event);
      if (editing !== null && element === editing.element) {
        return;
      }
      event.preventDefault();
      if (editing !== null) {
        commitEdit();
      }
      selected = element;
      place(selectBox, selected);
    },
    true,
  );

  doc.addEventListener("dblclick", (event) => {
    const element = instrumentedFrom(event);
    if (element === null || (editing !== null && element === editing.element)) {
      return;
    }
    event.preventDefault();
    selected = element;
    place(selectBox, selected);
    startEditing(element);
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      finishReview();
    }
  });

  const reposition = () => {
    place(hoverBox, hovered);
    place(selectBox, selected);
  };
  win.addEventListener("scroll", reposition, { passive: true });
  win.addEventListener("resize", reposition, { passive: true });

  doneButton.addEventListener("click", () => finishReview());

  return host;
}
