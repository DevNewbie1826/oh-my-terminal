import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useTerminal } from "./useTerminal";

const mocks = vi.hoisted(() => {
  const terminalInstances: FakeTerminal[] = [];

  class FakeFitAddon {}
  class FakeWebLinksAddon {}
  class FakeUnicode11Addon {}

  class FakeTerminal {
    readonly cols = 80;
    readonly rows = 24;
    readonly options = { fontFamily: "", fontSize: 0 };
    readonly textarea = document.createElement("textarea");
    readonly unicode = { activeVersion: "" };
    readonly loadAddon = vi.fn();
    readonly open = vi.fn();
    readonly dispose = vi.fn();
    readonly onData = vi.fn(() => ({ dispose: vi.fn() }));

    constructor() {
      terminalInstances.push(this);
    }
  }

  return {
    FakeFitAddon,
    FakeTerminal,
    FakeUnicode11Addon,
    FakeWebLinksAddon,
    reset: () => {
      terminalInstances.length = 0;
      vi.clearAllMocks();
    },
    terminalInstances,
  };
});

vi.mock("@xterm/xterm", () => ({ Terminal: mocks.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: mocks.FakeFitAddon }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: mocks.FakeWebLinksAddon }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: mocks.FakeUnicode11Addon }));
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

function TerminalHarness() {
  const { containerRef } = useTerminal({
    wsId: "workspace",
    tmId: "terminal",
    stack: "monospace",
    fontSize: 13,
    focused: false,
  });
  return createElement("div", { ref: containerRef });
}

describe("useTerminal renderer", () => {
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

  it("does not load a non-core renderer addon", () => {
    act(() => {
      root.render(createElement(TerminalHarness));
    });
    mounted = true;

    expect(mocks.terminalInstances).toHaveLength(1);
    const terminal = mocks.terminalInstances[0]!;
    expect(terminal.loadAddon.mock.calls.map(([addon]) => addon)).toEqual([
      expect.any(mocks.FakeFitAddon),
      expect.any(mocks.FakeWebLinksAddon),
      expect.any(mocks.FakeUnicode11Addon),
    ]);
  });
});
