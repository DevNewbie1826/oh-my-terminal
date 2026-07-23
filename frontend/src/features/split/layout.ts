import { apiJson, apiVoid } from "../../lib/api";

export interface LayoutResponse {
  readonly layout: unknown;
}

/** GET /api/layout → the persisted split-pane layout, or null when unset. */
export async function getLayout(): Promise<unknown> {
  const res = await apiJson<LayoutResponse>("/api/layout");
  return res.layout;
}

/** PUT /api/layout → persist the layout blob (the body is the layout itself). */
export async function putLayout(layout: unknown): Promise<void> {
  await apiVoid("/api/layout", { method: "PUT", body: layout });
}
