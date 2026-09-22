// centralise les appels auth et l’URL API
export const API_BASE = import.meta.env.VITE_API_BASE ?? window.location.origin;

async function extractErrorMessage(res: Response, fallback: string) {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      const message =
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.error === "string" && data.error) ||
        (typeof data?.code === "string" && data.code) ||
        "";
      if (message) {
        return `${fallback} (${message})`;
      }
    } else {
      const text = (await res.text()).trim();
      if (text) {
        return `${fallback} (${text})`;
      }
    }
  } catch {
    // ignore parsing errors and fallback to generic message below
  }

  return `${fallback} (HTTP ${res.status})`;
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) return null;
  return res.json(); // { user: { id, email, name } } ou { user: null }
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Login failed"));
  return res.json();
}

export async function register(displayName: string, email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, email, password }),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Register failed"));
  return res.json();
}

export async function logout() {
  const res = await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Logout failed"));
}

export async function updateAccount(email: string, playerName: string, currentPassword?: string) {
  const res = await fetch(`${API_BASE}/auth/me/account`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, playerName, currentPassword }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { error?: string } | null;
    const messages: Record<string, string> = {
      "current-password-required": "Saisissez votre mot de passe actuel pour modifier votre adresse e-mail.",
      "invalid-current-password": "Le mot de passe actuel est incorrect.",
      "missing-password": "Aucun mot de passe n’est associé à ce compte.",
      "email-taken": "Cette adresse e-mail est déjà utilisée.",
      "verification-email-unavailable": "L’e-mail de vérification n’a pas pu être envoyé. Réessayez plus tard.",
    };
    throw new Error(messages[payload?.error ?? ""] ?? "Les informations du compte n’ont pas pu être enregistrées.");
  }
  return res.json() as Promise<{
    ok: boolean;
    emailVerificationSent?: boolean;
    pendingEmail?: string | null;
    user?: { email?: string | null; playerName?: string | null };
  }>;
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/me/password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res, "Update password failed"));
  return res.json();
}
