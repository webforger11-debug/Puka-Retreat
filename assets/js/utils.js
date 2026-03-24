import { APP_CONFIG } from "./constants.js";

export function createInvoiceId() {
  const randomPart = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

  return `INV-${Date.now()}-${randomPart}`.toUpperCase();
}

export function toFloat(value) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return NaN;
  }

  return Number(parsed.toFixed(2));
}

export function formatCurrency(value) {
  const numeric = Number(value);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: APP_CONFIG.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  const dateValue = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeInvoicePayload(invoice) {
  const payload = {
    id: invoice.id,
    propertyName: APP_CONFIG.propertyName,
    guestName: invoice.guestName,
    guestLastName: invoice.guestLastName,
    reservationNumber: invoice.reservationNumber,
    checkInDate: invoice.checkInDate,
    checkOutDate: invoice.checkOutDate,
    commissionableAmount: invoice.commissionableAmount,
    commission: invoice.commission,
    total: invoice.total,
    createdAt: invoice.createdAt
  };

  return toBase64Utf8(JSON.stringify(payload));
}

export function decodeInvoicePayload(token) {
  try {
    const decoded = fromBase64Utf8(token);
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildPublicInvoiceUrl(invoice) {
  const url = new URL("invoice.html", window.location.href);
  url.searchParams.set("id", invoice.id);
  url.searchParams.set("data", encodeInvoicePayload(invoice));
  return url.toString();
}

export function getQrImageUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(value)}`;
}

export async function copyToClipboard(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textArea);
  return copied;
}

export function downloadTextFile(fileName, content, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
