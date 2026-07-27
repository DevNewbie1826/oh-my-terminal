import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useTerminal } from "./useTerminal";

const mocks = vi.hoisted(() => {
  const lifecycle: string[] = [];
  const terminalInstances: FakeTerminal[] = [];
  const webglInstances: FakeWebglAddon[] = [];
  let contextLossListener: (() => void) | undefined;

  const contextLossSubscriptionDispose = vi.fn(() => {
    lifecycle.push("context-loss-subscription-dispose");
  });
  const webglDispose = vi.fn(() => {
    lifecycle.push("webgl-dispose");
  });
  const webglSubscribe = vi.fn((listener: () => void) => {
    contextLossListener = listener;
    return { dispose: contextLossSubscriptionDispose };
  });

  class FakeTerminal {
    readonly cols = 80;
    readonly rows = 24;
    readonly options = { fontFamily: "", fontSize: 0 };
    readonly textarea = document.createElement("textarea");
    readonly unicode = { activeVersion: "" };
    readonly loadAddon = vi.fn();
    readonly open = vi.fn();
    readonly refresh = vi.fn((start: number, end: number) => {
      lifecycle.push(`refresh:${start}:${end}`);
    });
    readonly dispose = vi.fn(() => {
      lifecycle.push("terminal-dispose");
    });
    readonly onData = vi.fn(() => ({ dispose: vi.fn() }));

    constructor() {
      terminalInstances.push(this);
    }
  }

  class FakeWebglAddon {
    readonly onContextLoss = webglSubscribe;
    readonly dispose = webglDispose;

    constructor() {
      webglInstances.push(this);
    }
  }

  return {
    FakeTerminal,
    FakeWebglAddon,
    contextLossSubscriptionDispose,
    emitContextLoss: () => contextLossListener?.(),
    lifecycle,
    reset: () => {
      lifecycle.length = 0;
      terminalInstances.length = 0;
      webglInstances.length = 0;
      contextLossListener = undefined;
      vi.clearAllMocks();
    },
    terminalInstances,
    webglDispose,
    webglInstances,
    webglSubscribe,
  };
});

vi.mock("@xterm/xterm", () => ({ Terminal: mocks.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: mocks.FakeWebglAddon }));
vi.mock("../../lib/ws", () => ({
  connectWs: vi.fn(() => ({ close: vi.fn(), send: vi.fn(() => true) })),
}));
vi.mock("./terminalFit", () => ({ fitFullWidth: vi.fn(() => true) }));
vi.mock("./terminalClipboard", () => ({
  registerTerminalClipboard: vi.fn(() => ({ dispose: vi.fn() })),
}));
vi.mock("./terminalTouchSelect", () => ({ registerTouchSelect: vi.fn(() => vi.fn()) }));
vi.mock("./terminalKeys", () => ({ registerTerminalKeys: vi.fn(() => vi.fn()) }));

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function TerminalHarness({ isMobile }: { readonly isMobile: boolean }) {
  const { containerRef } = useTerminal({
    wsId: "workspace",
    tmId: "terminal",
    stack: "monospace",
    fontSize: 13,
    focused: false,
    isMobile,
  });
  return createElement("div", { ref: containerRef });
}

describe("useTerminal WebGL lifecycle", () => {
  let container: HTMLDivElement | undefined;
  let root: Root;
  let mounted = false;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    mocks.reset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (mounted) {
      act(() => root.unmount());
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  function render(isMobile: boolean): void {
    act(() => {
      root.render(createElement(TerminalHarness, { isMobile }));
    });
    mounted = true;
  }

  function unmount(): void {
    act(() => root.unmount());
    mounted = false;
  }

  it("does not construct WebglAddon on mobile", () => {
    render(true);

    expect(mocks.terminalInstances).toHaveLength(1);
    expect(mocks.webglInstances).toHaveLength(0);
  });

  it("loads and subscribes to WebglAddon on desktop, then restores the DOM renderer once after context loss", () => {
    render(false);

    expect(mocks.terminalInstances).toHaveLength(1);
    expect(mocks.webglInstances).toHaveLength(1);
    const term = mocks.terminalInstances[0]!;
    const webgl = mocks.webglInstances[0]!;
    expect(term.loadAddon).toHaveBeenCalledWith(webgl);
    expect(mocks.webglSubscribe).toHaveBeenCalledTimes(1);

    mocks.emitContextLoss();
    mocks.emitContextLoss();

    expect(mocks.webglDispose).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledOnce();
    expect(term.refresh).toHaveBeenCalledWith(0, term.rows - 1);
  });

  it("unsubscribes before disposing WebGL during cleanup", () => {
    render(false);

    unmount();

    expect(mocks.lifecycle).toEqual([
      "context-loss-subscription-dispose",
      "webgl-dispose",
      "terminal-dispose",
    ]);
  });

  it("does not dispose WebGL again when cleanup follows context loss", () => {
    render(false);
    mocks.emitContextLoss();

    unmount();

    expect(mocks.contextLossSubscriptionDispose).toHaveBeenCalledTimes(1);
    expect(mocks.webglDispose).toHaveBeenCalledTimes(1);
  });
});
