import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import pageHtml from "../../index.html?raw";

const globalCss = readFileSync("src/styles/global.css", "utf8");
const mobileInputCss = readFileSync("src/styles/mobile-input.css", "utf8");

describe("mobile safe area", () => {
  test("fills the screen edge while keeping controls above the home indicator", () => {
    expect(globalCss).toMatch(
      /#root \{[^}]*padding: env\(safe-area-inset-top\) env\(safe-area-inset-right\) 0 env\(safe-area-inset-left\)/,
    );
    expect(mobileInputCss).toMatch(
      /\.th-mobile-inputbar \{[^}]*padding: 8px 10px calc\(8px \+ env\(safe-area-inset-bottom\)\)/,
    );
    expect(mobileInputCss).toMatch(
      /html\[data-th-keyboard-open\] \.th-mobile-inputbar:has\(\.th-mobile-input:focus\) \{[^}]*padding-bottom: 8px/,
    );
  });

  test("keeps the safe inset when focus outlives the software keyboard", () => {
    const script = pageHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();

    const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
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
    const input = document.createElement("textarea");

    try {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: viewport,
      });
      window.eval(script!);
      document.body.appendChild(input);
      input.focus();

      expect(document.documentElement.hasAttribute("data-th-keyboard-open")).toBe(false);

      viewport.height = 504;
      for (const listener of resizeListeners) listener();
      expect(document.documentElement.hasAttribute("data-th-keyboard-open")).toBe(true);

      viewport.height = 844;
      for (const listener of resizeListeners) listener();
      expect(document.activeElement).toBe(input);
      expect(document.documentElement.hasAttribute("data-th-keyboard-open")).toBe(false);
    } finally {
      input.remove();
      document.documentElement.removeAttribute("data-th-keyboard-open");
      if (originalViewport) {
        Object.defineProperty(window, "visualViewport", originalViewport);
      } else {
        Reflect.deleteProperty(window, "visualViewport");
      }
    }
  });
});
