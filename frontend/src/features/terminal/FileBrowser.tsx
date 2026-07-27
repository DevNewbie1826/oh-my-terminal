import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useT } from "../../i18n";
import { fsList, uploadFiles } from "./terminal";
import { joinPath } from "../../lib/path";
import type { FsList } from "./terminal";
import { FileEditor } from "./FileEditor";
import { FileTree } from "./FileTree";
import { IconAlert, IconUpload, IconX } from "../../components/icons";
import type { ToastKind } from "../../components/SessionTree";

export interface FileBrowserProps {
  readonly path: string;
  readonly wsId: string;
  readonly tmId: string;
  readonly width: number;
  readonly onClose: () => void;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

export function FileBrowser({ path, wsId, tmId, width, onClose, notify }: FileBrowserProps) {
  const { t, lang } = useT();
  const [data, setData] = useState<FsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<{ readonly name: string; readonly path: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fsList(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("files.error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick, t]);

  const upload = useCallback(
    async (files: readonly File[]): Promise<void> => {
      if (files.length === 0 || uploadingRef.current) return;
      uploadingRef.current = true;
      setUploading(true);
      try {
        await uploadFiles(wsId, tmId, files);
        notify(t("toast.uploaded", { n: files.length }), "success");
        setTick((n) => n + 1);
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : t("toast.uploadFailed"), "error");
      } finally {
        uploadingRef.current = false;
        setUploading(false);
        setDragOver(false);
      }
    },
    [wsId, tmId, notify, t],
  );

  const onChooseFiles = (ev: ChangeEvent<HTMLInputElement>): void => {
    const input = ev.currentTarget;
    void upload(Array.from(input.files ?? [])).finally(() => {
      input.value = "";
    });
  };

  const onDrop = (ev: DragEvent<HTMLDivElement>): void => {
    ev.preventDefault();
    void upload(Array.from(ev.dataTransfer.files));
  };

  const openFile = useCallback((name: string, dir: string): void => {
    setEditing({ name, path: joinPath(dir, name) });
  }, []);

  const locale = lang === "ko" ? "ko-KR" : "en-US";

  return (
    <div
      className={`th-files${dragOver ? " th-files--drag" : ""}`}
      style={{ width: `${width}px` }}
      onDragOver={(ev) => {
        ev.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(ev) => {
        if (ev.target === ev.currentTarget) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="th-files-head">
        <span className="th-files-title">{t("files.title")}</span>
        <span className="th-files-path" title={path}>
          {data?.path ?? path}
        </span>
        <button type="button" className="th-btn-icon" title={t("files.close")} onClick={onClose}>
          <IconX size={14} />
        </button>
      </div>
      {editing ? (
        <FileEditor
          path={editing.path}
          name={editing.name}
          onClose={() => setEditing(null)}
          notify={notify}
        />
      ) : (
        <>
          <div
            className={`th-files-drop${uploading ? " th-files-drop--busy" : ""}`}
            aria-busy={uploading}
          >
            <IconUpload size={15} />
            <span>{uploading ? t("files.uploading") : t("files.uploadHint")}</span>
            <button
              type="button"
              className="th-btn th-btn--ghost th-files-choose"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {t("files.choose")}
            </button>
            <input
              ref={fileInputRef}
              className="th-files-input"
              type="file"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={onChooseFiles}
            />
          </div>

          {error.length > 0 ? (
            <div className="th-files-status">
              <span className="th-alert th-alert--error" role="alert">
                <IconAlert size={15} />
                <span>{error}</span>
              </span>
              <button
                type="button"
                className="th-btn th-btn--ghost"
                onClick={() => setTick((n) => n + 1)}
              >
                {t("files.retry")}
              </button>
            </div>
          ) : loading || !data ? (
            <div className="th-files-status">{t("wizard.loading")}</div>
          ) : data.entries.length === 0 ? (
            <div className="th-files-status">{t("files.empty")}</div>
          ) : (
            <FileTree entries={data.entries} path={data.path} locale={locale} onOpenFile={openFile} />
          )}
        </>
      )}
    </div>
  );
}
