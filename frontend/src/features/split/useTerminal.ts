import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { connectWs } from "../../lib/ws";
import type { WsConn } from "../../lib/ws";
import { wsPath } from "../terminal/terminal";
import { isCleanClose, isOutputMsg } from "./terminalConnection";
import { fitFullWidth } from "./terminalFit";
import { registerTerminalClipboard } from "./terminalClipboard";
import { registerTouchSelect } from "./terminalTouchSelect";
import { XTERM_THEME } from "./terminalTheme";
import { registerTerminalKeys } from "./terminalKeys";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

/** SGR mouse report carrying NaN coordinates — xterm's touch-inertia bug. */
const MALFORMED_MOUSE_RE = /\x1b\[<\d+;NaN/;

export interface UseTerminalOptions {
  readonly wsId: string;
  readonly tmId: string;
  readonly stack: string;
  readonly fontSize: number;
  readonly focused: boolean;
  /** Fired after a touch long-press selection is copied to the clipboard. */
  readonly onCopied?: () => void;
}

/** Owns the xterm lifecycle: terminal creation, the PTY WebSocket, and refits. */
export function useTerminal({ wsId, tmId, stack, fontSize, focused, onCopied }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<WsConn | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  // IME composition guard: on mobile, the keyboard appearing/disappearing
  // triggers ResizeObserver → doFit → term.resize(), which can interrupt an
  // active Korean/Japanese composition. Defer fits during composition.
  const composingRef = useRef(false);
  const pendingFitRef = useRef(false);
  // Terminal setup only changes for session IDs, but TerminalPane creates this
  // callback on every render. Keep the latest callback without recreating xterm.
  const onCopiedRef = useRef(onCopied);
  onCopiedRef.current = onCopied;

  const deferIfComposing = (): boolean => {
    if (composingRef.current) {
      pendingFitRef.current = true;
      return true;
    }
    return false;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: stack,
      fontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowProposedApi: true,
      // Lets the touch-selection module force local selection on macOS,
      // where xterm gates force-selection behind Option (not Shift).
      macOptionClickForcesSelection: true,
      theme: XTERM_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    // Unicode 11 width tables for accurate CJK/Hangul cell widths; must be
    // active before any data is written.
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";
    const osc52Sub = registerTerminalClipboard(term);
    term.open(el);
    const disposeTouchSelect = registerTouchSelect(term, el, () => onCopiedRef.current?.());
    // GPU renderer with a DOM fallback when WebGL is unavailable. Keep the
    // addon to dispose it before term.dispose(): xterm's addon manager tears it
    // down in an order that throws and crashes the app on a session switch.
    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      term.loadAddon(webgl);
    } catch {
      webgl = null;
      /* WebGL unsupported — xterm keeps its DOM renderer */
    }
    termRef.current = term;
    fitRef.current = fit;

    fitFullWidth(term, fit);

    const sendResize = (): void => {
      connRef.current?.send({ type: "resize", cols: term.cols, rows: term.rows });
    };

    const doFit = (): void => {
      if (deferIfComposing()) return;
      fitFullWidth(term, fit);
      sendResize();
    };

    const textarea = term.textarea;
    const settleComposition = (): void => {
      composingRef.current = false;
      if (pendingFitRef.current) {
        pendingFitRef.current = false;
        doFit();
      }
    };
    const onCompositionStart = (): void => {
      composingRef.current = true;
    };
    // compositionend can be dropped when the textarea loses focus mid-composition
    // (focus switch to another pane, Android keyboard dismiss). Reset the guard
    // so fits are not permanently blocked.
    const onBlur = (): void => {
      if (composingRef.current) settleComposition();
    };
    if (textarea) {
      textarea.addEventListener("compositionstart", onCompositionStart);
      textarea.addEventListener("compositionend", settleComposition);
      textarea.addEventListener("blur", onBlur);
    }

    const conn = connectWs(
      wsPath(wsId, tmId),
      {
        onOpen: () => {
          setStatus("open");
          doFit();
          term.focus();
        },
        onMessage: (msg) => {
          if (isOutputMsg(msg)) term.write(msg.data);
        },
        onClose: (code) => {
          setStatus(isCleanClose(code) ? "closed" : "reconnecting");
        },
      },
      { reconnect: (code) => !isCleanClose(code) },
    );
    connRef.current = conn;

    const dataSub = term.onData((data) => {
      // Drop malformed SGR mouse reports containing NaN. xterm's touch-inertia
      // phase emits wheel events without coordinates (e.g. ESC[<65;NaN;NaNM);
      // tmux cannot parse them and prints the literal "NaNM65" on screen.
      if (MALFORMED_MOUSE_RE.test(data)) return;
      conn.send({ type: "input", data });
    });

    const disposeKeys = registerTerminalKeys(term, conn, composingRef);

    const ro = new ResizeObserver(() => {
      doFit();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      osc52Sub.dispose();
      disposeKeys();
      disposeTouchSelect();
      if (textarea) {
        textarea.removeEventListener("compositionstart", onCompositionStart);
        textarea.removeEventListener("compositionend", settleComposition);
        textarea.removeEventListener("blur", onBlur);
      }
      composingRef.current = false;
      pendingFitRef.current = false;
      conn.close();
      connRef.current = null;
      termRef.current = null;
      fitRef.current = null;
      // Dispose the WebGL renderer before the terminal to avoid the addon
      // teardown ordering bug; guard both so a disposal error never crashes.
      if (webgl) {
        try {
          webgl.dispose();
        } catch {
          /* already torn down */
        }
      }
      try {
        term.dispose();
      } catch {
        /* disposal best-effort — the element is leaving the DOM anyway */
      }
    };
  }, [wsId, tmId]);

  // Apply font/size changes without recreating the terminal (preserves
  // scrollback). A new font or size changes cell metrics, so cols/rows change
  // — refit and tell the PTY, otherwise the shell keeps the old geometry.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontFamily = stack;
    term.options.fontSize = fontSize;
    if (deferIfComposing()) return;
    if (!fitFullWidth(term, fit)) return;
    connRef.current?.send({ type: "resize", cols: term.cols, rows: term.rows });
  }, [fontSize, stack]);

  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  return { containerRef, termRef, status };
}
