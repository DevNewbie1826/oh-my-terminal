import { Terminal } from "@xterm/xterm";
import type { WsConn } from "../../lib/ws";

interface BooleanRef {
  readonly current: boolean;
}

const ARROW_KEYS: Readonly<Record<string, { ctrl: string; meta: string }>> = {
  ArrowLeft: { ctrl: "\x1bb", meta: "\x01" },
  ArrowRight: { ctrl: "\x1bf", meta: "\x05" },
};

// xterm drops Meta for Backspace; remap the iTerm conventions.
const META_EDIT_KEYS: Readonly<Record<string, string>> = {
  Backspace: "\x15",
  Delete: "\x0b",
};

export function registerTerminalKeys(term: Terminal, conn: WsConn, composingRef: BooleanRef): () => void {
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    // xterm ignores Meta+Arrow (browser/OS shortcut) and most shells have no
    // binding for xterm's Ctrl+Arrow sequence, so remap both to conventional
    // readline sequences: Ctrl+Arrow to word motion, Cmd+Arrow to line ends.
    if (!event.shiftKey && !event.altKey && !event.isComposing && !composingRef.current) {
      const mapping = ARROW_KEYS[event.key];
      if (mapping && event.ctrlKey !== event.metaKey) {
        event.preventDefault();
        conn.send({ type: "input", data: event.ctrlKey ? mapping.ctrl : mapping.meta });
        return false;
      }
      const editSeq = META_EDIT_KEYS[event.key];
      if (editSeq && event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        conn.send({ type: "input", data: editSeq });
        return false;
      }
    }
    // xterm's default handler drops the Shift modifier for Enter (sends CR
    // for both), so send the kitty sequence explicitly; tmux 3.4+ forwards
    // CSI u and TUIs interpret it as newline-insert.
    if (
      event.key === "Enter" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing &&
      !composingRef.current
    ) {
      // Returning false does not cancel the DOM event in this xterm beta.
      event.preventDefault();
      conn.send({ type: "input", data: "\x1b[13;2u" });
      return false;
    }
    return true;
  });

  // Restore xterm's default handler; custom handlers have no disposable.
  return () => term.attachCustomKeyEventHandler(() => true);
}
