import { apiJson, apiRaw, apiVoid, qs } from "../../lib/api";
import type { Terminal } from "../workspace/workspace";


/** POST /api/workspaces/{wsId}/terminals → created terminal (201). Empty name = server default. */
export async function createTerminal(wsId: string, name: string): Promise<Terminal> {
  return apiJson<Terminal>(`/api/workspaces/${encodeURIComponent(wsId)}/terminals`, {
    method: "POST",
    body: { name },
  });
}

/** DELETE /api/workspaces/{wsId}/terminals/{tmId} — kills the tmux session. */
export async function deleteTerminal(wsId: string, tmId: string): Promise<void> {
  await apiVoid(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}`,
    { method: "DELETE" },
  );
}

/** PATCH /api/workspaces/{wsId}/terminals/{tmId} → updated terminal (200). */
export async function renameTerminal(wsId: string, tmId: string, name: string): Promise<Terminal> {
  return apiJson<Terminal>(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}`,
    { method: "PATCH", body: { name } },
  );
}

export interface AttachCmd {
  readonly command: string;
}

/** GET /api/workspaces/{wsId}/terminals/{tmId}/attach-cmd */
export async function getAttachCmd(wsId: string, tmId: string): Promise<AttachCmd> {
  return apiJson<AttachCmd>(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}/attach-cmd`,
  );
}

/** WebSocket endpoint path for a terminal. */
export function wsPath(wsId: string, tmId: string): string {
  return `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}/ws`;
}

/** POST /api/workspaces/{wsId}/terminals/{tmId}/upload — multipart, field "files". */
export async function uploadFiles(wsId: string, tmId: string, files: readonly File[]): Promise<void> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);
  await apiRaw(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}/upload`,
    { method: "POST", body: form },
  );
}

export interface FsEntry {
  readonly name: string;
  readonly isDir: boolean;
  readonly size: number;
  readonly modTime: string;
}

export interface FsList {
  readonly path: string;
  readonly parent: string | null;
  readonly entries: readonly FsEntry[];
}

/** GET /api/fs/list?path= — files + directories. */
export async function fsList(path: string): Promise<FsList> {
  return apiJson<FsList>(`/api/fs/list${qs({ path })}`);
}

export interface FsBrowse {
  readonly path: string;
  readonly parent: string | null;
  readonly dirs: readonly string[];
}

/** GET /api/fs/browse?path= — directories only (folder picker). */
export async function fsBrowse(path: string): Promise<FsBrowse> {
  return apiJson<FsBrowse>(`/api/fs/browse${qs({ path })}`);
}

/** GET /api/fs/download?path= — browser-downloadable URL (cookie-authenticated). */
export function downloadUrl(path: string): string {
  return `/api/fs/download${qs({ path })}`;
}

export interface FsFile {
  readonly content: string;
  readonly size: number;
}

/** GET /api/fs/read?path= — text file content for the editor. */
export async function fsRead(path: string): Promise<FsFile> {
  return apiJson<FsFile>(`/api/fs/read${qs({ path })}`);
}

/** POST /api/fs/write?path= — save editor content back to the file. */
export async function fsWrite(path: string, content: string): Promise<void> {
  await apiVoid(`/api/fs/write${qs({ path })}`, {
    method: "POST",
    body: { content },
  });
}
