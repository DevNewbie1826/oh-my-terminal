import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Sidebar } from "./Sidebar";
import { useMediaQuery } from "../lib/useMediaQuery";

vi.mock("../lib/useMediaQuery", () => ({ useMediaQuery: vi.fn() }));

describe("Sidebar mobile drawer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("removes collapsed mobile drawer controls from accessibility and keyboard navigation", () => {
    const render = (collapsed: boolean): void => {
      root.render(
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => undefined}
          workspaces={[]}
          activeTerminalId={null}
          placedSessions={new Set()}
          expanded={new Set()}
          onToggleExpanded={() => undefined}
          onSelectTerminal={() => undefined}
          onAddWorkspace={() => undefined}
          onAddTerminal={() => undefined}
          onDeleteWorkspace={() => undefined}
          onDeleteTerminal={() => undefined}
          onRenameWorkspace={async () => undefined}
          onRenameTerminal={async () => undefined}
          onLogout={() => undefined}
          notify={() => undefined}
        />,
      );
    };

    act(() => {
      render(true);
    });
    const sidebar = container.querySelector("aside");
    expect(sidebar?.getAttribute("aria-hidden")).toBe("true");
    expect(sidebar?.hasAttribute("inert")).toBe(true);

    act(() => {
      render(false);
    });
    expect(sidebar?.hasAttribute("aria-hidden")).toBe(false);
    expect(sidebar?.hasAttribute("inert")).toBe(false);
  });
});
