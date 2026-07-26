import { apiJson, apiRaw, apiVoid, qs } from "../../lib/api";
import type { Terminal } from "../workspace/workspace";

export async function createTerminal(wsId: string, name: string): Promise<Terminal> {
  return apiJson<Terminal>(`/api/workspaces/${encodeURIComponent(wsId)}/terminals`, {
    method: "POST",
    body: { name },
  });
}

export async function deleteTerminal(wsId: string, tmId: string): Promise<void> {
  await apiVoid(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}`,
    { method: "DELETE" },
  );
}

export async function renameTerminal(wsId: string, tmId: string, name: string): Promise<Terminal> {
  return apiJson<Terminal>(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}`,
    { method: "PATCH", body: { name } },
  );
}

export interface AttachCmd {
  readonly command: string;
}

export async function getAttachCmd(wsId: string, tmId: string): Promise<AttachCmd> {
  return apiJson<AttachCmd>(
    `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}/attach-cmd`,
  );
}

export function wsPath(wsId: string, tmId: string): string {
  return `/api/workspaces/${encodeURIComponent(wsId)}/terminals/${encodeURIComponent(tmId)}/ws`;
}

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

export async function fsList(path: string): Promise<FsList> {
  return apiJson<FsList>(`/api/fs/list${qs({ path })}`);
}

export interface FsBrowse {
  readonly path: string;
  readonly parent: string | null;
  readonly dirs: readonly string[];
}

export async function fsBrowse(path: string): Promise<FsBrowse> {
  return apiJson<FsBrowse>(`/api/fs/browse${qs({ path })}`);
}

export function downloadUrl(path: string): string {
  return `/api/fs/download${qs({ path })}`;
}

export interface FsFile {
  readonly content: string;
  readonly size: number;
}

export async function fsRead(path: string): Promise<FsFile> {
  return apiJson<FsFile>(`/api/fs/read${qs({ path })}`);
}

export async function fsWrite(path: string, content: string): Promise<void> {
  await apiVoid(`/api/fs/write${qs({ path })}`, {
    method: "POST",
    body: { content },
  });
}
