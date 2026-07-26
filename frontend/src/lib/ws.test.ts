import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWs } from "./ws";
import type { WsConn } from "./ws";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(_data: string): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  serverClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
}

describe("connectWs", () => {
  let conn: WsConn | null = null;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    conn?.close();
    conn = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not reopen a connection vetoed after a clean close when the page becomes visible", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    conn = connectWs("/terminal", { onMessage: () => undefined }, { reconnect: (code) => code !== 1000 });
    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket?.serverClose(1000);
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
