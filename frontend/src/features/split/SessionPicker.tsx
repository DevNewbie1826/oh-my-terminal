import { useState } from "react";
import { useT } from "../../i18n";
import { IconFolder, IconPlus, IconTerminal } from "../../components/icons";
import type { Workspace } from "../workspace/workspace";

export interface SessionPickerProps {
  readonly workspaces: readonly Workspace[];
  /** Session ids already placed in some pane (excluded from the list). */
  readonly placed: ReadonlySet<string>;
  readonly onAssign: (tmId: string) => void;
  readonly onCreateTerminal: (wsId: string) => void;
}

export function SessionPicker({ workspaces, placed, onAssign, onCreateTerminal }: SessionPickerProps) {
  const { t } = useT();
  const [newWsId, setNewWsId] = useState<string>("");

  const available = workspaces
    .map((ws) => ({ ws, terminals: ws.terminals.filter((tm) => !placed.has(tm.id)) }))
    .filter((g) => g.terminals.length > 0);

  const effectiveNewWsId = newWsId.length > 0 ? newWsId : (workspaces[0]?.id ?? "");

  return (
    <div className="th-picker-pane">
      <div className="th-picker-pane-title">{t("split.pickTitle")}</div>

      {available.length === 0 ? (
        <div className="th-picker-pane-empty">{t("split.pickEmpty")}</div>
      ) : (
        <div className="th-picker-pane-list">
          {available.map(({ ws, terminals }) => (
            <div key={ws.id} className="th-picker-pane-group">
              <div className="th-picker-pane-group-label">
                <IconFolder size={12} />
                <span>{ws.name}</span>
              </div>
              {terminals.map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  className="th-picker-pane-item"
                  onClick={() => onAssign(tm.id)}
                >
                  <IconTerminal size={13} />
                  <span>{tm.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="th-picker-pane-create">
        <select
          value={effectiveNewWsId}
          aria-label={t("split.pickWorkspace")}
          onChange={(ev) => setNewWsId(ev.target.value)}
          disabled={workspaces.length === 0}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="th-btn th-btn--primary"
          onClick={() => {
            if (effectiveNewWsId.length > 0) onCreateTerminal(effectiveNewWsId);
          }}
          disabled={workspaces.length === 0}
        >
          <IconPlus size={13} />
          {t("split.pickNew")}
        </button>
      </div>
    </div>
  );
}
