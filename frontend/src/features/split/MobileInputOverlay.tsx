import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import { IconArrowUp, IconKeyboard } from "../../components/icons";

export interface MobileInputOverlayProps {
  /** Ref the parent uses to focus this textarea from a tap handler. */
  readonly inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  readonly termRef: MutableRefObject<Terminal | null>;
  /** When this pane loses focus, blur the overlay so the keyboard dismisses. */
  readonly focused: boolean;
  /** Whether the special-keys panel is expanded (owned by the pane so the
   *  terminal can re-fit around it). */
  readonly keysOpen: boolean;
  readonly onKeysToggle: () => void;
}

/** Non-printable keys forwarded to the terminal as escape sequences.
 *  Backspace/Delete/arrows/Home/End are intentionally omitted: in a
 *  chat-style bar they edit the textarea, not the remote PTY. */
const KEY_SEQUENCES: Readonly<Record<string, string>> = {
  Escape: "\x1b",
  Tab: "\t",
};

interface ExtraKey {
  readonly label: string;
  readonly seq: string;
}

/** Keys a mobile keyboard cannot produce. ^C/^D interrupt/EOF, ^Z suspends,
 *  ^L clears the screen, ^B is the tmux prefix, ^A/^E/^U/^K/^W/^R are
 *  readline line-editing, the rest move the cursor or page the scrollback. */
const EXTRA_KEYS: readonly ExtraKey[] = [
  { label: "ESC", seq: "\x1b" },
  { label: "TAB", seq: "\t" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "→", seq: "\x1b[C" },
  { label: "←", seq: "\x1b[D" },
  { label: "^C", seq: "\x03" },
  { label: "^D", seq: "\x04" },
  { label: "^Z", seq: "\x1a" },
  { label: "^L", seq: "\x0c" },
  { label: "^B", seq: "\x02" },
  { label: "^A", seq: "\x01" },
  { label: "^E", seq: "\x05" },
  { label: "^U", seq: "\x15" },
  { label: "^K", seq: "\x0b" },
  { label: "^W", seq: "\x17" },
  { label: "^R", seq: "\x12" },
  { label: "HOME", seq: "\x1b[H" },
  { label: "END", seq: "\x1b[F" },
  { label: "PGUP", seq: "\x1b[5~" },
  { label: "PGDN", seq: "\x1b[6~" },
];

/**
 * Chat-style input bar for mobile terminals.
 *
 * Why a separate textarea instead of xterm's own:
 *  - xterm's helper textarea is invisible/offscreen; iOS only raises the
 *    software keyboard for a visible, real-sized input focused inside a
 *    user gesture.
 *  - xterm's CompositionHelper reads/writes its textarea during input,
 *    which resets the iOS Korean IME (it never fires composition events —
 *    WebKit bug 274700 — so anything that touches the field mid-composition
 *    drops the syllable being built).
 *
 * Why Korean "just works" here:
 *  iOS Safari composes Korean internally at the text-input layer — the
 *  field shows combined syllables even though no composition events reach
 *  JS. This only holds while NOTHING touches the textarea during typing:
 *    - no React re-render reconciling it (uncontrolled, no value prop)
 *    - no DOM reads/writes on it (the old auto-grow read scrollHeight and
 *      set style.height on every keystroke; both reset the IME state and
 *      were the actual cause of uncombined jamo)
 *  So this component is deliberately dumb: type, then press send.
 *
 * The collapsible key panel above the bar covers keys mobile keyboards
 *  lack (ESC, arrows, Ctrl-combos, tmux prefix). Keys send on touch-down
 *  for immediacy and never touch the textarea, so Korean composition in
 *  progress is not disturbed.
 */
export function MobileInputOverlay({
  inputRef,
  termRef,
  focused,
  keysOpen,
  onKeysToggle,
}: MobileInputOverlayProps) {
  const send = useCallback(
    (data: string) => {
      if (data.length > 0) termRef.current?.input(data, true);
    },
    [termRef],
  );

  /** Send the textarea's value to the terminal, then reset the bar.
   *  Newlines become carriage returns; clearing resets the mobile IME so
   *  the next input composes from a clean state. */
  const flush = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    if (el.value.length > 0) send(el.value.replace(/\n/g, "\r"));
    el.value = "";
  }, [inputRef, send]);

  const onSend = useCallback(() => {
    flush();
    send("\r");
    inputRef.current?.focus(); // keep the keyboard up for the next command
  }, [flush, send, inputRef]);

  /* Flush pending text when the pane loses focus, then drop the keyboard. */
  useEffect(() => {
    if (!focused) {
      flush();
      inputRef.current?.blur();
    }
  }, [focused, flush, inputRef]);

  return (
    <div className="th-mobile-inputbar">
      {keysOpen && (
        <div id="th-mobile-keys" className="th-mobile-keys" role="toolbar" aria-label="Special keys">
          {EXTRA_KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              className={`th-mobile-key${key.label.startsWith("^") ? " th-mobile-key--ctrl" : ""}`}
              onPointerDown={(ev) => {
                // Send on touch-down for immediacy; preventDefault keeps the
                // software keyboard from dismissing on the tap.
                ev.preventDefault();
                send(key.seq);
              }}
            >
              {key.label}
            </button>
          ))}
        </div>
      )}
      <div className="th-mobile-inputrow">
        <button
          type="button"
          className={`th-mobile-keys-toggle${keysOpen ? " th-mobile-keys-toggle--on" : ""}`}
          aria-label="Toggle special keys"
          aria-expanded={keysOpen}
          aria-controls="th-mobile-keys"
          onClick={onKeysToggle}
        >
          <IconKeyboard size={18} />
        </button>
        <textarea
          ref={inputRef}
          className="th-mobile-input"
          aria-label="Terminal input"
          placeholder="입력…"
          rows={1}
          enterKeyHint="enter"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onKeyDown={(ev) => {
            if (ev.nativeEvent.isComposing) return;
            const seq = KEY_SEQUENCES[ev.key];
            if (seq !== undefined) {
              ev.preventDefault();
              send(seq);
            }
          }}
        />
        <button
          type="button"
          className="th-mobile-send"
          aria-label="Send to terminal"
          onClick={onSend}
        >
          <IconArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}
