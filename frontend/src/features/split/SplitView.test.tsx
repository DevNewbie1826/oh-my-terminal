import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nContext } from "../../i18n";
import type { I18nValue } from "../../i18n";
import { SplitView } from "./SplitView";
import type { SplitActions } from "./SplitView";
import { leaf } from "./paneTree";

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

  function render(actions: SplitActions, sessionId: string | null): void {
    const node = leaf(sessionId);
    act(() => {
      root.render(
        <I18nContext.Provider value={i18n}>
          <SplitView
            node={node}
            workspaces={[]}
            placed={new Set()}
            sessions={new Map()}
            focusedPaneId={node.id}
            splitEnabled
            actions={actions}
          />
        </I18nContext.Provider>,
      );
    });
  }

  it("renders a close button for a pane with no session", () => {
    render(makeActions(), null);
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="split.close"]');
    expect(close).not.toBeNull();
  });

  it("calls onClosePane with the pane id when the empty-pane close is clicked", () => {
    const onClosePane = vi.fn();
    const node = leaf(null);
    act(() => {
      root.render(
        <I18nContext.Provider value={i18n}>
          <SplitView
            node={node}
            workspaces={[]}
            placed={new Set()}
            sessions={new Map()}
            focusedPaneId={node.id}
            splitEnabled
            actions={makeActions({ onClosePane })}
          />
        </I18nContext.Provider>,
      );
    });
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="split.close"]');
    act(() => {
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClosePane).toHaveBeenCalledWith(node.id);
  });

  it("hides the empty-pane close button when splitting is disabled", () => {
    const node = leaf(null);
    act(() => {
      root.render(
        <I18nContext.Provider value={i18n}>
          <SplitView
            node={node}
            workspaces={[]}
            placed={new Set()}
            sessions={new Map()}
            focusedPaneId={node.id}
            splitEnabled={false}
            actions={makeActions()}
          />
        </I18nContext.Provider>,
      );
    });
    expect(container.querySelector('button[aria-label="split.close"]')).toBeNull();
  });
});
