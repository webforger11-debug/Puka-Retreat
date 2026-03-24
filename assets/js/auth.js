import { APP_CONFIG } from "./constants.js";

export function login(username, password) {
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");

  const valid =
    cleanUsername === APP_CONFIG.adminUsername &&
    cleanPassword === APP_CONFIG.adminPassword;

  if (!valid) {
    return false;
  }

  const session = {
    username: cleanUsername,
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
    return Boolean(parsed && parsed.username === APP_CONFIG.adminUsername);
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
