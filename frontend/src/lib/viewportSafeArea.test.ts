import { describe, expect, test } from "vitest";

import pageHtml from "../../index.html?raw";

describe("visual viewport safe area", () => {
  test("removes the bottom inset only while the iOS keyboard is open", () => {
    const script = pageHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();

    const innerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
    const visualViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const viewport = {
      height: 844,
      offsetLeft: 0,
      offsetTop: 0,
      listeners: new Map<string, Array<() => void>>(),
      addEventListener(type: string, listener: () => void) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      },
      dispatch(type: string) {
        for (const listener of this.listeners.get(type) ?? []) listener();
      },
    };

    try {
      document.documentElement.removeAttribute("data-th-keyboard-open");
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.eval(script ?? "");

      expect(document.documentElement.hasAttribute("data-th-keyboard-open")).toBe(false);

      viewport.height = 504;
      viewport.dispatch("resize");
      expect(document.documentElement.hasAttribute("data-th-keyboard-open")).toBe(true);

      viewport.height = 844;
      viewport.dispatch("resize");
      expect(document.documentElement.hasAttribute("data-th-keyboard-open")).toBe(false);
    } finally {
      document.documentElement.removeAttribute("data-th-keyboard-open");
      if (innerHeight) Object.defineProperty(window, "innerHeight", innerHeight);
      if (visualViewport) Object.defineProperty(window, "visualViewport", visualViewport);
    }
  });
});
