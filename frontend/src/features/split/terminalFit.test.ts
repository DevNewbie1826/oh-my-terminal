import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fitFullWidth } from "./terminalFit";

vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));
vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));

describe("fitFullWidth", () => {
  let parent: HTMLDivElement | undefined;

  afterEach(() => {
    parent?.remove();
    parent = undefined;
  });

  it("uses public terminal dimensions without private renderer internals", () => {
    parent = document.createElement("div");
    parent.style.width = "320px";
    parent.style.height = "200px";

    const element = document.createElement("div");
    element.style.padding = "8px 0 0 8px";
    parent.append(element);
    document.body.append(parent);

    const resize = vi.fn();
    const fit = { fit: vi.fn() } as unknown as FitAddon;
    const terminal = {
      cols: 10,
      rows: 5,
      dimensions: { css: { cell: { width: 8, height: 16 } } },
      element,
      resize,
    } as unknown as Terminal;

    expect(fitFullWidth(terminal, fit)).toBe(true);
    expect(resize).toHaveBeenCalledWith(39, 12);
    expect(fit.fit).not.toHaveBeenCalled();
  });
});
