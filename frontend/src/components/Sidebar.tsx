import { useT } from "../i18n";
import { SessionTree } from "./SessionTree";
import type { ToastKind } from "./SessionTree";
import { IconChevron, IconGlobe, IconLogOut, IconPlus, IconTerminal, IconX } from "./icons";
import type { Terminal, Workspace } from "../features/workspace/workspace";
import { FONT_PRESETS } from "../lib/font";
import { useMediaQuery } from "../lib/useMediaQuery";

export interface SidebarProps {
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly workspaces: readonly Workspace[];
  readonly activeTerminalId: string | null;
  readonly placedSessions: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
  readonly onToggleExpanded: (wsId: string) => void;
  readonly onSelectTerminal: (ws: Workspace, tm: Terminal) => void;
  readonly onAddWorkspace: () => void;
  readonly onAddTerminal: (ws: Workspace) => void;
  readonly onDeleteWorkspace: (ws: Workspace) => void;
  readonly onDeleteTerminal: (ws: Workspace, tm: Terminal) => void;
  readonly onRenameWorkspace: (ws: Workspace, name: string) => Promise<void>;
  readonly onRenameTerminal: (ws: Workspace, tm: Terminal, name: string) => Promise<void>;
  readonly onLogout: () => void;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

/** Viewport width below which the sidebar becomes a drawer. Keep in sync with the CSS @media queries. */
export const MOBILE_QUERY = "(max-width: 768px)";

/** 3-section sidebar (nav / tree / footer) with edge toggle; drawer on mobile. */
export function Sidebar({
  collapsed,
  onToggleCollapse,
  workspaces,
  activeTerminalId,
  placedSessions,
  expanded,
  onToggleExpanded,
  onSelectTerminal,
  onAddWorkspace,
  onAddTerminal,
  onDeleteWorkspace,
  onDeleteTerminal,
  onRenameWorkspace,
  onRenameTerminal,
  onLogout,
  notify,
}: SidebarProps) {
  const { t, lang, setLang, font, setFont } = useT();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  return (
    <>
      {isMobile && !collapsed && <div className="th-backdrop" onClick={onToggleCollapse} />}
      <aside className={`th-sidebar${collapsed ? " th-sidebar--collapsed" : ""}`}>
        <div className="th-sidebar-inner">
          <div className="th-sidebar-nav">
            <span className="th-sidebar-logo">
              <span className="th-sidebar-logo-dot" />
              {t("sidebar.nav.brand")}
            </span>
            <div className="th-sidebar-nav-actions">
              <button
                type="button"
                className="th-btn-icon"
                title={t("sidebar.addWorkspace")}
                onClick={onAddWorkspace}
              >
                <IconPlus size={15} />
              </button>
              {isMobile && (
                <button
                  type="button"
                  className="th-btn-icon"
                  title={t("sidebar.collapse")}
                  onClick={onToggleCollapse}
                >
                  <IconX size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="th-sidebar-body">
            <div className="th-sidebar-section-label">{t("sidebar.title")}</div>
            <button type="button" className="th-btn-add" onClick={onAddWorkspace}>
              <IconPlus size={14} />
              {t("sidebar.addWorkspace")}
            </button>
            {workspaces.length === 0 ? (
              <div className="th-sidebar-empty">
                <span className="th-sidebar-empty-title">{t("sidebar.empty")}</span>
                <span className="th-sidebar-empty-hint">{t("sidebar.emptyHint")}</span>
              </div>
            ) : (
              <SessionTree
                workspaces={workspaces}
                activeTerminalId={activeTerminalId}
                placedSessions={placedSessions}
                expanded={expanded}
                onToggle={onToggleExpanded}
                onSelect={onSelectTerminal}
                onAddTerminal={onAddTerminal}
                onDeleteWorkspace={onDeleteWorkspace}
                onDeleteTerminal={onDeleteTerminal}
                onRenameWorkspace={onRenameWorkspace}
                onRenameTerminal={onRenameTerminal}
                notify={notify}
              />
            )}
          </div>

          <div className="th-sidebar-footer">
            <label className="th-sidebar-lang">
              <IconGlobe size={13} />
              <select
                value={lang}
                aria-label={t("sidebar.language")}
                onChange={(ev) => setLang(ev.target.value === "ko" ? "ko" : "en")}
              >
                <option value="en">EN</option>
                <option value="ko">KO</option>
              </select>
            </label>
            <label className="th-sidebar-lang">
              <IconTerminal size={13} />
              <select
                value={font}
                aria-label={t("sidebar.font")}
                onChange={(ev) => {
                  const preset = FONT_PRESETS.find((p) => p.id === ev.target.value);
                  if (preset) setFont(preset.id);
                }}
              >
                {FONT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(p.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <div className="th-sidebar-footer-spacer" />
            <button
              type="button"
              className="th-btn-icon"
              title={t("sidebar.logout")}
              onClick={onLogout}
            >
              <IconLogOut size={15} />
            </button>
          </div>
        </div>

        <button
          type="button"
          className="th-sidebar-toggle"
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          onClick={onToggleCollapse}
        >
          <IconChevron size={13} />
        </button>
      </aside>
    </>
  );
}
