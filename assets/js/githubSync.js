import { APP_CONFIG } from "./constants.js";

function cleanConfig(config) {
  return {
    owner: String(config.owner || "").trim(),
    repo: String(config.repo || "").trim(),
    branch: String(config.branch || "main").trim(),
    path: String(config.path || APP_CONFIG.seedDataFile).trim()
  };
}

function encodeContentPath(pathValue) {
  return String(pathValue)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function fromBase64Utf8(value) {
  const binary = atob(String(value).replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildContentsUrl(config) {
  const encodedPath = encodeContentPath(config.path);
  return `${APP_CONFIG.githubApiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`;
}

async function parseApiResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(payload, fallback) {
  if (payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

export function inferGithubPagesConfig() {
  const host = window.location.hostname || "";
  const pathSegments = window.location.pathname.split("/").filter(Boolean);

  if (!host.endsWith(".github.io")) {
    return cleanConfig({
      owner: "",
      repo: "",
      branch: "main",
      path: APP_CONFIG.seedDataFile
    });
  }

  const owner = host.replace(".github.io", "");
  const repo = pathSegments.length > 0 ? pathSegments[0] : `${owner}.github.io`;

  return cleanConfig({
    owner,
    repo,
    branch: "main",
    path: APP_CONFIG.seedDataFile
  });
}

export function loadGithubSyncConfig() {
  const inferred = inferGithubPagesConfig();
  const raw = localStorage.getItem(APP_CONFIG.githubSyncConfigKey);

  if (!raw) {
    return inferred;
  }

  try {
    const parsed = JSON.parse(raw);
    return cleanConfig({ ...inferred, ...parsed });
  } catch {
    return inferred;
  }
}

export function saveGithubSyncConfig(config) {
  const clean = cleanConfig(config);
  localStorage.setItem(APP_CONFIG.githubSyncConfigKey, JSON.stringify(clean));
  return clean;
}

export async function loadInvoicesFromGithub(config, token) {
  const clean = cleanConfig(config);
  const url = `${buildContentsUrl(clean)}?ref=${encodeURIComponent(clean.branch)}`;

  const withTokenHeaders = { Accept: "application/vnd.github+json" };
  if (token) {
    withTokenHeaders.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(url, { method: "GET", headers: withTokenHeaders });
  let payload = await parseApiResponse(response);

  if (!response.ok && token && response.status === 401) {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" }
    });
    payload = await parseApiResponse(response);
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, `Could not read file from GitHub (HTTP ${response.status}).`)
    );
  }

  const content = payload && typeof payload.content === "string" ? payload.content : "";
  let parsedJson = [];

  try {
    parsedJson = JSON.parse(fromBase64Utf8(content));
  } catch {
    throw new Error("The GitHub file content is not valid JSON.");
  }

  if (!Array.isArray(parsedJson)) {
    throw new Error("GitHub JSON file must contain an array of invoices.");
  }

  return {
    invoices: parsedJson,
    sha: payload.sha || null
  };
}

export async function getGithubFileSha(config, token) {
  const clean = cleanConfig(config);
  const url = `${buildContentsUrl(clean)}?ref=${encodeURIComponent(clean.branch)}`;

  const headers = {
    Accept: "application/vnd.github+json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { method: "GET", headers });

  if (response.status === 404) {
    return null;
  }

  const payload = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, `Could not read file metadata from GitHub (HTTP ${response.status}).`)
    );
  }

  return payload && payload.sha ? payload.sha : null;
}

export async function saveInvoicesToGithub(config, token, invoices, sha) {
  const clean = cleanConfig(config);
  const url = buildContentsUrl(clean);

  const content = `${JSON.stringify(invoices, null, 2)}\n`;
  const body = {
    message: `Update invoices via dashboard (${new Date().toISOString()})`,
    content: toBase64Utf8(content),
    branch: clean.branch
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, `Could not save invoices to GitHub (HTTP ${response.status}).`)
    );
  }

  return {
    sha: payload && payload.content ? payload.content.sha : null,
    commitUrl: payload && payload.commit ? payload.commit.html_url : ""
  };
}
