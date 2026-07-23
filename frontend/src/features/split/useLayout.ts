import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_RATIO,
  findLeaf,
  firstLeafId,
  leaf,
  placedSessionIds,
  removeNode,
  removeSession,
  setLeafSession,
  setRatio,
  splitLeaf,
} from "./paneTree";
import type { PaneNode, SplitDir } from "./paneTree";
import { getLayout, putLayout } from "./layout";

export interface LayoutApi {
  readonly root: PaneNode;
  readonly focusedPaneId: string;
  readonly placed: ReadonlySet<string>;
  readonly focusPane: (paneId: string) => void;
  readonly assignSession: (paneId: string, wsId: string, tmId: string) => void;
  readonly split: (paneId: string, dir: SplitDir) => void;
  readonly closePane: (paneId: string) => void;
  readonly changeRatio: (splitId: string, ratio: number) => void;
  readonly unplaceSession: (tmId: string) => void;
  readonly focusSession: (tmId: string) => boolean;
}

/** Coalesce rapid mutations (drag, splits) into one PUT. */
const PERSIST_DEBOUNCE_MS = 250;

/**
 * Owns the pane-tree layout: in-memory state, server persistence, and the
 * mutation actions the UI drives. The tree is a single source of truth; the
 * server blob is a mirror restored on load.
 *
 * A ref mirrors the committed root so actions compute the next tree
 * synchronously — never inside a setState updater, which React may call
 * multiple times.
 */
export function useLayout(): LayoutApi {
  const [root, setRoot] = useState<PaneNode>(() => leaf(null));
  const [focusedPaneId, setFocusedPaneId] = useState<string>(() => firstLeafId(root));
  const [placed, setPlaced] = useState<ReadonlySet<string>>(() => new Set());
  const rootRef = useRef(root);
  const saveTimer = useRef(0);

  // Restore the persisted layout once on mount.
  useEffect(() => {
    let cancelled = false;
    void getLayout()
      .then((blob) => {
        if (cancelled || !blob) return;
        const parsed = parseLayout(blob);
        if (!parsed) return;
        rootRef.current = parsed;
        setRoot(parsed);
        setFocusedPaneId(firstLeafId(parsed));
        setPlaced(placedSessionIds(parsed));
      })
      .catch(() => {
        /* no persisted layout yet — start fresh */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: PaneNode) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void putLayout(next).catch(() => {
        /* persistence is best-effort; the session still works in-memory */
      });
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  /** Apply a new root: update ref + state + derived placed set, then persist. */
  const commit = useCallback(
    (next: PaneNode) => {
      rootRef.current = next;
      setRoot(next);
      setPlaced(placedSessionIds(next));
      persist(next);
    },
    [persist],
  );

  const focusPane = useCallback((paneId: string) => {
    setFocusedPaneId(paneId);
  }, []);

  const assignSession = useCallback(
    (paneId: string, _wsId: string, tmId: string) => {
      // A session lives in exactly one pane; unplace it elsewhere first.
      const cleared = removeSession(rootRef.current, tmId);
      commit(setLeafSession(cleared, paneId, tmId));
      setFocusedPaneId(paneId);
    },
    [commit],
  );

  const split = useCallback(
    (paneId: string, dir: SplitDir) => {
      commit(splitLeaf(rootRef.current, paneId, dir));
    },
    [commit],
  );

  const closePane = useCallback(
    (paneId: string) => {
      const next = removeNode(rootRef.current, paneId) ?? leaf(null);
      commit(next);
      setFocusedPaneId((cur) => (findLeaf(next, cur) ? cur : firstLeafId(next)));
    },
    [commit],
  );

  const changeRatio = useCallback(
    (splitId: string, ratio: number) => {
      commit(setRatio(rootRef.current, splitId, ratio));
    },
    [commit],
  );

  const unplaceSession = useCallback(
    (tmId: string) => {
      commit(removeSession(rootRef.current, tmId));
    },
    [commit],
  );

  const focusSession = useCallback((tmId: string): boolean => {
    let found = "";
    const walk = (n: PaneNode): void => {
      if (n.kind === "leaf") {
        if (n.sessionId === tmId) found = n.id;
        return;
      }
      walk(n.first);
      walk(n.second);
    };
    walk(rootRef.current);
    if (found) setFocusedPaneId(found);
    return found.length > 0;
  }, []);

  return {
    root,
    focusedPaneId,
    placed,
    focusPane,
    assignSession,
    split,
    closePane,
    changeRatio,
    unplaceSession,
    focusSession,
  };
}

function readString(obj: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function readNumber(obj: Readonly<Record<string, unknown>>, key: string): number | null {
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === "object" && v !== null;
}

/** Validate and normalize an untrusted persisted blob into a PaneNode tree. */
function parseLayout(blob: unknown): PaneNode | null {
  if (!isRecord(blob)) return null;
  const kind = blob["kind"];
  const id = readString(blob, "id");
  if (id === null) return null;
  if (kind === "leaf") {
    return { kind: "leaf", id, sessionId: readString(blob, "sessionId") };
  }
  if (kind === "split") {
    const dir = blob["dir"];
    if (dir !== "h" && dir !== "v") return null;
    const ratio = readNumber(blob, "ratio") ?? DEFAULT_RATIO;
    const first = parseLayout(blob["first"]);
    const second = parseLayout(blob["second"]);
    if (!first || !second) return null;
    return { kind: "split", id, dir, ratio, first, second };
  }
  return null;
}
