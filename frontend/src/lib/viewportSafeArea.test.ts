import { readFileSync } from "node:fs";

import { assert, describe, expect, test } from "vitest";

import pageHtml from "../../index.html?raw";

const globalCss = readFileSync("src/styles/global.css", "utf8");
const mobileInputCss = readFileSync("src/styles/mobile-input.css", "utf8");

describe("mobile safe area", () => {
  test("keeps layout inside the visible viewport", () => {
    expect(globalCss).toMatch(
      /^#root \{[^}]*height: 100vh;[^}]*padding: env\(safe-area-inset-top\)/m,
    );
    expect(globalCss).toMatch(
      /@supports \(height: 100dvh\) \{\s*#root \{\s*height: 100dvh;\s*\}\s*\}/,
    );
    expect(globalCss).not.toContain("100lvh");
    expect(globalCss).toMatch(
      /html\[data-th-keyboard-open\] #root \{[^}]*height: calc\(var\(--th-vh-unit, 1vh\) \* 100\);[^}]*transform: translate\(var\(--th-vv-left, 0px\), var\(--th-vv-top, 0px\)\)/,
    );
  });

  test("fills the screen edge while keeping controls above the home indicator", () => {
    expect(globalCss).toMatch(/body \{[^}]*background: var\(--th-bg\)/);
    expect(globalCss).toMatch(
      /#root \{[^}]*padding:\s+env\(safe-area-inset-top\)\s+env\(safe-area-inset-right\)\s+0\s+env\(safe-area-inset-left\)/,
    );
    expect(mobileInputCss).toMatch(
      /\.th-mobile-inputbar \{[^}]*padding: 8px 10px calc\(8px \+ env\(safe-area-inset-bottom\)\)/,
    );
    expect(mobileInputCss).toMatch(
      /\.th-mobile-inputbar \{[^}]*background: var\(--th-bg\)/,
    );
    expect(mobileInputCss).toMatch(
      /@media \(display-mode: standalone\) \{\s*\.th-mobile-inputbar \{[^}]*padding-bottom: 8px;\s*\}\s*\}/,
    );
    expect(mobileInputCss).toMatch(
      /html\[data-th-keyboard-open\] \.th-mobile-inputbar:has\(\.th-mobile-input:focus\) \{[^}]*padding-bottom: 8px/,
    );
  });

  test("keeps the safe inset when focus outlives the software keyboard", () => {
    const script = pageHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();

    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    assert(frame.contentWindow);
    assert(frame.contentDocument);
    assert(script);
    const viewportWindow = frame.contentWindow as typeof window;
    const viewportDocument = frame.contentDocument;
    const resizeListeners: Array<() => void> = [];
    const viewport = {
      height: 844,
      width: 390,
      offsetLeft: 0,
      offsetTop: 0,
      addEventListener: (type: string, listener: () => void) => {
        if (type === "resize") resizeListeners.push(listener);
      },
    };
    const input = viewportDocument.createElement("textarea");

    try {
      Object.defineProperty(viewportWindow, "visualViewport", {
        configurable: true,
        value: viewport,
      });
      viewportWindow.eval(script);
      viewportDocument.body.appendChild(input);
      input.focus();

      expect(
        viewportDocument.documentElement.hasAttribute("data-th-keyboard-open"),
      ).toBe(false);

      viewport.height = 504;
      for (const listener of resizeListeners) listener();
      expect(
        viewportDocument.documentElement.hasAttribute("data-th-keyboard-open"),
      ).toBe(true);

      viewport.height = 844;
      for (const listener of resizeListeners) listener();
      expect(viewportDocument.activeElement).toBe(input);
      expect(
        viewportDocument.documentElement.hasAttribute("data-th-keyboard-open"),
      ).toBe(false);
    } finally {
      frame.remove();
    }
  });
});
