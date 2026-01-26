export const AUTH_UPDATED_EVENT = "auth-updated";

export function notifyAuthUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
}