import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

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
      /\.th-mobile-inputbar:has\(\.th-mobile-input:focus\) \{[^}]*padding-bottom: 8px/,
    );
  });
});
