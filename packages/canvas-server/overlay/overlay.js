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
  [data-role="breadcrumb"] {
    position: fixed;
    left: 16px;
    bottom: 16px;
    max-width: calc(100vw - 180px);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    background: #111827;
    color: #f9fafb;
    font-size: 13px;
    pointer-events: auto;
    /* A deep chain scrolls inside the bar instead of wrapping over the page. */
    overflow-x: auto;
    white-space: nowrap;
  }
  [data-role="breadcrumb"] button {
    border: none;
    background: none;
    color: #9ca3af;
    font: inherit;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
  }
  [data-role="breadcrumb"] button:hover {
    color: #f9fafb;
    background: rgba(255, 255, 255, 0.1);
  }
  [data-role="breadcrumb"] button[data-current="true"] {
    color: #f9fafb;
    font-weight: 600;
  }
  [data-role="breadcrumb"] .sep {
    color: #4b5563;
    user-select: none;
  }
  [data-role="breadcrumb"] .actions {
    display: flex;
    gap: 4px;
    margin-left: 8px;
    padding-left: 8px;
    border-left: 1px solid #374151;
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
  <div data-role="breadcrumb" hidden>
    <span data-role="crumbs"></span>
    <span class="actions">
      <button type="button" data-role="crumb-edit" title="Upravit text výběru">✎ text</button>
      <button type="button" data-role="crumb-comment" title="Komentovat výběr">💬 komentář</button>
    </span>
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
  const breadcrumbBar = shadow.querySelector("[data-role='breadcrumb']");
  const crumbsHolder = shadow.querySelector("[data-role='crumbs']");
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

  /**
   * Every event POST still in the air. Fire-and-forget is right for the
   * editing flow — but /done compiles from whatever reached the disk, so
   * closing the review must first wait these out or a late event silently
   * misses the log (#48).
   */
  const inFlight = new Set();

  function send(event) {
    const posted = win
      .fetch("/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      })
      .catch(() => say("⚠ událost se neuložila — server neodpovídá"));
    inFlight.add(posted);
    posted.finally(() => inFlight.delete(posted));
    return posted;
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

  /**
   * Instrumented ancestors from the outermost down to the element itself.
   * Walks parentElement, so the chain stops at a shadow boundary — clicks
   * from inside a nested shadow tree retarget to the host before they reach
   * selection anyway, so nothing deeper can become `selected` today.
   */
  function chainFor(element) {
    const chain = [];
    let current = element;
    while (current !== null) {
      if (typeof current.getAttribute === "function" && current.getAttribute("data-cx-id") !== null) {
        chain.unshift(current);
      }
      current = current.parentElement;
    }
    return chain;
  }

  function updateBreadcrumb() {
    crumbsHolder.textContent = "";
    if (selected === null || closed) {
      breadcrumbBar.setAttribute("hidden", "");
      return;
    }
    chainFor(selected).forEach((ancestor, index) => {
      if (index > 0) {
        const separator = doc.createElement("span");
        separator.className = "sep";
        separator.textContent = "›";
        crumbsHolder.appendChild(separator);
      }
      const crumb = doc.createElement("button");
      crumb.type = "button";
      crumb.setAttribute("data-role", "crumb");
      // Tag name only: the snapshot's class names are minified noise, and the
      // id, when present, is the one hint a human can actually recognise.
      crumb.textContent = ancestor.id ? `${ancestor.localName}#${ancestor.id}` : ancestor.localName;
      if (ancestor === selected) {
        crumb.setAttribute("data-current", "true");
      }
      crumb.addEventListener("click", () => select(ancestor));
      crumbsHolder.appendChild(crumb);
    });
    breadcrumbBar.removeAttribute("hidden");
  }

  /**
   * The one path selection changes go through — and therefore the one place
   * for the housekeeping every change needs: an open edit is committed (the
   * reviewer's next keystrokes must not land in a no-longer-selected
   * element) and an open comment bubble closed (saving it after promotion
   * would pin it to the wrong element). A crumb click reaches only this
   * function, so the guards cannot live in the document handlers alone.
   */
  function select(element) {
    if (editing !== null && element !== editing.element) {
      commitEdit();
    }
    if (commenting !== null) {
      closeCommentForm();
    }
    selected = element;
    place(selectBox, selected);
    updateBreadcrumb();
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
    // Flush, don't discard: an open edit or comment draft is committed
    // first, and then every event POST still in the air is awaited — the
    // "Uložit" button's send is already detached from any draft state, and
    // /done must not outrun any of them to the log. An empty comment draft
    // is the one thing dropped silently.
    commitEdit();
    saveComment();
    closed = true;
    await Promise.all([...inFlight]);
    hovered = null;
    place(hoverBox, null);
    updateBreadcrumb();
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
      select(element);
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
    select(element);
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

  shadow.querySelector("[data-role='crumb-edit']").addEventListener("click", () => {
    if (selected !== null && !closed) {
      startEditing(selected);
    }
  });
  shadow.querySelector("[data-role='crumb-comment']").addEventListener("click", () => {
    if (selected !== null && !closed) {
      openCommentForm(selected);
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
