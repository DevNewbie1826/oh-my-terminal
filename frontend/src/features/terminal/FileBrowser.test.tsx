import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nContext, translate } from "../../i18n";
import type { I18nValue } from "../../i18n";
import { FileBrowser } from "./FileBrowser";
import { fsList, uploadFiles } from "./terminal";
import type { FsList } from "./terminal";

vi.mock("./terminal", () => ({ fsList: vi.fn(), uploadFiles: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function selectFiles(input: HTMLInputElement, files: readonly File[]): void {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  Object.defineProperty(input, "value", {
    configurable: true,
    writable: true,
    value: `C:\\fakepath\\${files[0]?.name ?? ""}`,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function dropFiles(target: HTMLElement, files: readonly File[]): void {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  target.dispatchEvent(event);
}

const i18n: I18nValue = {
  lang: "en",
  setLang: () => undefined,
  font: "system",
  setFont: () => undefined,
  fontSize: 13,
  setFontSize: () => undefined,
  t: (key, vars) => translate("en", key, vars),
};

const listing: FsList = { path: "/work", parent: null, entries: [] };

describe("FileBrowser uploads", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(fsList).mockResolvedValue(listing);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <I18nContext.Provider value={i18n}>
          <FileBrowser
            path="/work"
            wsId="workspace-1"
            tmId="terminal-1"
            width={320}
            onClose={() => undefined}
            notify={() => undefined}
          />
        </I18nContext.Provider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uploads selected files, prevents concurrent drops, and clears the picker", async () => {
    const pendingUpload = deferred<void>();
    vi.mocked(uploadFiles)
      .mockReturnValueOnce(pendingUpload.promise)
      .mockResolvedValueOnce(undefined);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const choose = container.querySelector<HTMLButtonElement>(".th-files-choose");
    const panel = container.querySelector<HTMLDivElement>(".th-files");
    if (!input || !choose || !panel) throw new Error("File upload controls are missing");

    expect(input.multiple).toBe(true);
    const openPicker = vi.spyOn(input, "click");
    act(() => {
      choose.click();
    });
    expect(openPicker).toHaveBeenCalledOnce();

    const first = new File(["first"], "first.txt", { type: "text/plain" });
    act(() => {
      selectFiles(input, [first]);
    });
    expect(uploadFiles).toHaveBeenCalledExactlyOnceWith("workspace-1", "terminal-1", [first]);
    expect(choose.disabled).toBe(true);
    expect(input.value).toBe("C:\\fakepath\\first.txt");

    act(() => {
      dropFiles(panel, [new File(["blocked"], "blocked.txt")]);
    });
    expect(uploadFiles).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingUpload.resolve();
    });
    expect(input.value).toBe("");
    expect(choose.disabled).toBe(false);

    const dropped = new File(["dropped"], "dropped.txt", { type: "text/plain" });
    act(() => {
      dropFiles(panel, [dropped]);
    });
    expect(uploadFiles).toHaveBeenLastCalledWith("workspace-1", "terminal-1", [dropped]);
    await act(async () => {});
  });

  it("clears the picker after an upload error", async () => {
    vi.mocked(uploadFiles).mockRejectedValueOnce(new Error("Upload failed"));

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const choose = container.querySelector<HTMLButtonElement>(".th-files-choose");
    if (!input || !choose) throw new Error("File upload controls are missing");

    act(() => {
      selectFiles(input, [new File(["failed"], "failed.txt")]);
    });
    await act(async () => {});

    expect(input.value).toBe("");
    expect(choose.disabled).toBe(false);
  });
});
