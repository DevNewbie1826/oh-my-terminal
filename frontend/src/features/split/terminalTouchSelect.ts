import type { Terminal } from "@xterm/xterm";

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

/**
 * xterm.js has no touch selection: a touch drag always scrolls. This adds
 * the mobile-terminal idiom — hold still for LONG_PRESS_MS to arm selection,
 * then drag. Selection is driven by replaying synthetic mouse events into
 * xterm's own mouse-based selection service, so no private APIs are touched.
 * On release the selection is copied and onCopied fires (for a toast).
 *
 * Returns a disposer.
 */
export function registerTouchSelect(
  term: Terminal,
  el: HTMLElement,
  onCopied: () => void,
): () => void {
  let timer = 0;
  let selecting = false;
  let startX = 0;
  let startY = 0;

  const fireMouse = (type: string, x: number, y: number, target: EventTarget): void => {
    /* When the app (tmux/vim) owns the mouse, xterm skips local selection
       unless the force-selection modifier is held: Shift on non-Mac, Option
       on Mac (macOptionClickForcesSelection is enabled in useTerminal).
       With no app mouse reporting, modifiers would reroute the click to
       incremental mode and no selection would start. detail: 1 matters —
       xterm picks the click handler by detail and ignores synthetic
       detail-0 events. */
    const force = term.modes.mouseTrackingMode !== "none";
    const forceMac = navigator.platform.toUpperCase().includes("MAC");
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "mouseup" ? 0 : 1,
        detail: 1,
        shiftKey: force && !forceMac,
        altKey: force && forceMac,
        view: window,
      }),
    );
  };

  const onTouchStart = (ev: TouchEvent): void => {
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      selecting = true;
      navigator.vibrate?.(10);
      const target = document.elementFromPoint(startX, startY) ?? el;
      fireMouse("mousedown", startX, startY, target);
    }, LONG_PRESS_MS);
  };

  const onTouchMove = (ev: TouchEvent): void => {
    const t = ev.touches[0];
    if (!t) return;
    if (!selecting) {
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > MOVE_CANCEL_PX) {
        window.clearTimeout(timer);
      }
      return;
    }
    // Selecting: the gesture must not scroll the viewport. Requires the
    // listener to be registered with passive: false. stopImmediatePropagation
    // also hides the touch from xterm's document-level gesture scroll, whose
    // wheel reports would reach the PTY as input and clear the selection.
    ev.preventDefault();
    ev.stopImmediatePropagation();
    fireMouse("mousemove", t.clientX, t.clientY, document);
  };

  const onTouchEnd = (ev: TouchEvent): void => {
    window.clearTimeout(timer);
    if (!selecting) return;
    selecting = false;
    const t = ev.changedTouches[0];
    if (!t) return;
    fireMouse("mouseup", t.clientX, t.clientY, document);
    const selection = term.getSelection();
    if (selection.trim().length > 0) {
      void copyText(selection).then((ok) => {
        if (ok) onCopied();
      });
    }
    // Keep xterm's gesture handler from turning the release into inertial
    // wheel scroll (see onTouchMove).
    ev.stopImmediatePropagation();
  };

  const onTouchCancel = (ev: TouchEvent): void => {
    window.clearTimeout(timer);
    if (selecting) ev.stopImmediatePropagation();
    selecting = false;
  };

  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd);
  el.addEventListener("touchcancel", onTouchCancel);

  return () => {
    window.clearTimeout(timer);
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchCancel);
  };
}

/** Clipboard write with a fallback for non-secure contexts (plain HTTP on LAN),
 *  where navigator.clipboard is undefined. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied — try the legacy path */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    /* unsupported */
  }
  ta.remove();
  return ok;
}
