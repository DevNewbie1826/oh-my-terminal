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

/** GET /api/workspaces */
export async function listWorkspaces(): Promise<readonly Workspace[]> {
  return apiJson<readonly Workspace[]>("/api/workspaces");
}

/** POST /api/workspaces → created workspace (201). */
export async function createWorkspace(name: string, path: string): Promise<Workspace> {
  return apiJson<Workspace>("/api/workspaces", { method: "POST", body: { name, path } });
}

/** DELETE /api/workspaces/{id} — kills all tmux sessions inside. */
export async function deleteWorkspace(id: string): Promise<void> {
  await apiVoid(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** PATCH /api/workspaces/{id} → updated workspace (200). */
export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  return apiJson<Workspace>(`/api/workspaces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { name },
  });
}
