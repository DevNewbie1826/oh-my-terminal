import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useT } from "../../i18n";
import { connectWs } from "../../lib/ws";
import type { WsConn } from "../../lib/ws";
import { FONT_PRESETS, SYSTEM_FONT_STACK } from "../../lib/font";
import { getAttachCmd, wsPath } from "../terminal/terminal";
import { FileBrowser } from "../terminal/FileBrowser";
import {
  IconCopy,
  IconFolder,
  IconMenu,
  IconSplitH,
  IconSplitV,
  IconTerminal,
  IconX,
} from "../../components/icons";
import type { ToastKind } from "../../components/SessionTree";
import type { SplitDir } from "./paneTree";

export interface TerminalPaneProps {
  readonly wsId: string;
  readonly tmId: string;
  readonly name: string;
  readonly path: string;
  readonly focused: boolean;
  /** When false, split/close controls are hidden (single-terminal mode). */
  readonly splitEnabled: boolean;
  readonly onFocus: () => void;
  readonly onSplit: (dir: SplitDir) => void;
  readonly onClose: () => void;
  readonly onOpenSidebar: () => void;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

const FILES_DEFAULT_W = 320;
const FILES_MIN_W = 220;
const RESIZE_STEP = 24;
const FILES_WIDTH_KEY = "th-files-w";
/** The 5px resize handle straddles the panel edge; this many px sit outside it. */
const HANDLE_OUTSET = 3;

/** WebSocket codes for a clean server-side close (PTY ended), not a drop. */
const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;

function isCleanClose(code: number): boolean {
  return code === CLOSE_NORMAL || code === CLOSE_GOING_AWAY;
}

function clampFilesWidth(w: number): number {
  return Math.max(FILES_MIN_W, w);
}

function storedFilesWidth(): number {
  const raw = window.localStorage.getItem(FILES_WIDTH_KEY);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? clampFilesWidth(parsed) : FILES_DEFAULT_W;
}

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

/** A single xterm.js pane bridged to the backend PTY over WebSocket. */
export function TerminalPane({
  wsId,
  tmId,
  name,
  path,
  focused,
  splitEnabled,
  onFocus,
  onSplit,
  onClose,
  onOpenSidebar,
  notify,
}: TerminalPaneProps) {
  const { t, font } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<WsConn | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [showFiles, setShowFiles] = useState(false);
  const [filesWidth, setFilesWidth] = useState(storedFilesWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ readonly startX: number; readonly startWidth: number } | null>(null);
  const stack = FONT_PRESETS.find((p) => p.id === font)?.stack ?? SYSTEM_FONT_STACK;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: stack,
      fontSize: 13,
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
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = (): void => {
      try {
        fit.fit();
      } catch {
        /* container not measurable yet */
      }
    };
    safeFit();

    const sendResize = (): void => {
      connRef.current?.send({ type: "resize", cols: term.cols, rows: term.rows });
    };

    const conn = connectWs(
      wsPath(wsId, tmId),
      {
        onOpen: () => {
          setStatus("open");
          safeFit();
          sendResize();
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
      conn.send({ type: "input", data });
    });

    const ro = new ResizeObserver(() => {
      safeFit();
      sendResize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      conn.close();
      connRef.current = null;
      termRef.current = null;
      fitRef.current = null;
      term.dispose();
    };
  }, [wsId, tmId]);

  // Apply font changes without recreating the terminal (preserves scrollback).
  // A new font changes cell metrics, so cols/rows change — refit and tell the
  // PTY, otherwise the shell keeps the old geometry.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontFamily = stack;
    try {
      fit.fit();
    } catch {
      /* container not measurable yet */
      return;
    }
    connRef.current?.send({ type: "resize", cols: term.cols, rows: term.rows });
  }, [font, stack]);

  // Keep the xterm focused when this pane gains app focus.
  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  const onResizePointerDown = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    ev.preventDefault();
    dragRef.current = { startX: ev.clientX, startWidth: filesWidth };
    setResizing(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onResizePointerMove = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    // Panel is right-anchored: dragging left grows it.
    const next = clampFilesWidth(drag.startWidth + (drag.startX - ev.clientX));
    setFilesWidth(next);
  };

  const endResize = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setResizing(false);
    // Recompute from the drag origin so the persisted width matches the final
    // pointer position exactly (the filesWidth state lags the last move).
    const final = clampFilesWidth(drag.startWidth + (drag.startX - ev.clientX));
    setFilesWidth(final);
    window.localStorage.setItem(FILES_WIDTH_KEY, String(final));
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const resetFilesWidth = (): void => {
    setFilesWidth(FILES_DEFAULT_W);
    window.localStorage.setItem(FILES_WIDTH_KEY, String(FILES_DEFAULT_W));
  };

  const onResizeKeyDown = (ev: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Panel is right-anchored: ArrowLeft grows, ArrowRight shrinks.
    let delta = 0;
    if (ev.key === "ArrowLeft") delta = RESIZE_STEP;
    else if (ev.key === "ArrowRight") delta = -RESIZE_STEP;
    else if (ev.key === "Home") {
      ev.preventDefault();
      resetFilesWidth();
      return;
    } else {
      return;
    }
    ev.preventDefault();
    const next = clampFilesWidth(filesWidth + delta);
    setFilesWidth(next);
    window.localStorage.setItem(FILES_WIDTH_KEY, String(next));
  };

  const copyAttach = async (): Promise<void> => {
    try {
      const { command } = await getAttachCmd(wsId, tmId);
      await navigator.clipboard.writeText(command);
      notify(t("toast.copied"), "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : t("toast.copyFailed"), "error");
    }
  };

  const statusLabel: Readonly<Record<ConnStatus, string>> = {
    connecting: t("terminal.connecting"),
    open: "",
    reconnecting: t("terminal.reconnecting"),
    closed: t("terminal.disconnected"),
  };

  return (
    <div
      className={`th-stage th-pane${focused ? " th-pane--focused" : ""}`}
      onPointerDown={onFocus}
    >
      <header className="th-termhead">
        <button
          type="button"
          className="th-btn-icon th-mobile-menu"
          title={t("sidebar.expand")}
          onClick={onOpenSidebar}
        >
          <IconMenu size={16} />
        </button>
        <IconTerminal size={14} />
        <span className="th-termhead-name">{name}</span>
        <span className="th-termhead-path" title={path}>
          {path}
        </span>
        <div className="th-termhead-actions">
          {status !== "open" && (
            <span className={`th-status th-status--${status}`}>{statusLabel[status]}</span>
          )}
          {splitEnabled && (
            <>
              <button
                type="button"
                className="th-btn-icon"
                title={t("split.h")}
                onClick={() => onSplit("h")}
              >
                <IconSplitH size={14} />
              </button>
              <button
                type="button"
                className="th-btn-icon"
                title={t("split.v")}
                onClick={() => onSplit("v")}
              >
                <IconSplitV size={14} />
              </button>
              <button
                type="button"
                className="th-btn-icon th-btn-icon--danger"
                title={t("split.close")}
                onClick={onClose}
              >
                <IconX size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            className="th-btn-icon"
            title={t("terminal.attach")}
            onClick={() => void copyAttach()}
          >
            <IconCopy size={14} />
          </button>
          <button
            type="button"
            className={`th-btn-icon${showFiles ? " th-btn-icon--on" : ""}`}
            title={t("terminal.files")}
            aria-pressed={showFiles}
            onClick={() => setShowFiles((v) => !v)}
          >
            <IconFolder size={14} />
          </button>
        </div>
      </header>

      <div className={`th-stage-row${resizing ? " th-stage-row--resizing" : ""}`}>
        <div ref={containerRef} className="th-term" />
        {showFiles && (
          <>
            <div
              className="th-files-resize"
              style={{ right: filesWidth - HANDLE_OUTSET }}
              role="separator"
              aria-orientation="vertical"
              aria-label={t("files.resize")}
              tabIndex={0}
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onKeyDown={onResizeKeyDown}
              onDoubleClick={resetFilesWidth}
            />
            <FileBrowser
              path={path}
              wsId={wsId}
              tmId={tmId}
              width={filesWidth}
              onClose={() => setShowFiles(false)}
              notify={notify}
            />
          </>
        )}
      </div>
    </div>
  );
}
