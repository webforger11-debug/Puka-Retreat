import { APP_CONFIG } from "./constants.js";

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function login(username, password) {
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");
  const [usernameHash, passwordHash] = await Promise.all([
    sha256Hex(cleanUsername),
    sha256Hex(cleanPassword)
  ]);

  const valid =
    usernameHash === APP_CONFIG.adminUsernameHash &&
    passwordHash === APP_CONFIG.adminPasswordHash;

  if (!valid) {
    return false;
  }

  const session = {
    usernameHash,
    loggedAt: new Date().toISOString()
  };

  localStorage.setItem(APP_CONFIG.authKey, JSON.stringify(session));
  return true;
}

export function logout() {
  localStorage.removeItem(APP_CONFIG.authKey);
}

export function isAuthenticated() {
  const raw = localStorage.getItem(APP_CONFIG.authKey);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed && parsed.usernameHash === APP_CONFIG.adminUsernameHash);
  } catch {
    return false;
  }
}

export function ensureAuthenticated() {
  if (!isAuthenticated()) {
    window.location.href = "index.html";
  }
}

export function redirectToDashboardIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = "dashboard.html";
  }
}
