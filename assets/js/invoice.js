import { APP_CONFIG } from "./constants.js";
import { findInvoiceById } from "./storage.js";
import { decodeInvoicePayload, formatCurrency, formatDate, formatDateTime } from "./utils.js";

const invoiceDetail = document.getElementById("invoiceDetail");
const params = new URLSearchParams(window.location.search);

const idParam = params.get("id");
const dataParam = params.get("data");

let invoice = null;

if (dataParam) {
  invoice = normalizeInvoice(decodeInvoicePayload(dataParam));
}

if (!invoice && idParam) {
  const storedInvoice = await findInvoiceById(idParam);
  invoice = normalizeInvoice(storedInvoice);
}

if (invoice) {
  renderInvoice(invoice);
} else {
  renderMissingInvoice();
}

function normalizeInvoice(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    id: String(value.id || ""),
    propertyName: String(value.propertyName || APP_CONFIG.propertyName),
    guestName: String(value.guestName || value.name || "").trim(),
    guestLastName: String(value.guestLastName || value.lastName || "").trim(),
    reservationNumber: String(value.reservationNumber || "").trim(),
    checkInDate: String(value.checkInDate || value.checkIn || ""),
    checkOutDate: String(value.checkOutDate || value.checkOut || ""),
    commissionableAmount: Number(value.commissionableAmount || 0),
    commission: Number(value.commission || 0),
    total: Number(value.total || 0),
    createdAt: String(value.createdAt || "")
  };
}

function renderInvoice(data) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-grid";

  const rows = [
    ["Property", data.propertyName || APP_CONFIG.propertyName],
    ["Guest Name", data.guestName || "-"],
    ["Guest Last Name", data.guestLastName || "-"],
    ["Reservation Number", data.reservationNumber || "-"],
    ["Check-In Date", formatDate(data.checkInDate)],
    ["Check-Out Date", formatDate(data.checkOutDate)],
    ["Commissionable Amount", formatCurrency(data.commissionableAmount)],
    ["Commission", formatCurrency(data.commission)],
    ["Total", formatCurrency(data.total)],
    ["Invoice Created At", formatDateTime(data.createdAt)]
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "detail-row";

    const labelElement = document.createElement("span");
    labelElement.className = "detail-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "detail-value";
    valueElement.textContent = value;

    row.appendChild(labelElement);
    row.appendChild(valueElement);
    wrapper.appendChild(row);
  }

  invoiceDetail.replaceChildren(wrapper);
}

function renderMissingInvoice() {
  const missing = document.createElement("div");
  missing.className = "missing-state";
  missing.innerHTML = `
    <h2>Invoice Not Found</h2>
    <p>
      This link is invalid or incomplete. Ask Puka Retreat for a fresh invoice link or QR code.
    </p>
  `;

  invoiceDetail.replaceChildren(missing);
}
