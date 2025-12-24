// src/lib/session.ts

export const SESSION_KEY = "waianda_session";

export type UserSession = {
  name: string;
  userType?: string | null;
  userTypeColor?: string | null;
};

export function getHubLandingPath(userType?: string | null) {
  const normalized = (userType || "").toLowerCase();
  if (["volunteer", "admin"].includes(normalized)) {
    return "/hub";
  }
  return "/hub/dashboard";
}

export function saveSession(session: UserSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
