import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../../i18n";
import { IconX } from "../../components/icons";
import { TerminalPane } from "./TerminalPane";
import { SessionPicker } from "./SessionPicker";
import type { PaneNode, SplitDir } from "./paneTree";
import type { ToastKind } from "../../components/SessionTree";
import type { Workspace } from "../workspace/workspace";

export interface SessionRef {
  readonly wsId: string;
  readonly tmId: string;
  readonly name: string;
  readonly path: string;
}

export interface SplitActions {
  readonly onFocusPane: (paneId: string) => void;
  readonly onAssign: (paneId: string, tmId: string) => void;
  readonly onCreateTerminal: (paneId: string, wsId: string) => void;
  readonly onSplit: (paneId: string, dir: SplitDir) => void;
  readonly onClosePane: (paneId: string) => void;
  readonly onRatioChange: (splitId: string, ratio: number) => void;
  readonly onOpenSidebar: () => void;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

export interface SplitViewProps {
  readonly node: PaneNode;
  readonly workspaces: readonly Workspace[];
  readonly placed: ReadonlySet<string>;
  readonly sessions: ReadonlyMap<string, SessionRef>;
  readonly focusedPaneId: string;
  readonly splitEnabled: boolean;
  readonly actions: SplitActions;
}

type LeafData = Extract<PaneNode, { readonly kind: "leaf" }>;
type SplitData = Extract<PaneNode, { readonly kind: "split" }>;

function LeafView({ node, ...rest }: SplitViewProps & { readonly node: LeafData }) {
  const { workspaces, placed, sessions, focusedPaneId, splitEnabled, actions } = rest;
  const { t } = useT();
  const session = node.sessionId !== null ? sessions.get(node.sessionId) : undefined;
  return (
    <div className="th-pane-wrap">
      {session ? (
        <TerminalPane
          key={session.tmId}
          wsId={session.wsId}
          tmId={session.tmId}
          name={session.name}
          path={session.path}
          focused={focusedPaneId === node.id}
          splitEnabled={splitEnabled}
          onFocus={() => actions.onFocusPane(node.id)}
          onSplit={(dir) => actions.onSplit(node.id, dir)}
          onClose={() => actions.onClosePane(node.id)}
          onOpenSidebar={actions.onOpenSidebar}
          notify={actions.notify}
        />
      ) : (
        <>
          {splitEnabled && (
            <button
              type="button"
              className="th-btn-icon th-btn-icon--danger th-pane-close"
              title={t("split.close")}
              aria-label={t("split.close")}
              onClick={() => actions.onClosePane(node.id)}
            >
              <IconX size={14} />
            </button>
          )}
          <SessionPicker
            workspaces={workspaces}
            placed={placed}
            onAssign={(tmId) => actions.onAssign(node.id, tmId)}
            onCreateTerminal={(wsId) => actions.onCreateTerminal(node.id, wsId)}
          />
        </>
      )}
    </div>
  );
}

function SplitNodeView(props: SplitViewProps & { readonly node: SplitData }) {
  const { node, actions } = props;
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    ev.preventDefault();
    dragging.current = true;
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio =
      node.dir === "h"
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
    actions.onRatioChange(node.id, ratio);
  };

  const endDrag = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    dragging.current = false;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
  };

  return (
    <div ref={containerRef} className={`th-split th-split--${node.dir}`}>
      <div className="th-split-child" style={{ flexGrow: node.ratio }}>
        <SplitView {...props} node={node.first} />
      </div>
      <div
        className="th-divider"
        role="separator"
        aria-orientation={node.dir === "h" ? "vertical" : "horizontal"}
        aria-label={t("split.resize")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="th-split-child" style={{ flexGrow: 1 - node.ratio }}>
        <SplitView {...props} node={node.second} />
      </div>
    </div>
  );
}

export function SplitView(props: SplitViewProps) {
  const { node } = props;
  if (node.kind === "split") {
    return <SplitNodeView {...props} node={node} />;
  }
  return <LeafView {...props} node={node} />;
}
