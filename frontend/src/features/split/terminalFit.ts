import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

/** Shape of xterm's private `_core` render internals — narrowed at runtime. */
interface XtermCoreInternals {
  _renderService: {
    dimensions: {
      css: { cell: { width: number; height: number } };
    };
    clear: () => void;
  };
}

/**
 * Reach xterm's private `_core._renderService`, narrowing the shape at
 * runtime so an xterm internals change degrades to a plain FitAddon fit
 * instead of throwing. Returns undefined when the shape is absent.
 */
function xtermCore(t: Terminal): XtermCoreInternals | undefined {
  const core: unknown = (t as unknown as { readonly _core?: unknown })._core;
  if (
    typeof core === "object" &&
    core !== null &&
    "_renderService" in core &&
    typeof core._renderService === "object" &&
    core._renderService !== null &&
    "dimensions" in core._renderService &&
    typeof core._renderService.dimensions === "object" &&
    core._renderService.dimensions !== null &&
    "clear" in core._renderService &&
    typeof core._renderService.clear === "function"
  ) {
    return core as XtermCoreInternals;
  }
  return undefined;
}

const MIN_COLS = 2;
const MIN_ROWS = 1;

/**
 * Fit the terminal to fill its pane width.
 *
 * xterm's FitAddon subtracts a reserved scrollbar width from the available
 * width, but on overlay-scrollbar platforms (iOS, Android, macOS) the
 * scrollbar is a floating overlay that takes no layout space — so the
 * subtraction under-fits the grid by ~2 cols. We bypass that phantom
 * reservation by computing cols/rows directly from the container and the
 * render service's cell dimensions, falling back to a plain fit when xterm's
 * internals are unavailable.
 */
export function fitFullWidth(t: Terminal, f: FitAddon): boolean {
  const fallback = (): boolean => {
    try {
      f.fit();
      return true;
    } catch {
      return false;
    }
  };
  const core = xtermCore(t);
  const parent = t.element?.parentElement;
  if (!core || !parent) return fallback();
  const dims = core._renderService.dimensions;
  if (dims.css.cell.width === 0 || dims.css.cell.height === 0) return fallback();
  const parentStyle = window.getComputedStyle(parent);
  const elStyle = window.getComputedStyle(t.element);
  const padH = parseFloat(elStyle.paddingLeft) + parseFloat(elStyle.paddingRight);
  const padV = parseFloat(elStyle.paddingTop) + parseFloat(elStyle.paddingBottom);
  const availW = parseFloat(parentStyle.width) - padH;
  const availH = parseFloat(parentStyle.height) - padV;
  const cols = Math.max(MIN_COLS, Math.floor(availW / dims.css.cell.width));
  const rows = Math.max(MIN_ROWS, Math.floor(availH / dims.css.cell.height));
  if (t.cols !== cols || t.rows !== rows) {
    core._renderService.clear();
    t.resize(cols, rows);
  }
  return true;
}
