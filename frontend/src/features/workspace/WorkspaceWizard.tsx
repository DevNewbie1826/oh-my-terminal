import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import { ModalDialog } from "../../components/ModalDialog";
import { IconAlert, IconArrowUp, IconCheck, IconFolder, IconFolderOpen } from "../../components/icons";
import { createWorkspace } from "./workspace";
import type { Workspace } from "./workspace";
import { fsBrowse } from "../terminal/terminal";
import { joinPath } from "../../lib/path";
import type { FsBrowse } from "../terminal/terminal";

export interface WorkspaceWizardProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (ws: Workspace) => void;
}

const TOTAL_STEPS = 3;

/** 3-step modal: folder picker → name → confirm. */
export function WorkspaceWizard({ open, onClose, onCreated }: WorkspaceWizardProps) {
  const { t } = useT();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const picker = useFolderPicker(open);

  // Reset wizard state each time it opens.
  useEffect(() => {
    if (open) {
      setStep(1);
      setName("");
      setNameTouched(false);
      setCreating(false);
      setError("");
    }
  }, [open]);

  const create = async (): Promise<void> => {
    const path = picker.selected;
    if (creating || !path) return;
    setCreating(true);
    setError("");
    try {
      const ws = await createWorkspace(name.trim(), path);
      onCreated(ws);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wizard.createError"));
      setCreating(false);
    }
  };

  const titles: Readonly<Record<number, readonly [string, string]>> = {
    1: [t("wizard.step1Title"), t("wizard.step1Desc")],
    2: [t("wizard.step2Title"), t("wizard.step2Desc")],
    3: [t("wizard.step3Title"), t("wizard.step3Desc")],
  };
  const [title, desc] = titles[step] ?? [t("wizard.title"), ""];

  const nextFromPicker = (): void => {
    if (!picker.selected) return;
    if (name.trim().length === 0) setName(basename(picker.selected));
    setStep(2);
  };
  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="th-wizard-title" closeLabel={t("common.close")}>
      <div className="th-wizard-head">
        <div className="th-wizard-kicker">
          {t("wizard.stepOf", { n: step, total: TOTAL_STEPS })}
        </div>
        <h2 className="th-wizard-title" id="th-wizard-title">
          {title}
        </h2>
        <p className="th-wizard-desc">{desc}</p>
        <div className="th-wizard-steps" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={
                n < step
                  ? "th-wizard-step th-wizard-step--done"
                  : n === step
                    ? "th-wizard-step th-wizard-step--current"
                    : "th-wizard-step"
              }
            />
          ))}
        </div>
      </div>

      <div className="th-wizard-body">
        {error.length > 0 && (
          <div className="th-alert th-alert--error" role="alert" style={{ marginBottom: 14 }}>
            <IconAlert size={15} />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && <FolderPickerView picker={picker} onSelect={nextFromPicker} />}

        {step === 2 && (
          <div className="th-field">
            <label className="th-field-label" htmlFor="th-ws-name">
              {t("wizard.nameLabel")}
            </label>
            <input
              id="th-ws-name"
              className="th-input th-input--mono"
              autoFocus
              value={name}
              placeholder={t("wizard.namePlaceholder")}
              onChange={(ev) => { setName(ev.target.value); setNameTouched(true); }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && name.trim().length > 0) setStep(3);
              }}
            />
            {nameTouched && name.trim().length === 0 && (
              <span className="th-alert th-alert--warning" role="alert">
                <IconAlert size={14} />
                <span>{t("wizard.nameRequired")}</span>
              </span>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="th-summary">
            <div className="th-summary-row">
              <span className="th-summary-key">{t("wizard.summaryName")}</span>
              <span className="th-summary-val">{name.trim()}</span>
            </div>
            <div className="th-summary-row">
              <span className="th-summary-key">{t("wizard.summaryPath")}</span>
              <span className="th-summary-val">{picker.selected}</span>
            </div>
          </div>
        )}
      </div>

      <div className="th-wizard-foot">
        <button type="button" className="th-btn th-btn--ghost" onClick={onClose}>
          {t("wizard.cancel")}
        </button>
        <div className="th-wizard-foot-spacer" />
        {step > 1 && (
          <button
            type="button"
            className="th-btn th-btn--ghost"
            disabled={creating}
            onClick={() => setStep(step - 1)}
          >
            {t("wizard.back")}
          </button>
        )}
        {step === 1 && (
          <button
            type="button"
            className="th-btn th-btn--primary"
            disabled={!picker.selected}
            onClick={nextFromPicker}
          >
            {t("wizard.next")}
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            className="th-btn th-btn--primary"
            disabled={name.trim().length === 0}
            onClick={() => setStep(3)}
          >
            {t("wizard.next")}
          </button>
        )}
        {step === 3 && (
          <button type="button" className="th-btn th-btn--primary" disabled={creating} onClick={create}>
            {creating ? t("wizard.creating") : t("wizard.create")}
          </button>
        )}
      </div>
    </ModalDialog>
  );
}

function basename(path: string): string {
  const trimmed = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

interface FolderPickerState {
  readonly data: FsBrowse | null;
  readonly selected: string | null;
  readonly loading: boolean;
  readonly error: string;
  readonly navigate: (path: string) => void;
  readonly reload: () => void;
}

/** Server-side directory browser state; loads root while the wizard is open. */
function useFolderPicker(active: boolean): FolderPickerState {
  const { t } = useT();
  const [data, setData] = useState<FsBrowse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      setData(null);
      setSelected(null);
      setError("");
      setTick(0);
      return;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fsBrowse(selected ?? "")
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setSelected(res.path);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("wizard.browseError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, selected, tick, t]);

  const navigate = useCallback((path: string) => setSelected(path), []);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { data, selected, loading, error, navigate, reload };
}

interface FolderPickerViewProps {
  readonly picker: FolderPickerState;
  readonly onSelect: () => void;
}

function FolderPickerView({ picker, onSelect }: FolderPickerViewProps) {
  const { t } = useT();
  const data = picker.data;

  if (picker.error.length > 0) {
    return (
      <div className="th-picker-status">
        <span className="th-alert th-alert--error" role="alert">
          <IconAlert size={15} />
          <span>{picker.error}</span>
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="th-picker-path">
        <IconFolderOpen size={14} />
        <span className="th-picker-path-text">{data?.path ?? "…"}</span>
      </div>

      {picker.loading || !data ? (
        <div className="th-picker-status">{t("wizard.loading")}</div>
      ) : (
        <div className="th-picker-list" role="list" aria-label={t("wizard.step1Title")}>
          {data.parent && (
            <button
              type="button"
              className="th-picker-row"
              onClick={() => picker.navigate(data.parent ?? "")}
            >
              <IconArrowUp size={14} />
              <span className="th-picker-row-label">{t("picker.parent")}</span>
            </button>
          )}
          {data.dirs.length === 0 && <div className="th-picker-status">{t("picker.empty")}</div>}
          {data.dirs.map((dir) => (
            <button
              key={dir}
              type="button"
              className="th-picker-row"
              onClick={() => picker.navigate(joinPath(data.path, dir))}
            >
              <IconFolder size={14} />
              <span className="th-picker-row-label">{dir}</span>
            </button>
          ))}
        </div>
      )}

      <div className="th-picker-select">
        <span className="th-picker-select-path">{picker.selected ?? "…"}</span>
        <button
          type="button"
          className="th-btn th-btn--ghost"
          onClick={onSelect}
          disabled={!picker.selected}
        >
          <IconCheck size={13} />
          {t("wizard.selectHere")}
        </button>
      </div>
    </div>
  );
}

