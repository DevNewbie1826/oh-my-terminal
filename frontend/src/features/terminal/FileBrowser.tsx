import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useT } from "../../i18n";
import { downloadUrl, fsList, uploadFiles } from "./terminal";
import { joinPath } from "../../lib/path";
import type { FsEntry, FsList } from "./terminal";
import { FileEditor } from "./FileEditor";
import {
  IconAlert,
  IconChevron,
  IconDownload,
  IconFile,
  IconFolder,
  IconUpload,
  IconX,
} from "../../components/icons";
import type { ToastKind } from "../../components/SessionTree";

export interface FileBrowserProps {
  readonly path: string;
  readonly wsId: string;
  readonly tmId: string;
  readonly width: number;
  readonly onClose: () => void;
  readonly notify: (msg: string, kind?: ToastKind) => void;
}

/** Directories first, then alphabetical. */
function sortEntries(entries: readonly FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
  );
}

const INDENT_BASE = 8;
const INDENT_STEP = 16;

/** Row indentation for a tree depth; shared by every row so levels align. */
function indentStyle(depth: number): { readonly paddingLeft: number } {
  return { paddingLeft: INDENT_BASE + depth * INDENT_STEP };
}

interface EntryRowProps {
  readonly depth: number;
  readonly locale: string;
  readonly onOpenFile: (name: string, dir: string) => void;
}

interface FileRowProps extends EntryRowProps {
  readonly entry: FsEntry;
  readonly dir: string;
}

function FileRow({ entry, dir, depth, locale, onOpenFile }: FileRowProps) {
  const { t } = useT();
  return (
    <div className="th-files-row" style={indentStyle(depth)}>
      <IconFile size={14} />
      <button
        type="button"
        className="th-files-name th-files-name--link"
        title={t("files.openEditor")}
        onClick={() => onOpenFile(entry.name, dir)}
      >
        {entry.name}
      </button>
      <span className="th-files-meta">{formatSize(entry.size)}</span>
      <span className="th-files-meta th-files-meta--dim">
        {new Date(entry.modTime).toLocaleString(locale, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <a
        className="th-files-dl"
        href={downloadUrl(joinPath(dir, entry.name))}
        download={entry.name}
        title={t("files.download")}
      >
        <IconDownload size={13} />
      </a>
    </div>
  );
}

interface FolderNodeProps extends EntryRowProps {
  readonly name: string;
  readonly path: string;
}

/** Expandable directory node that lazy-loads its children on first open. */
function FolderNode({ name, path, depth, locale, onOpenFile }: FolderNodeProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FsList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toggle = (): void => {
    const next = !expanded;
    setExpanded(next);
    if (next && children === null && !loading) {
      setLoading(true);
      setError("");
      fsList(path)
        .then((res) => {
          if (mountedRef.current) setChildren(res);
        })
        .catch((err: unknown) => {
          if (mountedRef.current) setError(err instanceof Error ? err.message : t("files.error"));
        })
        .finally(() => {
          if (mountedRef.current) setLoading(false);
        });
    }
  };

  const indent = indentStyle(depth);
  const childIndent = indentStyle(depth + 1);

  return (
    <>
      <div className="th-files-row th-files-row--muted" style={indent}>
        <button
          type="button"
          className={`th-files-chevron${expanded ? " th-files-chevron--open" : ""}`}
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={name}
        >
          <IconChevron size={12} />
        </button>
        <IconFolder size={14} />
        <button type="button" className="th-files-name th-files-name--dir" onClick={toggle}>
          {name}
        </button>
      </div>
      {expanded &&
        (loading ? (
          <div className="th-files-childstatus" style={childIndent}>
            {t("wizard.loading")}
          </div>
        ) : error.length > 0 ? (
          <div className="th-files-childstatus th-files-childstatus--error" style={childIndent}>
            {error}
          </div>
        ) : children === null ? null : children.entries.length === 0 ? (
          <div className="th-files-childstatus" style={childIndent}>
            {t("files.empty")}
          </div>
        ) : (
          sortEntries(children.entries).map((entry) =>
            entry.isDir ? (
              <FolderNode
                key={`d-${entry.name}`}
                name={entry.name}
                path={joinPath(path, entry.name)}
                depth={depth + 1}
                locale={locale}
                onOpenFile={onOpenFile}
              />
            ) : (
              <FileRow
                key={`f-${entry.name}`}
                entry={entry}
                dir={path}
                depth={depth + 1}
                locale={locale}
                onOpenFile={onOpenFile}
              />
            ),
          )
        ))}
    </>
  );
}

/** Floating file panel anchored over the terminal. */
export function FileBrowser({ path, wsId, tmId, width, onClose, notify }: FileBrowserProps) {
  const { t, lang } = useT();
  const [data, setData] = useState<FsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
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
      if (files.length === 0 || uploading) return;
      setUploading(true);
      try {
        await uploadFiles(wsId, tmId, files);
        notify(t("toast.uploaded", { n: files.length }), "success");
        setTick((n) => n + 1);
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : t("toast.uploadFailed"), "error");
      } finally {
        setUploading(false);
        setDragOver(false);
      }
    },
    [wsId, tmId, uploading, notify, t],
  );

  const onDrop = (ev: DragEvent<HTMLDivElement>): void => {
    ev.preventDefault();
    void upload(Array.from(ev.dataTransfer.files));
  };

  const openFile = useCallback((name: string, dir: string): void => {
    setEditing({ name, path: joinPath(dir, name) });
  }, []);

  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const entries = data ? sortEntries(data.entries) : [];

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
          <div className={`th-files-drop${uploading ? " th-files-drop--busy" : ""}`}>
            <IconUpload size={15} />
            <span>{uploading ? t("files.uploading") : t("files.uploadHint")}</span>
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
          ) : entries.length === 0 ? (
            <div className="th-files-status">{t("files.empty")}</div>
          ) : (
            <div className="th-files-list">
              {entries.map((entry) =>
                entry.isDir ? (
                  <FolderNode
                    key={entry.name}
                    name={entry.name}
                    path={joinPath(data.path, entry.name)}
                    depth={0}
                    locale={locale}
                    onOpenFile={openFile}
                  />
                ) : (
                  <FileRow
                    key={entry.name}
                    entry={entry}
                    dir={data.path}
                    depth={0}
                    locale={locale}
                    onOpenFile={openFile}
                  />
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
