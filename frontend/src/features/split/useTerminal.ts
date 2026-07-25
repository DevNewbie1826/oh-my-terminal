import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { connectWs } from "../../lib/ws";
import type { WsConn } from "../../lib/ws";
import { wsPath } from "../terminal/terminal";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

/** WebSocket codes for a clean server-side close (PTY ended), not a drop. */
const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;

function isCleanClose(code: number): boolean {
  return code === CLOSE_NORMAL || code === CLOSE_GOING_AWAY;
}

/** SGR mouse report carrying NaN coordinates — xterm's touch-inertia bug. */
const MALFORMED_MOUSE_RE = /\x1b\[<\d+;NaN/;

/** Shape of xterm's private `_core` render internals — narrowed at runtime. */
interface XtermCoreInternals {
  _renderService: {
    dimensions: {
      css: { cell: { width: number; height: number } };
    };
    clear: () => void;
  };
}

/**
 * Reach xterm's private `_core._renderService`, narrowing the shape at
 * runtime so an xterm internals change degrades to a plain FitAddon fit
 * instead of throwing. Returns undefined when the shape is absent.
 */
function xtermCore(t: Terminal): XtermCoreInternals | undefined {
  const core: unknown = (t as unknown as { readonly _core?: unknown })._core;
  if (
    typeof core === "object" &&
    core !== null &&
    "_renderService" in core &&
    typeof core._renderService === "object" &&
    core._renderService !== null &&
    "dimensions" in core._renderService &&
    typeof core._renderService.dimensions === "object" &&
    core._renderService.dimensions !== null &&
    "clear" in core._renderService &&
    typeof core._renderService.clear === "function"
  ) {
    return core as XtermCoreInternals;
  }
  return undefined;
}

const MIN_COLS = 2;
const MIN_ROWS = 1;

/**
 * Fit the terminal to fill its pane width.
 *
 * xterm's FitAddon subtracts a reserved scrollbar width from the available
 * width, but on overlay-scrollbar platforms (iOS, Android, macOS) the
 * scrollbar is a floating overlay that takes no layout space — so the
 * subtraction under-fits the grid by ~2 cols. We bypass that phantom
 * reservation by computing cols/rows directly from the container and the
 * render service's cell dimensions, falling back to a plain fit when xterm's
 * internals are unavailable.
 */
function fitFullWidth(t: Terminal, f: FitAddon): boolean {
  const fallback = (): boolean => {
    try {
      f.fit();
      return true;
    } catch {
      return false;
    }
  };
  const core = xtermCore(t);
  const parent = t.element?.parentElement;
  if (!core || !parent) return fallback();
  const dims = core._renderService.dimensions;
  if (dims.css.cell.width === 0 || dims.css.cell.height === 0) return fallback();
  const parentStyle = window.getComputedStyle(parent);
  const elStyle = window.getComputedStyle(t.element);
  const padH = parseFloat(elStyle.paddingLeft) + parseFloat(elStyle.paddingRight);
  const padV = parseFloat(elStyle.paddingTop) + parseFloat(elStyle.paddingBottom);
  const availW = parseFloat(parentStyle.width) - padH;
  const availH = parseFloat(parentStyle.height) - padV;
  const cols = Math.max(MIN_COLS, Math.floor(availW / dims.css.cell.width));
  const rows = Math.max(MIN_ROWS, Math.floor(availH / dims.css.cell.height));
  if (t.cols !== cols || t.rows !== rows) {
    core._renderService.clear();
    t.resize(cols, rows);
  }
  return true;
}

/** Terminal ANSI palette — intentionally separate from UI tokens. bg/fg/cursor
 * match --th-bg/--th-text; the 16 ANSI colors are a fixed terminal palette. */
const XTERM_THEME = {
  background: "#0a0a0a",
  foreground: "#ededed",
  cursor: "#ededed",
  cursorAccent: "#0a0a0a",
  selectionBackground: "rgba(255, 255, 255, 0.22)",
  black: "#0a0a0a",
  red: "#e5484d",
  green: "#30a46c",
  yellow: "#f5a623",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#ededed",
  brightBlack: "#5c5c5c",
  brightRed: "#ff6b6e",
  brightGreen: "#4cc38a",
  brightYellow: "#ffd166",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};

function isOutputMsg(m: unknown): m is { readonly type: "output"; readonly data: string } {
  return (
    typeof m === "object" &&
    m !== null &&
    "type" in m &&
    m.type === "output" &&
    "data" in m &&
    typeof m.data === "string"
  );
}

export interface UseTerminalOptions {
  readonly wsId: string;
  readonly tmId: string;
  readonly stack: string;
  readonly fontSize: number;
  readonly focused: boolean;
}

/** Owns the xterm lifecycle: terminal creation, the PTY WebSocket, and refits. */
export function useTerminal({ wsId, tmId, stack, fontSize, focused }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<WsConn | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const webglRef = useRef<WebglAddon | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  // IME composition guard: on mobile, the keyboard appearing/disappearing
  // triggers ResizeObserver → doFit → term.resize(), which can interrupt an
  // active Korean/Japanese composition. Defer fits during composition.
  const composingRef = useRef(false);
  const pendingFitRef = useRef(false);

  /** Returns true (and marks a pending fit) when an IME composition is active. */
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
    const osc52Sub = term.parser.registerOscHandler(52, async (data) => {
      try {
        const separator = data.indexOf(";");
        if (separator < 0) return true;
        const payload = data.slice(separator + 1);
        if (payload === "?") return true;
        // atob returns Latin-1, so decode bytes as UTF-8 to preserve CJK text.
        const encoded = atob(payload);
        const bytes = Uint8Array.from(encoded, (char) => char.charCodeAt(0));
        const text = new TextDecoder().decode(bytes);
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          // The Clipboard API is unavailable when a LAN page is served over HTTP.
          const textarea = document.createElement("textarea");
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          textarea.value = text;
          document.body.append(textarea);
          try {
            textarea.focus();
            textarea.select();
            document.execCommand("copy");
          } finally {
            textarea.remove();
          }
        }
      } catch (error) {
        // Clipboard writes are best-effort; a failed write must never reject
        // the parser callback or the terminal breaks on every tmux copy.
        console.debug("osc52 clipboard write failed", error);
      }
      return true;
    });
    term.open(el);
    // GPU renderer with a DOM fallback when WebGL is unavailable. The addon
    // instance is kept so it can be disposed explicitly on cleanup — xterm's
    // addon manager otherwise disposes it during term.dispose() in an order
    // that throws and would crash the app on session switch.
    try {
      const webgl = new WebglAddon();
      webglRef.current = webgl;
      term.loadAddon(webgl);
    } catch {
      webglRef.current = null;
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

    // Track IME composition on xterm's hidden textarea.
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

    term.attachCustomKeyEventHandler((event) => {
      // xterm's default handler drops the Shift modifier for Enter (sends CR
      // for both), so send the kitty sequence explicitly; tmux 3.4+ forwards
      // CSI u and TUIs interpret it as newline-insert.
      if (
        event.type === "keydown" &&
        event.key === "Enter" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.isComposing &&
        !composingRef.current
      ) {
        // This beta's _keyDown early-returns on `false` without cancelling the
        // DOM event, so preventDefault ourselves or keypress still emits CR.
        event.preventDefault();
        conn.send({ type: "input", data: "\x1b[13;2u" });
        return false;
      }
      return true;
    });

    const ro = new ResizeObserver(() => {
      doFit();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      osc52Sub.dispose();
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
      const webgl = webglRef.current;
      webglRef.current = null;
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
    // Defer during IME composition (see doFit guard above).
    if (deferIfComposing()) return;
    if (!fitFullWidth(term, fit)) return;
    connRef.current?.send({ type: "resize", cols: term.cols, rows: term.rows });
  }, [fontSize, stack]);

  // Keep the xterm focused when this pane gains app focus.
  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  return { containerRef, termRef, status };
}
