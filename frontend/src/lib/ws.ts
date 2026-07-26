/**
 * WebSocket connection with JSON text frames, auto-reconnect, and liveness
 * detection tuned for mobile Safari.
 *
 * iOS suspends the tab (and its sockets) when the app is backgrounded or the
 * screen locks. On resume the socket is often dead but `onclose` never fires,
 * so a client-side ping heartbeat detects the dead connection and forces a
 * reconnect. Returning to the foreground also triggers an immediate check.
 */

export interface WsHandlers {
  readonly onOpen?: () => void;
  /** Invoked for every parsed JSON message. */
  readonly onMessage: (msg: unknown) => void;
  /** Invoked on every close, with the WebSocket close code. */
  readonly onClose?: (code: number) => void;
  readonly onError?: (err: Event) => void;
}

export interface WsOptions {
  /** Return false to stop reconnecting for a given close code. Default: always retry. */
  readonly reconnect?: (code: number) => boolean;
}

export interface WsConn {
  readonly send: (msg: unknown) => boolean;
  readonly close: () => void;
}

const PING_INTERVAL_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;
/** Application close code when the heartbeat detects a dead connection. */
const CLOSE_PING_TIMEOUT = 4000;

/**
 * Connect to `path` (e.g. `/api/.../ws`). Reconnects with capped exponential
 * backoff until `close()` is called or `reconnect` vetoes a close code.
 * Returns a stable handle whose `send` targets the live socket.
 */
export function connectWs(path: string, handlers: WsHandlers, options: WsOptions = {}): WsConn {
  let socket: WebSocket | null = null;
  let closed = false;
  // A reconnect veto is terminal for this connection (for example, when a
  // server has cleanly ended a terminal session).
  let reconnectVetoed = false;
  let attempt = 0;
  let retryTimer = 0;
  let pingTimer = 0;
  let pongTimer = 0;
  let awaitingPong = false;

  const clearTimers = (): void => {
    window.clearTimeout(pingTimer);
    window.clearTimeout(pongTimer);
    awaitingPong = false;
  };

  const scheduleReconnect = (): void => {
    if (closed) return;
    const delay = Math.min(1000 * 2 ** attempt, 10_000);
    attempt += 1;
    retryTimer = window.setTimeout(open, delay);
  };

  const open = (): void => {
    if (closed) return;
    // Detach any in-flight socket so a reconnect (e.g. from visibilitychange
    // while CONNECTING) cannot orphan it and leave two live connections.
    const prev = socket;
    if (prev) {
      prev.onopen = prev.onmessage = prev.onerror = prev.onclose = null;
      prev.close();
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${path}`);
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      startHeartbeat(ws);
      handlers.onOpen?.();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      try {
        const parsed: unknown = JSON.parse(ev.data);
        if (isPong(parsed)) {
          awaitingPong = false;
          window.clearTimeout(pongTimer);
          return;
        }
        handlers.onMessage(parsed);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onerror = (ev: Event) => {
      handlers.onError?.(ev);
    };
    ws.onclose = (ev: CloseEvent) => {
      clearTimers();
      handlers.onClose?.(ev.code);
      if (closed) return;
      if (!(options.reconnect?.(ev.code) ?? true)) {
        reconnectVetoed = true;
        window.clearTimeout(retryTimer);
        return;
      }
      scheduleReconnect();
    };
  };

  /** Periodic application-level ping; a missing pong means the socket died. */
  const startHeartbeat = (ws: WebSocket): void => {
    clearTimers();
    const tick = (): void => {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      if (awaitingPong) {
        // Previous ping unanswered — the connection is dead. Force a reconnect.
        ws.close(CLOSE_PING_TIMEOUT, "ping timeout");
        return;
      }
      awaitingPong = true;
      ws.send(JSON.stringify({ type: "ping" }));
      pongTimer = window.setTimeout(() => {
        if (awaitingPong) ws.close(CLOSE_PING_TIMEOUT, "ping timeout");
      }, PONG_TIMEOUT_MS);
      pingTimer = window.setTimeout(tick, PING_INTERVAL_MS);
    };
    pingTimer = window.setTimeout(tick, PING_INTERVAL_MS);
  };

  /** On returning to the foreground, probe the socket instead of waiting. */
  const onVisibility = (): void => {
    if (closed || reconnectVetoed || document.visibilityState !== "visible") return;
    const ws = socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      window.clearTimeout(retryTimer);
      attempt = 0;
      open();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  open();

  return {
    send(msg: unknown): boolean {
      const ws = socket;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close(): void {
      closed = true;
      clearTimers();
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      const ws = socket;
      if (ws) {
        ws.onclose = null;
        ws.close();
        socket = null;
      }
    },
  };
}

function isPong(msg: unknown): msg is { readonly type: "pong" } {
  return typeof msg === "object" && msg !== null && "type" in msg && msg.type === "pong";
}
