import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useLayout } from "./useLayout";
import type { LayoutApi } from "./useLayout";

function LayoutProbe({ onReady }: { readonly onReady: (layout: LayoutApi) => void }) {
  const layout = useLayout(false);
  useEffect(() => onReady(layout), [layout, onReady]);
  return null;
}

describe("useLayout assignment", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("leaves a session unplaced when its pane closed before assignment", () => {
    const state: { layout: LayoutApi | null } = { layout: null };
    const onReady = (next: LayoutApi): void => {
      state.layout = next;
    };

    act(() => {
      root.render(<LayoutProbe onReady={onReady} />);
    });
    const initialLayout = state.layout;
    if (!initialLayout) throw new Error("layout did not initialize");
    const closedPaneId = initialLayout.focusedPaneId;

    act(() => {
      initialLayout.closePane(closedPaneId);
    });
    const updatedLayout = state.layout;
    if (!updatedLayout) throw new Error("layout did not update");
    const focusedPaneId = updatedLayout.focusedPaneId;
    expect(updatedLayout.hasPane(closedPaneId)).toBe(false);

    act(() => {
      updatedLayout.assignSession(closedPaneId, "terminal-1");
    });
    expect(updatedLayout.placed.has("terminal-1")).toBe(false);
    expect(updatedLayout.focusedPaneId).toBe(focusedPaneId);
  });
});
