import { Terminal } from "@xterm/xterm";

export function registerTerminalClipboard(term: Terminal) {
  return term.parser.registerOscHandler(52, async (data) => {
    try {
      const separator = data.indexOf(";");
      if (separator < 0) return true;
      const payload = data.slice(separator + 1);
      if (payload === "?") return true;
      // atob returns Latin-1, so decode bytes as UTF-8 to preserve CJK text.
      const encoded = atob(payload);
      const bytes = Uint8Array.from(encoded, (char) => char.charCodeAt(0));
      const text = new TextDecoder().decode(bytes);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // The Clipboard API is unavailable when a LAN page is served over HTTP.
        const textarea = document.createElement("textarea");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.value = text;
        document.body.append(textarea);
        try {
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
        } finally {
          textarea.remove();
        }
      }
    } catch (error) {
      // Clipboard writes are best-effort; a failed write must never reject
      // the parser callback or the terminal breaks on every tmux copy.
      console.debug("osc52 clipboard write failed", error);
    }
    return true;
  });
}
