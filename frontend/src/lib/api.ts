export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body: unknown = await res.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.length > 0
    ) {
      message = body.error;
    }
  } catch {
    /* non-JSON error body — keep status line */
  }
  return new ApiError(res.status, message);
}

export interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

function buildInit(options: RequestOptions): RequestInit {
  const init: RequestInit = { method: options.method ?? "GET", credentials: "same-origin" };
  if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) init.signal = options.signal;
  return init;
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(path, buildInit(options));
  if (!res.ok) throw await parseError(res);
  return JSON.parse(await res.text());
}

export async function apiVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const res = await fetch(path, buildInit(options));
  if (!res.ok) throw await parseError(res);
}

export async function apiRaw(
  path: string,
  options: RequestOptions & { readonly body: BodyInit },
): Promise<Response> {
  const init: RequestInit = {
    method: options.method ?? "POST",
    body: options.body,
    credentials: "same-origin",
  };
  if (options.signal) init.signal = options.signal;
  const res = await fetch(path, init);
  if (!res.ok) throw await parseError(res);
  return res;
}

export function qs(params: Readonly<Record<string, string | undefined>>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) usp.set(key, value);
  }
  const s = usp.toString();
  return s.length > 0 ? `?${s}` : "";
}
