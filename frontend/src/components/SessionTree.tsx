import { useRef, useState } from "react";
import { useT } from "../i18n";
import {
  IconChevron,
  IconCopy,
  IconEdit,
  IconFolder,
  IconPlus,
  IconTerminal,
  IconTrash,
} from "./icons";
import { getAttachCmd } from "../features/terminal/terminal";
import type { Terminal, Workspace } from "../features/workspace/workspace";

export type ToastKind = "info" | "success" | "error";

export interface SessionTreeProps {
  readonly workspaces: readonly Workspace[];
  readonly activeTerminalId: string | null;
  readonly placedSessions: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (wsId: string) => void;
  readonly onSelect: (ws: Workspace, tm: Terminal) => void;
  readonly onAddTerminal: (ws: Workspace) => void;
  readonly onDeleteWorkspace: (ws: Workspace) => void;
  readonly onDeleteTerminal: (ws: Workspace, tm: Terminal) => void;
  readonly onRenameWorkspace: (ws: Workspace, name: string) => Promise<void>;
  readonly onRenameTerminal: (ws: Workspace, tm: Terminal, name: string) => Promise<void>;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

interface RenameTarget {
  readonly kind: "workspace" | "terminal";
  readonly wsId: string;
  readonly tmId: string;
}

/** Workspace > terminal tree with hover actions and inline rename. */
export function SessionTree({
  workspaces,
  activeTerminalId,
  placedSessions,
  expanded,
  onToggle,
  onSelect,
  onAddTerminal,
  onDeleteWorkspace,
  onDeleteTerminal,
  onRenameWorkspace,
  onRenameTerminal,
  notify,
}: SessionTreeProps) {
  const { t } = useT();
  const [rename, setRename] = useState<RenameTarget | null>(null);

  const copyAttach = async (ws: Workspace, tm: Terminal): Promise<void> => {
    try {
      const { command } = await getAttachCmd(ws.id, tm.id);
      await navigator.clipboard.writeText(command);
      notify(t("toast.copied"), "success");
    } catch {
      notify(t("toast.copyFailed"), "error");
    }
  };

  const commitRename = (target: RenameTarget, value: string): void => {
    setRename(null);
    const name = value.trim();
    if (name.length === 0) return;
    const ws = workspaces.find((w) => w.id === target.wsId);
    if (!ws) return;
    if (target.kind === "workspace") {
      if (name === ws.name) return;
      onRenameWorkspace(ws, name).catch(() => notify(t("toast.error"), "error"));
    } else {
      const tm = ws.terminals.find((x) => x.id === target.tmId);
      if (!tm || name === tm.name) return;
      onRenameTerminal(ws, tm, name).catch(() => notify(t("toast.error"), "error"));
    }
  };

  return (
    <div className="th-tree" role="tree" aria-label={t("sidebar.title")}>
      {workspaces.map((ws) => {
        const isOpen = expanded.has(ws.id);
        const renamingWs =
          rename && rename.kind === "workspace" && rename.wsId === ws.id ? rename : null;
        return (
          <div key={ws.id} role="treeitem" aria-expanded={isOpen}>
            <div
              className="th-tree-node"
              tabIndex={0}
              onClick={() => onToggle(ws.id)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onToggle(ws.id); } }}
            >
              <span className={`th-tree-chevron${isOpen ? " th-tree-chevron--open" : ""}`}>
                <IconChevron size={13} />
              </span>
              <span className="th-tree-icon">
                <IconFolder size={14} />
              </span>
              {renamingWs ? (
                <RenameInput initial={ws.name} onCommit={(v) => commitRename(renamingWs, v)} />
              ) : (
                <span className="th-tree-label" title={ws.path}>
                  {ws.name}
                </span>
              )}
              <span className="th-tree-count">{ws.terminals.length}</span>
              <span className="th-tree-actions" onClick={(ev) => ev.stopPropagation()}>
                <button
                  type="button"
                  className="th-btn-icon"
                  title={t("sidebar.ws.rename")}
                  onClick={() => setRename({ kind: "workspace", wsId: ws.id, tmId: "" })}
                >
                  <IconEdit size={12} />
                </button>
                <button
                  type="button"
                  className="th-btn-icon"
                  title={t("sidebar.ws.addTerminal")}
                  onClick={() => onAddTerminal(ws)}
                >
                  <IconPlus size={13} />
                </button>
                <button
                  type="button"
                  className="th-btn-icon th-btn-icon--danger"
                  title={t("sidebar.ws.delete")}
                  onClick={() => onDeleteWorkspace(ws)}
                >
                  <IconTrash size={12} />
                </button>
              </span>
            </div>

            <div
              className={`th-tree-children${isOpen ? "" : " th-tree-children--closed"}`}
              role="group"
            >
              {ws.terminals.map((tm) => {
                const active = tm.id === activeTerminalId;
                const renamingTm =
                  rename && rename.kind === "terminal" && rename.tmId === tm.id ? rename : null;
                return (
                  <div
                    key={tm.id}
                    className={`th-tree-node${active ? " th-tree-node--active" : ""}`}
                    role="treeitem"
                    aria-selected={active}
                    tabIndex={0}
                    onClick={() => onSelect(ws, tm)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(ws, tm); } }}
                  >
                    <span
                      className={`th-tree-placed${placedSessions.has(tm.id) ? " th-tree-placed--on" : ""}`}
                      aria-hidden="true"
                    />
                    <span className="th-tree-icon">
                      <IconTerminal size={13} />
                    </span>
                    {renamingTm ? (
                      <RenameInput initial={tm.name} onCommit={(v) => commitRename(renamingTm, v)} />
                    ) : (
                      <span className="th-tree-label">{tm.name}</span>
                    )}
                    <span className="th-tree-actions" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        type="button"
                        className="th-btn-icon"
                        title={t("sidebar.tm.copy")}
                        onClick={() => void copyAttach(ws, tm)}
                      >
                        <IconCopy size={12} />
                      </button>
                      <button
                        type="button"
                        className="th-btn-icon"
                        title={t("sidebar.tm.rename")}
                        onClick={() =>
                          setRename({ kind: "terminal", wsId: ws.id, tmId: tm.id })
                        }
                      >
                        <IconEdit size={12} />
                      </button>
                      <button
                        type="button"
                        className="th-btn-icon th-btn-icon--danger"
                        title={t("sidebar.tm.delete")}
                        onClick={() => onDeleteTerminal(ws, tm)}
                      >
                        <IconTrash size={12} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface RenameInputProps {
  readonly initial: string;
  readonly onCommit: (value: string) => void;
}

function RenameInput({ initial, onCommit }: RenameInputProps) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  const commit = (v: string): void => {
    if (done.current) return;
    done.current = true;
    onCommit(v);
  };

  return (
    <input
      className="th-tree-rename"
      autoFocus
      value={value}
      onClick={(ev) => ev.stopPropagation()}
      onChange={(ev) => setValue(ev.target.value)}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") commit(value);
        else if (ev.key === "Escape") commit("");
      }}
      onBlur={() => commit(value)}
    />
  );
}
