import { apiVoid } from "../../lib/api";

export async function login(password: string): Promise<void> {
  await apiVoid("/api/login", { method: "POST", body: { password } });
}

export async function logout(): Promise<void> {
  await apiVoid("/api/logout", { method: "POST" });
}

export async function checkAuth(): Promise<boolean> {
  try {
    await apiVoid("/api/auth/check");
    return true;
  } catch {
    return false;
  }
}
