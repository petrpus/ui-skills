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
  }
  [data-role="crumbs"] {
    /* A deep chain scrolls inside its own region — the ✎/💬 actions must
       stay pinned, not ride away with the path. */
    overflow-x: auto;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
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
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: auto;
  }
  [data-role="toast-message"] {
    padding: 10px 16px;
    border-radius: 8px;
    background: #111827;
    color: #f9fafb;
    font-size: 13px;
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
      <button type="button" data-role="crumb-hide" title="Skrýt výběr — hypotéza, co kdyby tu nebyl">🙈 skrýt</button>
      <button type="button" data-role="crumb-remove" title="Smazat výběr — pokyn k odstranění">🗑 smazat</button>
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
 * Where a box of `size` should sit relative to its anchor so it stays inside
 * the viewport: below the anchor by default, flipped above when the bottom
 * would clip, pulled inside at the horizontal edges. Pure, because clipping
 * bugs are exactly the kind jsdom cannot render and a unit test can.
 */
export function clampPosition(anchor, size, viewport) {
  const margin = 8;
  const left = Math.min(
    Math.max(anchor.left, margin),
    Math.max(margin, viewport.width - size.width - margin),
  );

  let top = anchor.bottom + margin;
  if (top + size.height > viewport.height - margin) {
    const above = anchor.top - size.height - margin;
    top = above >= margin ? above : Math.max(margin, viewport.height - size.height - margin);
  }

  return { top, left };
}

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

  /**
   * Messages stack instead of sharing one slot: an error about a lost event
   * must survive the success toast that lands right after it. Transient
   * notes clear themselves; the review's final word stays.
   */
  function say(message, sticky = false) {
    const note = doc.createElement("div");
    note.setAttribute("data-role", "toast-message");
    note.textContent = message;
    toast.appendChild(note);
    toast.removeAttribute("hidden");
    if (!sticky) {
      win.setTimeout(() => {
        note.remove();
        if (toast.childElementCount === 0) {
          toast.setAttribute("hidden", "");
        }
      }, 8000);
    }
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
        // Survives the tab closing mid-flight — the pagehide flush below
        // would be theatre without it (#42). Applied to every send on
        // purpose: any event can be the one in the air when the tab dies.
        // The cost is fetch's shared ~64 KiB keepalive budget; a text edit
        // that large is not a realistic review action.
        keepalive: true,
      })
      .catch(() => say("⚠ událost se neuložila — server neodpovídá"));
    inFlight.add(posted);
    posted.finally(() => inFlight.delete(posted));
    return posted;
  }

  function stopEditing(element) {
    // State and listeners first, DOM last: removing contenteditable from a
    // focused element fires blur synchronously in real browsers, and with
    // the listener still attached that re-entered commitEdit while
    // `editing` was still set — one edit, two log entries.
    editing = null;
    element.removeEventListener("blur", onEditBlur);
    element.removeEventListener("keydown", onEditKeydown);
    element.removeAttribute("contenteditable");
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
    // Shown before measuring — a hidden element has no size to clamp with.
    commentForm.removeAttribute("hidden");
    const measured = commentForm.getBoundingClientRect();
    const { top, left } = clampPosition(
      element.getBoundingClientRect(),
      // jsdom measures zero; the CSS width and a typical height stand in.
      { width: measured.width || 280, height: measured.height || 180 },
      { width: win.innerWidth, height: win.innerHeight },
    );
    commentForm.style.top = `${top}px`;
    commentForm.style.left = `${left}px`;
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
    // The button goes visibly busy for the whole close: on a slow network an
    // unresponsive-looking "Hotovo" invites a second click that the closed
    // flag would swallow silently.
    doneButton.setAttribute("disabled", "");
    doneButton.textContent = "Ukládám…";
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
      say(`✓ review: ${result.reviewPath} — okno můžete zavřít`, true);
    } catch (error) {
      say(`⚠ review se nesložilo: ${error.message}`, true);
    } finally {
      doneButton.textContent = "Hotovo";
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

  /**
   * Captured BEFORE the action mutates or removes the element — afterwards
   * there is nothing left to describe. Same fingerprint rules as the
   * instrumenter: whitespace collapsed, 120 chars.
   */
  function subtreeOf(element) {
    return {
      tag: element.localName,
      elements: element.querySelectorAll("*").length + 1,
      textFingerprint: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    };
  }

  function hideSelected() {
    if (selected === null || closed) {
      return;
    }
    const element = selected;
    send({ type: "hide", cxId: element.getAttribute("data-cx-id"), subtree: subtreeOf(element) });
    // display:none, not removal: a hypothesis stays reversible on the page.
    element.style.display = "none";
    // The element now measures 0x0 at the origin — an outline there is a
    // stray mark, so the box hides while the selection (breadcrumb, actions)
    // stays on the hidden element.
    place(selectBox, null);
    updateBreadcrumb();
  }

  function removeSelected() {
    if (selected === null || closed) {
      return;
    }
    const element = selected;
    send({ type: "remove", cxId: element.getAttribute("data-cx-id"), subtree: subtreeOf(element) });
    element.remove();
    select(null);
  }

  shadow.querySelector("[data-role='crumb-hide']").addEventListener("click", () => {
    hideSelected();
  });
  shadow.querySelector("[data-role='crumb-remove']").addEventListener("click", () => {
    removeSelected();
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

  /**
   * Work that would vanish if the tab died right now: an in-place edit whose
   * text differs from where it started, or a non-empty comment draft.
   * Events already sent do not count — keepalive delivers those.
   */
  function hasUnsavedWork() {
    if (closed) {
      return false;
    }
    if (editing !== null && (editing.element.textContent ?? "") !== editing.before) {
      return true;
    }
    return commenting !== null && commentText.value.trim() !== "";
  }

  win.addEventListener("beforeunload", (event) => {
    if (hasUnsavedWork()) {
      event.preventDefault();
      // Legacy engines key the prompt off returnValue, not preventDefault.
      event.returnValue = "";
    }
  });

  // The user chose to leave anyway (or the prompt never showed): flush what
  // can be flushed. Same policy as Hotovo — edits and non-empty drafts go to
  // the log, an empty draft is dropped. Safe against a bfcache restore: the
  // commit nulls the editing state, and repeated text-edits coalesce.
  win.addEventListener("pagehide", () => {
    if (closed) {
      return;
    }
    commitEdit();
    saveComment();
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
