import { APP_CONFIG } from "./constants.js";

let cachedInvoices = null;

function normalizeInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  return {
    id: String(invoice.id || ""),
    propertyName: String(invoice.propertyName || APP_CONFIG.propertyName),
    guestName: String(invoice.guestName || invoice.name || "").trim(),
    guestLastName: String(invoice.guestLastName || invoice.lastName || "").trim(),
    reservationNumber: String(invoice.reservationNumber || "").trim(),
    checkInDate: String(invoice.checkInDate || invoice.checkIn || ""),
    checkOutDate: String(invoice.checkOutDate || invoice.checkOut || ""),
    commissionableAmount: Number(invoice.commissionableAmount || 0),
    commission: Number(invoice.commission || 0),
    total: Number(invoice.total || 0),
    createdAt: String(invoice.createdAt || new Date().toISOString())
  };
}

function sortNewestFirst(invoices) {
  return [...invoices].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
}

function persistInvoices(invoices) {
  const normalized = sortNewestFirst(invoices.map(normalizeInvoice).filter(Boolean));
  localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(normalized));
  cachedInvoices = normalized;
}

async function loadSeedInvoices() {
  try {
    const response = await fetch(APP_CONFIG.seedDataFile, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.map(normalizeInvoice).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getInvoices() {
  if (cachedInvoices) {
    return [...cachedInvoices];
  }

  const raw = localStorage.getItem(APP_CONFIG.storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const normalized = sortNewestFirst(parsed.map(normalizeInvoice).filter(Boolean));
      cachedInvoices = normalized;
      return [...normalized];
    } catch {
      localStorage.removeItem(APP_CONFIG.storageKey);
    }
  }

  const seeded = await loadSeedInvoices();
  persistInvoices(seeded);
  return [...seeded];
}

export async function addInvoice(invoice) {
  const current = await getInvoices();
  const updated = [invoice, ...current.filter((item) => item.id !== invoice.id)];
  persistInvoices(updated);
  return [...updated];
}

export async function updateInvoice(invoice) {
  if (!invoice || !invoice.id) {
    return getInvoices();
  }

  const current = await getInvoices();
  const updated = current.map((item) => (
    item.id === invoice.id
      ? normalizeInvoice({ ...item, ...invoice })
      : item
  ));

  persistInvoices(updated);
  return [...updated];
}

export async function deleteInvoice(id) {
  if (!id) {
    return getInvoices();
  }

  const current = await getInvoices();
  const updated = current.filter((item) => item.id !== id);
  persistInvoices(updated);
  return [...updated];
}

export async function findInvoiceById(id) {
  if (!id) {
    return null;
  }

  const invoices = await getInvoices();
  return invoices.find((invoice) => invoice.id === id) || null;
}

export async function exportInvoicesJson() {
  const invoices = await getInvoices();
  return JSON.stringify(invoices, null, 2);
}
