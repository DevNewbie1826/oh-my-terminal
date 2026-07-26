import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Terminal } from "@xterm/xterm";
import { I18nContext } from "../../i18n";
import type { I18nValue } from "../../i18n";
import { MobileInputOverlay } from "./MobileInputOverlay";

const i18n: I18nValue = {
  lang: "en",
  setLang: () => undefined,
  font: "system",
  setFont: () => undefined,
  fontSize: 13,
  setFontSize: () => undefined,
  t: (key) => key,
} as I18nValue;

describe("MobileInputOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;
  let inputRef: { current: HTMLTextAreaElement | null };
  let input: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    inputRef = { current: null };
    input = vi.fn();
    const termRef = { current: { input } as unknown as Terminal };
    act(() => {
      root.render(
        <I18nContext.Provider value={i18n}>
          <MobileInputOverlay
            inputRef={inputRef}
            termRef={termRef}
            focused
            keysOpen={false}
            onKeysToggle={() => undefined}
          />
        </I18nContext.Provider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("sends multi-line input with newlines preserved, then a carriage return", () => {
    const textarea = inputRef.current;
    expect(textarea).not.toBeNull();
    act(() => {
      textarea!.value = "line1\nline2";
    });
    const send = container.querySelector<HTMLButtonElement>("button.th-mobile-send");
    act(() => {
      send?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(input.mock.calls).toEqual([
      ["line1\nline2", true],
      ["\r", true],
    ]);
    expect(textarea!.value).toBe("");
  });

  it("forwards Escape and Tab as escape sequences", () => {
    const textarea = inputRef.current!;
    for (const [key, seq] of [["Escape", "\x1b"], ["Tab", "\t"]] as const) {
      act(() => {
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
      expect(input).toHaveBeenLastCalledWith(seq, true);
    }
  });
});
