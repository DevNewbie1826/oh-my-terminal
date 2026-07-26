import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nContext } from "../../i18n";
import type { I18nValue } from "../../i18n";
import { SplitView } from "./SplitView";
import type { SplitActions } from "./SplitView";
import { leaf } from "./paneTree";
import type { PaneNode } from "./paneTree";

const i18n: I18nValue = {
  lang: "en",
  setLang: () => undefined,
  font: "system",
  setFont: () => undefined,
  fontSize: 13,
  setFontSize: () => undefined,
  t: (key) => key,
} as I18nValue;

function makeActions(overrides: Partial<SplitActions> = {}): SplitActions {
  return {
    onFocusPane: () => undefined,
    onAssign: () => undefined,
    onCreateTerminal: () => undefined,
    onSplit: () => undefined,
    onClosePane: () => undefined,
    onRatioChange: () => undefined,
    onOpenSidebar: () => undefined,
    notify: () => undefined,
    ...overrides,
  };
}

describe("SplitView empty pane", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(node: PaneNode, actions: SplitActions, splitEnabled = true): void {
    act(() => {
      root.render(
        <I18nContext.Provider value={i18n}>
          <SplitView
            node={node}
            workspaces={[]}
            placed={new Set()}
            sessions={new Map()}
            focusedPaneId={node.id}
            splitEnabled={splitEnabled}
            actions={actions}
          />
        </I18nContext.Provider>,
      );
    });
  }

  it("renders a close button for a pane with no session", () => {
    render(leaf(null), makeActions());
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="split.close"]');
    expect(close).not.toBeNull();
  });

  it("calls onClosePane with the pane id when the empty-pane close is clicked", () => {
    const onClosePane = vi.fn();
    const node = leaf(null);
    render(node, makeActions({ onClosePane }));
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="split.close"]');
    act(() => {
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClosePane).toHaveBeenCalledWith(node.id);
  });

  it("hides the empty-pane close button when splitting is disabled", () => {
    render(leaf(null), makeActions(), false);
    expect(container.querySelector('button[aria-label="split.close"]')).toBeNull();
  });
});
