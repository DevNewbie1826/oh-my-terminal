/** Join a base path with a child name, ensuring exactly one separator. */
export function joinPath(base: string, name: string): string {
  if (base.length === 0) return `/${name}`;
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}
