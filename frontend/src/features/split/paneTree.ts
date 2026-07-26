/**
 * Binary-tree pane layout. A leaf hosts one session (or is empty); a split
 * divides its area between two children along an axis at a draggable ratio.
 */

export type SplitDir = "h" | "v";

export type PaneNode =
  | { readonly kind: "leaf"; readonly id: string; readonly sessionId: string | null }
  | {
      readonly kind: "split";
      readonly id: string;
      /** "h" = children side by side (left/right); "v" = stacked (top/bottom). */
      readonly dir: SplitDir;
      /** Fraction of the area given to `first`, 0..1. */
      readonly ratio: number;
      readonly first: PaneNode;
      readonly second: PaneNode;
    };

export const DEFAULT_RATIO = 0.5;
/** Divider drag limits so neither pane collapses to nothing. */
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;

let fallbackPaneId = 0;

/**
 * Use UUIDs so pane ids created after a reload cannot reuse ids restored from
 * the persisted layout. randomUUID is secure-context-only, so retain a
 * timestamped fallback for plain-HTTP LAN deployments.
 */
export function newPaneId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return `pane-${crypto.randomUUID()}`;
  fallbackPaneId += 1;
  return `pane-${Date.now().toString(36)}-${fallbackPaneId}-${Math.random().toString(36).slice(2)}`;
}

export function leaf(sessionId: string | null = null): PaneNode {
  return { kind: "leaf", id: newPaneId(), sessionId };
}

/** Every session id currently placed in the tree. */
export function placedSessionIds(node: PaneNode): ReadonlySet<string> {
  const out = new Set<string>();
  const walk = (n: PaneNode): void => {
    if (n.kind === "leaf") {
      if (n.sessionId !== null) out.add(n.sessionId);
      return;
    }
    walk(n.first);
    walk(n.second);
  };
  walk(node);
  return out;
}

export function findLeaf(node: PaneNode, id: string): PaneNode | null {
  if (node.kind === "leaf") return node.id === id ? node : null;
  return findLeaf(node.first, id) ?? findLeaf(node.second, id);
}

/** Replace the node with the given id; returns a new tree (or the same ref if unchanged). */
export function replaceNode(root: PaneNode, id: string, next: PaneNode): PaneNode {
  if (root.id === id) return next;
  if (root.kind === "leaf") return root;
  const first = replaceNode(root.first, id, next);
  const second = replaceNode(root.second, id, next);
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

/** Remove the node with the given id; its sibling is promoted into the parent's place. */
export function removeNode(root: PaneNode, id: string): PaneNode | null {
  if (root.id === id) return null;
  if (root.kind === "leaf") return root;
  if (root.first.id === id) return root.second;
  if (root.second.id === id) return root.first;
  const first = removeNode(root.first, id);
  if (first !== root.first) return first === null ? root.second : { ...root, first };
  const second = removeNode(root.second, id);
  if (second !== root.second) return second === null ? root.first : { ...root, second };
  return root;
}

/** Set the session hosted by a leaf. */
export function setLeafSession(root: PaneNode, leafId: string, sessionId: string | null): PaneNode {
  const target = findLeaf(root, leafId);
  if (!target || target.kind !== "leaf") return root;
  return replaceNode(root, leafId, { ...target, sessionId });
}

/** Split a leaf into a split node whose `first` keeps the leaf's session. */
export function splitLeaf(root: PaneNode, leafId: string, dir: SplitDir): PaneNode {
  const target = findLeaf(root, leafId);
  if (!target || target.kind !== "leaf") return root;
  const split: PaneNode = {
    kind: "split",
    id: newPaneId(),
    dir,
    ratio: DEFAULT_RATIO,
    first: target,
    second: leaf(null),
  };
  return replaceNode(root, leafId, split);
}

/** Update the ratio of a split node, clamped to a sane range. */
export function setRatio(root: PaneNode, splitId: string, ratio: number): PaneNode {
  const clamped = Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio));
  const walk = (n: PaneNode): PaneNode => {
    if (n.kind === "leaf") return n;
    if (n.id === splitId) return { ...n, ratio: clamped };
    const first = walk(n.first);
    const second = walk(n.second);
    if (first === n.first && second === n.second) return n;
    return { ...n, first, second };
  };
  return walk(root);
}

/** Un-place a session everywhere it appears (used when the session is deleted). */
export function removeSession(root: PaneNode, sessionId: string): PaneNode {
  const walk = (n: PaneNode): PaneNode => {
    if (n.kind === "leaf") {
      return n.sessionId === sessionId ? { ...n, sessionId: null } : n;
    }
    const first = walk(n.first);
    const second = walk(n.second);
    if (first === n.first && second === n.second) return n;
    return { ...n, first, second };
  };
  return walk(root);
}

/** The id of the first leaf in document order (a fallback focus target). */
export function firstLeafId(node: PaneNode): string {
  let cur = node;
  while (cur.kind === "split") cur = cur.first;
  return cur.id;
}

