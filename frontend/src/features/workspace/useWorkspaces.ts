import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ToastKind } from "../../components/SessionTree";
import type { Translate } from "../../i18n";
import type { SessionRef } from "../split/SplitView";
import type { LayoutApi } from "../split/useLayout";
import { createTerminal, deleteTerminal, renameTerminal } from "../terminal/terminal";
import { deleteWorkspace, listWorkspaces, renameWorkspace } from "./workspace";
import type { Terminal, Workspace } from "./workspace";
import type { ConfirmOptions } from "../../components/ConfirmDialog";

type Notify = (msg: string, kind?: ToastKind) => void;

export interface UseWorkspacesOptions {
  readonly notify: Notify;
  readonly t: Translate;
  readonly layout: LayoutApi;
  readonly confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

export interface UseWorkspacesResult {
  readonly workspaces: readonly Workspace[];
  readonly setWorkspaces: Dispatch<SetStateAction<readonly Workspace[]>>;
  readonly expanded: ReadonlySet<string>;
  readonly setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>;
  readonly sessions: ReadonlyMap<string, SessionRef>;
  readonly load: () => Promise<void>;
  readonly toggleExpanded: (wsId: string) => void;
  readonly handleAddTerminal: (ws: Workspace) => Promise<void>;
  readonly handleDeleteWorkspace: (ws: Workspace) => Promise<void>;
  readonly handleDeleteTerminal: (ws: Workspace, tm: Terminal) => Promise<void>;
  readonly handleRenameWorkspace: (ws: Workspace, name: string) => Promise<void>;
  readonly handleRenameTerminal: (ws: Workspace, tm: Terminal, name: string) => Promise<void>;
}

/**
 * Owns the workspace tree's in-memory state and CRUD handlers: list loading,
 * expand/collapse tracking, and terminal/workspace create/delete/rename
 * mutations (each keeping the layout in sync via `layout`).
 */
export function useWorkspaces({ notify, t, layout, confirm }: UseWorkspacesOptions): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<readonly Workspace[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async (): Promise<void> => {
    try {
      setWorkspaces(await listWorkspaces());
    } catch {
      /* transient failure — tree stays empty until next mutation */
    }
  }, []);

  const sessions = useMemo(() => {
    const map = new Map<string, SessionRef>();
    for (const ws of workspaces) {
      for (const tm of ws.terminals) {
        map.set(tm.id, { wsId: ws.id, tmId: tm.id, name: tm.name, path: ws.path });
      }
    }
    return map;
  }, [workspaces]);

  const toggleExpanded = (wsId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  };

  const handleAddTerminal = async (ws: Workspace): Promise<void> => {
    try {
      const tm = await createTerminal(ws.id, "");
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === ws.id ? { ...w, terminals: [...w.terminals, tm] } : w)),
      );
      setExpanded((prev) => new Set(prev).add(ws.id));
      layout.assignSession(layout.focusedPaneId, tm.id);
      notify(t("toast.terminalAdded"), "success");
    } catch {
      notify(t("toast.error"), "error");
    }
  };

  const handleDeleteWorkspace = async (ws: Workspace): Promise<void> => {
    const ok = await confirm({
      title: t("sidebar.ws.delete"),
      message: t("sidebar.confirmDeleteWs", { name: ws.name }),
      confirmLabel: t("sidebar.ws.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteWorkspace(ws.id);
      for (const tm of ws.terminals) layout.unplaceSession(tm.id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
      notify(t("toast.workspaceDeleted"), "success");
    } catch {
      notify(t("toast.error"), "error");
    }
  };

  const handleDeleteTerminal = async (ws: Workspace, tm: Terminal): Promise<void> => {
    const ok = await confirm({
      title: t("sidebar.tm.delete"),
      message: t("sidebar.confirmDeleteTm", { name: tm.name }),
      confirmLabel: t("sidebar.tm.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTerminal(ws.id, tm.id);
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === ws.id ? { ...w, terminals: w.terminals.filter((x) => x.id !== tm.id) } : w,
        ),
      );
      layout.unplaceSession(tm.id);
      notify(t("toast.terminalDeleted"), "success");
    } catch {
      notify(t("toast.error"), "error");
    }
  };

  const handleRenameWorkspace = async (ws: Workspace, name: string): Promise<void> => {
    const updated = await renameWorkspace(ws.id, name);
    setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    notify(t("toast.workspaceRenamed"), "success");
  };

  const handleRenameTerminal = async (ws: Workspace, tm: Terminal, name: string): Promise<void> => {
    const updated = await renameTerminal(ws.id, tm.id, name);
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === ws.id
          ? { ...w, terminals: w.terminals.map((x) => (x.id === updated.id ? updated : x)) }
          : w,
      ),
    );
    notify(t("toast.terminalRenamed"), "success");
  };

  return {
    workspaces,
    setWorkspaces,
    expanded,
    setExpanded,
    sessions,
    load,
    toggleExpanded,
    handleAddTerminal,
    handleDeleteWorkspace,
    handleDeleteTerminal,
    handleRenameWorkspace,
    handleRenameTerminal,
  };
}
