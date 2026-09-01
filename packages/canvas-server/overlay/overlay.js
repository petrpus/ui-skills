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
  [data-role="comment"] {
    position: fixed;
    width: 280px;
    padding: 10px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: #111827;
  }
  [data-role="comment"] textarea {
    resize: vertical;
    min-height: 56px;
    font: inherit;
    padding: 6px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
  }
  [data-role="comment"] .row {
    display: flex;
    gap: 6px;
  }
  [data-role="comment"] select {
    flex: 1;
    font: inherit;
  }
  [data-role="comment"] .row button {
    flex: 1;
    padding: 6px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  button[data-role="comment-save"] {
    background: #1d4ed8;
    color: #fff;
  }
  button[data-role="comment-cancel"] {
    background: #e5e7eb;
  }
  [data-role="pin"] {
    position: fixed;
    width: 14px;
    height: 14px;
    border-radius: 50% 50% 50% 0;
    background: #f59e0b;
    outline: 2px solid #fff;
    pointer-events: none;
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
  <div data-role="comment" hidden>
    <textarea data-role="comment-text" placeholder="Komentář k prvku…"></textarea>
    <div class="row">
      <select data-role="comment-category">
        <option value="change-request">požadavek</option>
        <option value="question">otázka</option>
        <option value="idea">nápad</option>
      </select>
      <select data-role="comment-priority">
        <option value="low">nízká</option>
        <option value="medium" selected>střední</option>
        <option value="high">vysoká</option>
      </select>
    </div>
    <div class="row">
      <button type="button" data-role="comment-save">Uložit</button>
      <button type="button" data-role="comment-cancel">Zrušit</button>
    </div>
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
  const commentForm = shadow.querySelector("[data-role='comment']");
  const commentText = shadow.querySelector("[data-role='comment-text']");
  const commentCategory = shadow.querySelector("[data-role='comment-category']");
  const commentPriority = shadow.querySelector("[data-role='comment-priority']");

  let hovered = null;
  let selected = null;
  /** { element, before } while an inline edit is open, otherwise null. */
  let editing = null;
  let closed = false;
  /** The element the open comment bubble is pinned to, otherwise null. */
  let commenting = null;
  /** Elements with a saved comment, so their pins can follow the scroll. */
  const pinned = [];
  let cHeld = false;

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

  /**
   * True where a keystroke is ordinary typing rather than a chord: the frozen
   * page can carry its own inputs and editable regions, and a word containing
   * "c" typed into one of them must not arm the comment gesture.
   */
  function isTypingTarget(target) {
    if (target === null || typeof target.tagName !== "string") {
      return false;
    }
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
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

  function placePin(pin, element) {
    const rect = element.getBoundingClientRect();
    pin.style.top = `${rect.top - 6}px`;
    pin.style.left = `${rect.right - 8}px`;
  }

  function addPin(element) {
    const pin = doc.createElement("div");
    pin.setAttribute("data-role", "pin");
    shadow.appendChild(pin);
    pinned.push({ element, pin });
    placePin(pin, element);
  }

  function closeCommentForm() {
    commenting = null;
    commentForm.setAttribute("hidden", "");
  }

  function openCommentForm(element) {
    commenting = element;
    commentText.value = "";
    commentCategory.value = "change-request";
    commentPriority.value = "medium";
    const rect = element.getBoundingClientRect();
    commentForm.style.top = `${rect.bottom + 8}px`;
    commentForm.style.left = `${rect.left}px`;
    commentForm.removeAttribute("hidden");
    commentText.focus();
  }

  function saveComment() {
    if (commenting === null) {
      return undefined;
    }
    const element = commenting;
    const text = commentText.value.trim();
    closeCommentForm();
    if (text === "") {
      return undefined;
    }
    addPin(element);
    return send({
      type: "comment",
      cxId: element.getAttribute("data-cx-id"),
      text,
      category: commentCategory.value,
      priority: commentPriority.value,
    });
  }

  async function finishReview() {
    if (closed) {
      return;
    }
    // Flush, don't discard: "finish typing, hit Ctrl+Enter" is the normal
    // way to leave the last edit or comment — and /done must not outrun
    // either to the log, so the flushes are awaited before the review
    // compiles. An empty comment draft is the one thing dropped silently.
    const flushes = [commitEdit(), saveComment()].filter((flush) => flush !== undefined);
    closed = true;
    await Promise.all(flushes);
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
      if (commenting !== null) {
        closeCommentForm();
      }
      selected = element;
      place(selectBox, selected);
      if (cHeld && element !== null) {
        openCommentForm(element);
      }
    },
    true,
  );

  doc.addEventListener("dblclick", (event) => {
    const element = instrumentedFrom(event);
    if (element === null || (editing !== null && element === editing.element)) {
      return;
    }
    event.preventDefault();
    // Explicit, not left to the click pair that precedes a native dblclick —
    // a synthetic dblclick arrives without them.
    if (commenting !== null) {
      closeCommentForm();
    }
    selected = element;
    place(selectBox, selected);
    startEditing(element);
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      finishReview();
      return;
    }
    // Held only when it cannot be ordinary typing: not from the overlay's
    // own form (retargeted to host), not mid-edit, and not from the frozen
    // page's own inputs or editable regions.
    if (
      (event.key === "c" || event.key === "C") &&
      event.target !== host &&
      editing === null &&
      !isTypingTarget(event.target)
    ) {
      cHeld = true;
    }
  });

  doc.addEventListener("keyup", (event) => {
    if (event.key === "c" || event.key === "C") {
      cHeld = false;
    }
  });
  // Alt-tab while holding C must not leave the flag stuck.
  win.addEventListener("blur", () => {
    cHeld = false;
  });

  commentText.addEventListener("keydown", (event) => {
    // The bubble owns its keys: Ctrl+Enter saves the comment rather than
    // closing the whole review under the writer's hands.
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      saveComment();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeCommentForm();
    }
  });

  shadow.querySelector("[data-role='comment-save']").addEventListener("click", () => {
    saveComment();
  });
  shadow.querySelector("[data-role='comment-cancel']").addEventListener("click", () => {
    closeCommentForm();
  });

  const reposition = () => {
    place(hoverBox, hovered);
    place(selectBox, selected);
    for (const { element, pin } of pinned) {
      placePin(pin, element);
    }
  };
  win.addEventListener("scroll", reposition, { passive: true });
  win.addEventListener("resize", reposition, { passive: true });

  doneButton.addEventListener("click", () => finishReview());

  return host;
}
