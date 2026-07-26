/** WebSocket codes for a clean server-side close (PTY ended), not a drop. */
const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;

export function isCleanClose(code: number): boolean {
  return code === CLOSE_NORMAL || code === CLOSE_GOING_AWAY;
}

export function isOutputMsg(m: unknown): m is { readonly type: "output"; readonly data: string } {
  return (
    typeof m === "object" &&
    m !== null &&
    "type" in m &&
    m.type === "output" &&
    "data" in m &&
    typeof m.data === "string"
  );
}
