import { useRef, useState } from "react";
import { useT } from "../../i18n";
import { FONT_PRESETS, SYSTEM_FONT_STACK } from "../../lib/font";
import { getAttachCmd } from "../terminal/terminal";
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
import { useTerminal } from "./useTerminal";
import type { ConnStatus } from "./useTerminal";
import { useFilesResize } from "./useFilesResize";
import { MobileInputOverlay } from "./MobileInputOverlay";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { MOBILE_QUERY } from "../../components/Sidebar";
import { HANDLE_OUTSET } from "./useFilesResize";

export interface TerminalPaneProps {
  readonly wsId: string;
  readonly tmId: string;
  readonly name: string;
  readonly path: string;
  readonly focused: boolean;
  readonly splitEnabled: boolean;
  readonly onFocus: () => void;
  readonly onSplit: (dir: SplitDir) => void;
  readonly onClose: () => void;
  readonly onOpenSidebar: () => void;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

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
  const { t, font, fontSize } = useT();
  const stack = FONT_PRESETS.find((p) => p.id === font)?.stack ?? SYSTEM_FONT_STACK;
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const { containerRef, termRef, status } = useTerminal({
    wsId,
    tmId,
    stack,
    fontSize,
    focused,
    onCopied: () => notify(t("toast.copiedSelection"), "success"),
  });
  const mobileInputRef = useRef<HTMLTextAreaElement>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const {
    filesWidth,
    resizing,
    onResizePointerDown,
    onResizePointerMove,
    endResize,
    resetFilesWidth,
    onResizeKeyDown,
  } = useFilesResize();

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
      onPointerDown={() => {
        onFocus();
        // Mobile input must receive the user's direct tap to open its keyboard.
        if (!isMobile) {
          termRef.current?.focus();
        }
      }}
    >
      <header className="th-termhead">
        <button
          type="button"
          className="th-btn-icon th-mobile-menu"
          title={t("sidebar.expand")}
          aria-label={t("sidebar.expand")}
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

      <div
        className={`th-stage-row${resizing ? " th-stage-row--resizing" : ""}${isMobile && keysOpen ? " th-stage-row--keys" : ""}`}
      >
        <div ref={containerRef} className="th-term" />
        {isMobile && (
          <MobileInputOverlay
            inputRef={mobileInputRef}
            termRef={termRef}
            focused={focused}
            keysOpen={keysOpen}
            onKeysToggle={() => setKeysOpen((v) => !v)}
          />
        )}
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
