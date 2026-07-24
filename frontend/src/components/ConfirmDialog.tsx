import { useCallback, useRef, useState } from "react";
import { ModalDialog } from "./ModalDialog";
import type { Translate } from "../i18n";

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  /** Confirm button label. */
  readonly confirmLabel?: string;
  /** Cancel button label. */
  readonly cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  readonly danger?: boolean;
}

export interface ConfirmApi {
  /** Show the dialog; resolves true on confirm, false on cancel/Escape. */
  readonly confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** The dialog element — render it once near the app root. */
  readonly dialog: React.ReactNode;
}

/**
 * Imperative confirmation dialog styled like the app's modals, replacing the
 * native `window.confirm`. Mirrors the `notify()` toast pattern: call
 * `confirm(...)` and await the boolean; render `dialog` once in the tree.
 * Takes `t` as a parameter because callers (App) sit outside the i18n provider.
 */
export function useConfirm(t: Translate): ConfirmApi {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        // A second confirm while one is open cancels the first (resolves false).
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setState(opts);
      }),
    [],
  );

  const dialog = (
    <ModalDialog
      open={state !== null}
      onClose={() => settle(false)}
      labelledBy="th-confirm-title"
      closeLabel={t("common.close")}
    >
      {state && (
        <div className="th-confirm">
          <h2 id="th-confirm-title" className="th-confirm-title">{state.title}</h2>
          <p className="th-confirm-message">{state.message}</p>
          <div className="th-confirm-actions">
            <button
              type="button"
              className="th-btn th-btn--ghost"
              onClick={() => settle(false)}
            >
              {state.cancelLabel ?? t("wizard.cancel")}
            </button>
            <button
              type="button"
              className={`th-btn ${state.danger ? "th-btn--danger" : "th-btn--primary"}`}
              onClick={() => settle(true)}
            >
              {state.confirmLabel ?? t("confirm.ok")}
            </button>
          </div>
        </div>
      )}
    </ModalDialog>
  );

  return { confirm, dialog };
}
