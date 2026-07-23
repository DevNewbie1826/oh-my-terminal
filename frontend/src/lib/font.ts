/** Terminal font presets with Korean-capable coding fonts. */

export type FontId = "system" | "nanum" | "jetbrains" | "fira" | "ibmplex" | "sourcecode";

export interface FontPreset {
  readonly id: FontId;
  /** i18n key for the display label. */
  readonly labelKey: string;
  /** CSS font-family stack. Korean glyphs fall through to a CJK monospace face. */
  readonly stack: string;
}

/** Korean monospace face for CJK glyphs (Nanum Gothic Coding is the only Korean
 * coding font on Google Fonts). */
const KOREAN_MONO = '"Nanum Gothic Coding"';
/** Trailing Korean sans + generic monospace for any remaining glyphs. */
const KOREAN_SANS_TAIL = '"Nanum Gothic", "Malgun Gothic", "Apple SD Gothic Neo", monospace';

export const SYSTEM_FONT_STACK = `ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, ${KOREAN_MONO}, ${KOREAN_SANS_TAIL}`;

export const FONT_PRESETS: readonly FontPreset[] = [
  {
    id: "system",
    labelKey: "font.system",
    stack: SYSTEM_FONT_STACK,
  },
  {
    id: "nanum",
    labelKey: "font.nanum",
    stack: `${KOREAN_MONO}, ${KOREAN_SANS_TAIL}`,
  },
  {
    id: "jetbrains",
    labelKey: "font.jetbrains",
    stack: `"JetBrains Mono", ${KOREAN_MONO}, ${KOREAN_SANS_TAIL}`,
  },
  {
    id: "fira",
    labelKey: "font.fira",
    stack: `"Fira Code", ${KOREAN_MONO}, ${KOREAN_SANS_TAIL}`,
  },
  {
    id: "ibmplex",
    labelKey: "font.ibmplex",
    stack: `"IBM Plex Mono", ${KOREAN_MONO}, ${KOREAN_SANS_TAIL}`,
  },
  {
    id: "sourcecode",
    labelKey: "font.sourcecode",
    stack: `"Source Code Pro", ${KOREAN_MONO}, ${KOREAN_SANS_TAIL}`,
  },
];

const STORAGE_KEY = "th-font";

export function detectFont(): FontId {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const match = FONT_PRESETS.find((p) => p.id === stored);
  return match ? match.id : "system";
}

export function persistFont(id: FontId): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
