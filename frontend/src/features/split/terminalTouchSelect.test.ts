import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { registerTouchSelect } from "./terminalTouchSelect";

interface FakeTerm {
  modes: { mouseTrackingMode: string };
  getSelection: () => string;
}

function makeTerm(mode: string, selection = ""): FakeTerm {
  return { modes: { mouseTrackingMode: mode }, getSelection: () => selection };
}

function touchEvent(type: string, x: number, y: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y, identifier: 1, target: null };
  Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : [point] });
  Object.defineProperty(ev, "changedTouches", { value: [point] });
  return ev;
}

function mouseRecorder(el: HTMLElement): MouseEvent[] {
  const seen: MouseEvent[] = [];
  for (const type of ["mousedown", "mousemove", "mouseup"]) {
    document.addEventListener(type, (e) => seen.push(e as MouseEvent));
    el.addEventListener(type, (e) => seen.push(e as MouseEvent));
  }
  return seen;
}

describe("registerTouchSelect", () => {
  let el: HTMLElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    Object.defineProperty(document, "elementFromPoint", {
      value: () => el,
      configurable: true,
    });
  });

  afterEach(() => {
    dispose?.();
    el.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function arm(term: FakeTerm, onCopied = vi.fn()): MouseEvent[] {
    dispose = registerTouchSelect(term as unknown as Terminal, el, onCopied);
    const seen = mouseRecorder(el);
    el.dispatchEvent(touchEvent("touchstart", 40, 80));
    vi.advanceTimersByTime(600);
    return seen;
  }

  it("arms selection with a detail-1 mousedown after a 500ms hold", () => {
    const seen = arm(makeTerm("none"));
    const down = seen.find((e) => e.type === "mousedown");
    expect(down).toBeDefined();
    expect(down?.detail).toBe(1);
  });

  it("uses no modifiers when the app has no mouse reporting", () => {
    const down = arm(makeTerm("none")).find((e) => e.type === "mousedown");
    expect(down?.shiftKey).toBe(false);
    expect(down?.altKey).toBe(false);
  });

  it("forces selection with the platform modifier when the app owns the mouse", () => {
    const down = arm(makeTerm("drag")).find((e) => e.type === "mousedown");
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    expect(down?.shiftKey).toBe(!isMac);
    expect(down?.altKey).toBe(isMac);
  });

  it("does not arm when the touch moves before the hold elapses", () => {
    dispose = registerTouchSelect(makeTerm("none") as unknown as Terminal, el, vi.fn());
    const seen = mouseRecorder(el);
    el.dispatchEvent(touchEvent("touchstart", 40, 80));
    el.dispatchEvent(touchEvent("touchmove", 60, 80));
    vi.advanceTimersByTime(600);
    expect(seen.filter((e) => e.type === "mousedown")).toHaveLength(0);
  });

  it("hides selection drags from other touch handlers and copies on release", async () => {
    const onCopied = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const term = makeTerm("none", "selected text");
    dispose = registerTouchSelect(term as unknown as Terminal, el, onCopied);
    mouseRecorder(el);

    const documentTouchMoves: Event[] = [];
    document.addEventListener("touchmove", (e) => documentTouchMoves.push(e));

    el.dispatchEvent(touchEvent("touchstart", 40, 80));
    vi.advanceTimersByTime(600);

    const drag = touchEvent("touchmove", 120, 120);
    el.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
    expect(documentTouchMoves).toHaveLength(0);

    el.dispatchEvent(touchEvent("touchend", 120, 120));
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith("selected text");
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it("does not copy when the selection is only whitespace", () => {
    const onCopied = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    dispose = registerTouchSelect(makeTerm("none", "  \n ") as unknown as Terminal, el, onCopied);
    el.dispatchEvent(touchEvent("touchstart", 40, 80));
    vi.advanceTimersByTime(600);
    el.dispatchEvent(touchEvent("touchmove", 120, 120));
    el.dispatchEvent(touchEvent("touchend", 120, 120));
    expect(writeText).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
  });
});
