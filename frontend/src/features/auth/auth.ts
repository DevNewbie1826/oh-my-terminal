import { apiVoid } from "../../lib/api";

/** POST /api/login — sets HttpOnly session cookie on success. */
export async function login(password: string): Promise<void> {
  await apiVoid("/api/login", { method: "POST", body: { password } });
}

/** POST /api/logout — clears the session cookie. */
export async function logout(): Promise<void> {
  await apiVoid("/api/logout", { method: "POST" });
}

/** GET /api/auth/check — true when the cookie is valid. */
export async function checkAuth(): Promise<boolean> {
  try {
    await apiVoid("/api/auth/check");
    return true;
  } catch {
    return false;
  }
}
