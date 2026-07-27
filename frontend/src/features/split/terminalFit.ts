import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

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
 * terminal's public cell dimensions, falling back to a plain fit until xterm
 * has measured the cells.
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
  const dims = t.dimensions;
  const parent = t.element?.parentElement;
  if (!dims || !parent) return fallback();
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
    t.resize(cols, rows);
  }
  return true;
}
