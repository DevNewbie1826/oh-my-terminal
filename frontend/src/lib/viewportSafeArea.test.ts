import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const globalCss = readFileSync("src/styles/global.css", "utf8");
const mobileInputCss = readFileSync("src/styles/mobile-input.css", "utf8");

const declarationsFor = (css: string, selector: string): string => {
  const selectorStart = css.indexOf(`${selector} {`);
  if (selectorStart < 0) return "";
  const declarationsStart = css.indexOf("{", selectorStart);
  return css.slice(declarationsStart + 1, css.indexOf("}", declarationsStart));
};

describe("mobile safe area", () => {
  test("fills the screen edge while keeping controls above the home indicator", () => {
    const root = declarationsFor(globalCss, "#root");
    const inputBar = declarationsFor(mobileInputCss, ".th-mobile-inputbar");
    const focusedInputBar = declarationsFor(
      mobileInputCss,
      ".th-mobile-inputbar:has(.th-mobile-input:focus)",
    );

    expect(root).toContain(
      "padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)",
    );
    expect(inputBar).toContain(
      "padding: 8px 10px calc(8px + env(safe-area-inset-bottom))",
    );
    expect(focusedInputBar).toContain("padding-bottom: 8px");
  });
});
