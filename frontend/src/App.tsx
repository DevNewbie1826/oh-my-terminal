import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nContext, detectLang, persistLang, translate } from "./i18n";
import type { I18nValue, Lang } from "./i18n";
import { detectFont, detectFontSize, persistFont, persistFontSize } from "./lib/font";
import type { FontId } from "./lib/font";
import { useMediaQuery } from "./lib/useMediaQuery";
import { checkAuth, logout } from "./features/auth/auth";
import { LoginPage } from "./features/auth/LoginPage";
import { MOBILE_QUERY, Sidebar } from "./components/Sidebar";
import type { ToastKind } from "./components/SessionTree";
import { WorkspaceWizard } from "./features/workspace/WorkspaceWizard";
import { TerminalPane } from "./features/split/TerminalPane";
import { SplitView } from "./features/split/SplitView";
import type { SplitActions } from "./features/split/SplitView";
import { useLayout } from "./features/split/useLayout";
import { findLeaf } from "./features/split/paneTree";
import { createTerminal } from "./features/terminal/terminal";
import type { Terminal, Workspace } from "./features/workspace/workspace";
import { useWorkspaces } from "./features/workspace/useWorkspaces";
import { IconMenu } from "./components/icons";
import { useConfirm } from "./components/ConfirmDialog";

/** Viewport width at or above which split-pane mode is offered. */
const SPLIT_QUERY = "(min-width: 1024px)";
/** How long a toast stays visible before auto-dismissing. */
const TOAST_DISMISS_MS = 2600;

interface Toast {
  readonly id: number;
  readonly msg: string;
  readonly kind: ToastKind;
}

export function App() {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persistLang(next);
  }, []);
  const [font, setFontState] = useState<FontId>(detectFont);
  const setFont = useCallback((next: FontId) => {
    setFontState(next);
    persistFont(next);
  }, []);
  const [fontSize, setFontSizeState] = useState(detectFontSize);
  const setFontSize = useCallback((next: number) => {
    setFontSizeState(next);
    persistFontSize(next);
  }, []);
  const t = useCallback(
    (key: string, vars?: Readonly<Record<string, string | number>>) => translate(lang, key, vars),
    [lang],
  );
  const i18n = useMemo<I18nValue>(
    () => ({ lang, setLang, font, setFont, fontSize, setFontSize, t }),
    [lang, setLang, font, setFont, fontSize, setFontSize, t],
  );

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const splitEnabled = useMediaQuery(SPLIT_QUERY);

  const layout = useLayout(authed === true);

  const toastId = useRef(0);
  const notify = useCallback((msg: string, kind: ToastKind = "info") => {
    setToast({ id: ++toastId.current, msg, kind });
  }, []);
  const { confirm, dialog: confirmDialog } = useConfirm(t);
  const {
    workspaces, setWorkspaces, expanded, setExpanded, sessions,
    load, toggleExpanded, handleAddTerminal, handleDeleteWorkspace,
    handleDeleteTerminal, handleRenameWorkspace, handleRenameTerminal,
  } = useWorkspaces({ notify, t, layout, confirm });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    void checkAuth().then((ok) => {
      setAuthed(ok);
      if (ok) void load();
    });
  }, [load]);

  const handleLogin = (): void => {
    setAuthed(true);
    void load();
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
    } finally {
      setAuthed(false);
      setWorkspaces([]);
      setExpanded(new Set());
    }
  };

  // The session shown in the focused pane (drives single mode + sidebar highlight).
  const focusedLeaf = findLeaf(layout.root, layout.focusedPaneId);
  const focusedSessionId =
    focusedLeaf && focusedLeaf.kind === "leaf" ? focusedLeaf.sessionId : null;
  const activeSession = focusedSessionId !== null ? sessions.get(focusedSessionId) : undefined;

  const selectTerminal = (ws: Workspace, tm: Terminal): void => {
    setExpanded((prev) => new Set(prev).add(ws.id));
    if (window.matchMedia(MOBILE_QUERY).matches) setSidebarCollapsed(true);
    // If the session is already placed, focus its pane; otherwise place it in
    // the focused pane.
    if (!layout.focusSession(tm.id)) {
      layout.assignSession(layout.focusedPaneId, tm.id);
    }
  };

  const createTerminalInPane = useCallback(
    (paneId: string, wsId: string) => {
      void createTerminal(wsId, "")
        .then((tm) => {
          setWorkspaces((prev) =>
            prev.map((w) => (w.id === wsId ? { ...w, terminals: [...w.terminals, tm] } : w)),
          );
          layout.assignSession(paneId, tm.id);
          notify(t("toast.terminalAdded"), "success");
        })
        .catch(() => notify(t("toast.error"), "error"));
    },
    [layout, notify, t],
  );

  const splitActions: SplitActions = {
    onFocusPane: layout.focusPane,
    onAssign: layout.assignSession,
    onCreateTerminal: createTerminalInPane,
    onSplit: layout.split,
    onClosePane: layout.closePane,
    onRatioChange: layout.changeRatio,
    onOpenSidebar: () => setSidebarCollapsed(false),
    notify,
  };

  return (
    <I18nContext.Provider value={i18n}>
      {authed === null ? null : !authed ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <div className="th-app">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            workspaces={workspaces}
            activeTerminalId={focusedSessionId}
            placedSessions={layout.placed}
            expanded={expanded}
            onToggleExpanded={toggleExpanded}
            onSelectTerminal={selectTerminal}
            onAddWorkspace={() => setWizardOpen(true)}
            onAddTerminal={(ws) => void handleAddTerminal(ws)}
            onDeleteWorkspace={(ws) => void handleDeleteWorkspace(ws)}
            onDeleteTerminal={(ws, tm) => void handleDeleteTerminal(ws, tm)}
            onRenameWorkspace={handleRenameWorkspace}
            onRenameTerminal={handleRenameTerminal}
            onLogout={() => void handleLogout()}
            notify={notify}
          />
          <main className="th-main">
            {splitEnabled ? (
              <SplitView
                node={layout.root}
                workspaces={workspaces}
                placed={layout.placed}
                sessions={sessions}
                focusedPaneId={layout.focusedPaneId}
                splitEnabled={splitEnabled}
                actions={splitActions}
              />
            ) : activeSession ? (
              <TerminalPane
                key={activeSession.tmId}
                wsId={activeSession.wsId}
                tmId={activeSession.tmId}
                name={activeSession.name}
                path={activeSession.path}
                focused
                splitEnabled={false}
                onFocus={() => undefined}
                onSplit={() => undefined}
                onClose={() => undefined}
                onOpenSidebar={() => setSidebarCollapsed(false)}
                notify={notify}
              />
            ) : (
              <div className="th-empty">
                <button
                  type="button"
                  className="th-btn-icon th-mobile-menu"
                  title={t("sidebar.expand")}
                  aria-label={t("sidebar.expand")}
                  onClick={() => setSidebarCollapsed(false)}
                >
                  <IconMenu size={16} />
                </button>
                <div className="th-empty-glyph">$ tmux new-session</div>
                <div className="th-empty-title">{t("empty.title")}</div>
                <div className="th-empty-hint">{t("empty.hint")}</div>
                <button
                  type="button"
                  className="th-btn th-btn--primary"
                  onClick={() => setWizardOpen(true)}
                >
                  {t("empty.cta")}
                </button>
              </div>
            )}
          </main>
          <WorkspaceWizard
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            onCreated={(ws) => {
              setWorkspaces((prev) => [...prev, ws]);
              setExpanded((prev) => new Set(prev).add(ws.id));
              notify(t("toast.workspaceAdded"), "success");
            }}
          />
        </div>
      )}
      {toast && (
        <div key={toast.id} className={`th-toast th-toast--${toast.kind}`} role="status">
          {toast.msg}
        </div>
      )}
      {confirmDialog}
    </I18nContext.Provider>
  );
}
