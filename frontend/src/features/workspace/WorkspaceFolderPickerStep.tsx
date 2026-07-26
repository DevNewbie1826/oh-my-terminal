import { IconAlert, IconArrowUp, IconCheck, IconFolder, IconFolderOpen } from "../../components/icons";
import { useT } from "../../i18n";
import { joinPath } from "../../lib/path";
import type { FolderPickerState } from "./WorkspaceWizard";

interface WorkspaceFolderPickerStepProps {
  readonly picker: FolderPickerState;
  readonly onSelect: () => void;
}

export function WorkspaceFolderPickerStep({ picker, onSelect }: WorkspaceFolderPickerStepProps) {
  const { t } = useT();
  const data = picker.data;
  const parent = data?.parent;

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
          {parent && (
            <button
              type="button"
              className="th-picker-row"
              onClick={() => picker.navigate(parent)}
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
