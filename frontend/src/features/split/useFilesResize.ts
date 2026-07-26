import { useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

const FILES_DEFAULT_W = 320;
const FILES_MIN_W = 220;
const RESIZE_STEP = 24;
const FILES_WIDTH_KEY = "th-files-w";
/** The 5px resize handle straddles the panel edge; this many px sit outside it. */
export const HANDLE_OUTSET = 3;

function clampFilesWidth(w: number): number {
  return Math.max(FILES_MIN_W, w);
}

function storedFilesWidth(): number {
  const raw = window.localStorage.getItem(FILES_WIDTH_KEY);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? clampFilesWidth(parsed) : FILES_DEFAULT_W;
}

export function useFilesResize() {
  const [filesWidth, setFilesWidth] = useState(storedFilesWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ readonly startX: number; readonly startWidth: number } | null>(null);

  const onResizePointerDown = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    ev.preventDefault();
    dragRef.current = { startX: ev.clientX, startWidth: filesWidth };
    setResizing(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onResizePointerMove = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    // Panel is right-anchored: dragging left grows it.
    const next = clampFilesWidth(drag.startWidth + (drag.startX - ev.clientX));
    setFilesWidth(next);
  };

  const endResize = (ev: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setResizing(false);
    // Recompute from the drag origin so the persisted width matches the final
    // pointer position exactly (the filesWidth state lags the last move).
    const final = clampFilesWidth(drag.startWidth + (drag.startX - ev.clientX));
    setFilesWidth(final);
    window.localStorage.setItem(FILES_WIDTH_KEY, String(final));
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const resetFilesWidth = (): void => {
    setFilesWidth(FILES_DEFAULT_W);
    window.localStorage.setItem(FILES_WIDTH_KEY, String(FILES_DEFAULT_W));
  };

  const onResizeKeyDown = (ev: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Panel is right-anchored: ArrowLeft grows, ArrowRight shrinks.
    let delta = 0;
    if (ev.key === "ArrowLeft") delta = RESIZE_STEP;
    else if (ev.key === "ArrowRight") delta = -RESIZE_STEP;
    else if (ev.key === "Home") {
      ev.preventDefault();
      resetFilesWidth();
      return;
    } else {
      return;
    }
    ev.preventDefault();
    const next = clampFilesWidth(filesWidth + delta);
    setFilesWidth(next);
    window.localStorage.setItem(FILES_WIDTH_KEY, String(next));
  };

  return {
    filesWidth,
    resizing,
    onResizePointerDown,
    onResizePointerMove,
    endResize,
    resetFilesWidth,
    onResizeKeyDown,
  };
}
