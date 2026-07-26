import { apiJson, apiVoid } from "../../lib/api";

export interface Terminal {
  readonly id: string;
  readonly name: string;
  readonly tmuxSession: string;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly terminals: readonly Terminal[];
}

export async function listWorkspaces(): Promise<readonly Workspace[]> {
  return apiJson<readonly Workspace[]>("/api/workspaces");
}

export async function createWorkspace(name: string, path: string): Promise<Workspace> {
  return apiJson<Workspace>("/api/workspaces", { method: "POST", body: { name, path } });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiVoid(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  return apiJson<Workspace>(`/api/workspaces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { name },
  });
}
