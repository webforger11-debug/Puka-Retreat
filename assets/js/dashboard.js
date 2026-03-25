import { ensureAuthenticated, logout } from "./auth.js";
import { APP_CONFIG } from "./constants.js";
import { addInvoice, exportInvoicesJson, getInvoices } from "./storage.js";
import {
  buildPublicInvoiceUrl,
  copyToClipboard,
  createInvoiceId,
  downloadTextFile,
  formatCurrency,
  formatDate,
  formatDateTime,
  getQrImageUrl,
  toFloat
} from "./utils.js";

ensureAuthenticated();

const invoiceForm = document.getElementById("invoiceForm");
const formMessage = document.getElementById("formMessage");
const invoiceList = document.getElementById("invoiceList");
const searchInput = document.getElementById("searchInput");
const template = document.getElementById("invoiceCardTemplate");
const logoutBtn = document.getElementById("logoutBtn");
const exportBtn = document.getElementById("exportBtn");

const newInvoicePreview = document.getElementById("newInvoicePreview");
const newInvoiceLink = document.getElementById("newInvoiceLink");
const copyNewLinkBtn = document.getElementById("copyNewLinkBtn");
const openNewLinkBtn = document.getElementById("openNewLinkBtn");
const newInvoiceQr = document.getElementById("newInvoiceQr");
const newInvoiceJson = document.getElementById("newInvoiceJson");
const copyJsonEntryBtn = document.getElementById("copyJsonEntryBtn");

let invoices = await getInvoices();

renderInvoiceList(invoices);
setDefaultDates();

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(invoiceForm);
  const payload = buildInvoicePayload(formData);

  if (!payload) {
    return;
  }

  const newInvoice = {
    id: createInvoiceId(),
    createdAt: new Date().toISOString(),
    ...payload
  };

  invoices = await addInvoice(newInvoice);
  showNewInvoicePreview(newInvoice);
  renderInvoiceList(filterInvoices(invoices, searchInput.value));
  invoiceForm.reset();
  setDefaultDates();
  setFormMessage("Invoice created. Copy JSON entry and paste into data/invoices.json.", "success");
});

searchInput.addEventListener("input", () => {
  renderInvoiceList(filterInvoices(invoices, searchInput.value));
});

logoutBtn.addEventListener("click", () => {
  logout();
  window.location.href = "index.html";
});

exportBtn.addEventListener("click", async () => {
  const json = await exportInvoicesJson();
  downloadTextFile("invoices.json", json, "application/json");
});

copyNewLinkBtn.addEventListener("click", async () => {
  const url = newInvoiceLink.href;
  if (!url || url === "#") {
    setFormMessage("Create an invoice first to generate a link.", "error");
    return;
  }

  const copied = await copyToClipboard(url);
  setFormMessage(copied ? "Link copied to clipboard." : "Could not copy link.", copied ? "success" : "error");
});

copyJsonEntryBtn.addEventListener("click", async () => {
  const jsonText = String(newInvoiceJson.textContent || "").trim();
  if (!jsonText) {
    setFormMessage("Create an invoice first to generate JSON.", "error");
    return;
  }

  const copied = await copyToClipboard(jsonText);
  setFormMessage(copied ? "JSON entry copied." : "Could not copy JSON entry.", copied ? "success" : "error");
});

function setDefaultDates() {
  const checkInInput = document.getElementById("checkInDate");
  const checkOutInput = document.getElementById("checkOutDate");

  if (!checkInInput.value) {
    const today = new Date();
    checkInInput.value = today.toISOString().slice(0, 10);
  }

  if (!checkOutInput.value) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    checkOutInput.value = tomorrow.toISOString().slice(0, 10);
  }
}

function buildInvoicePayload(formData) {
  const guestName = String(formData.get("guestName") || "").trim();
  const guestLastName = String(formData.get("guestLastName") || "").trim();
  const reservationNumber = String(formData.get("reservationNumber") || "").trim();
  const checkInDate = String(formData.get("checkInDate") || "");
  const checkOutDate = String(formData.get("checkOutDate") || "");
  const commissionableAmount = toFloat(formData.get("commissionableAmount"));
  const commission = toFloat(formData.get("commission"));
  const total = toFloat(formData.get("total"));

  if (!guestName || !guestLastName || !reservationNumber || !checkInDate || !checkOutDate) {
    setFormMessage("Please complete all fields.", "error");
    return null;
  }

  if ([commissionableAmount, commission, total].some((value) => Number.isNaN(value))) {
    setFormMessage("Amounts must be valid numbers.", "error");
    return null;
  }

  if (new Date(checkOutDate) < new Date(checkInDate)) {
    setFormMessage("Check-out date must be after check-in date.", "error");
    return null;
  }

  return {
    propertyName: APP_CONFIG.propertyName,
    guestName,
    guestLastName,
    reservationNumber,
    checkInDate,
    checkOutDate,
    commissionableAmount,
    commission,
    total
  };
}

function showNewInvoicePreview(invoice) {
  const publicUrl = buildPublicInvoiceUrl(invoice);
  newInvoicePreview.classList.remove("hidden");
  newInvoiceLink.href = publicUrl;
  newInvoiceLink.textContent = publicUrl;
  openNewLinkBtn.href = publicUrl;
  newInvoiceQr.src = getQrImageUrl(publicUrl);
  newInvoiceJson.textContent = buildManualJsonEntry(invoice);
}

function buildManualJsonEntry(invoice) {
  const entry = {
    id: invoice.id,
    propertyName: invoice.propertyName || APP_CONFIG.propertyName,
    guestName: invoice.guestName,
    guestLastName: invoice.guestLastName,
    reservationNumber: invoice.reservationNumber,
    checkInDate: invoice.checkInDate,
    checkOutDate: invoice.checkOutDate,
    commissionableAmount: Number(invoice.commissionableAmount),
    commission: Number(invoice.commission),
    total: Number(invoice.total),
    createdAt: invoice.createdAt
  };

  return JSON.stringify(entry, null, 2);
}

function setFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.classList.remove("error", "success");
  if (type) {
    formMessage.classList.add(type);
  }
}

function filterInvoices(list, query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) {
    return list;
  }

  return list.filter((invoice) => {
    const searchable = [
      invoice.guestName,
      invoice.guestLastName,
      invoice.reservationNumber,
      invoice.id
    ].join(" ").toLowerCase();

    return searchable.includes(cleanQuery);
  });
}

function renderInvoiceList(list) {
  invoiceList.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No invoices found yet.";
    invoiceList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const invoice of list) {
    const templateFragment = template.content.cloneNode(true);

    templateFragment.querySelector("[data-guest]").textContent = `${invoice.guestName} ${invoice.guestLastName}`;
    templateFragment.querySelector("[data-reservation]").textContent = `Reservation #${invoice.reservationNumber}`;
    templateFragment.querySelector("[data-created]").textContent = formatDateTime(invoice.createdAt);
    templateFragment.querySelector("[data-checkin]").textContent = formatDate(invoice.checkInDate);
    templateFragment.querySelector("[data-checkout]").textContent = formatDate(invoice.checkOutDate);
    templateFragment.querySelector("[data-commissionable]").textContent = formatCurrency(invoice.commissionableAmount);
    templateFragment.querySelector("[data-commission]").textContent = formatCurrency(invoice.commission);
    templateFragment.querySelector("[data-total]").textContent = formatCurrency(invoice.total);

    const publicUrl = buildPublicInvoiceUrl(invoice);

    const openLink = templateFragment.querySelector("[data-open]");
    openLink.href = publicUrl;

    const copyBtn = templateFragment.querySelector("[data-copy]");
    copyBtn.addEventListener("click", async () => {
      const copied = await copyToClipboard(publicUrl);
      copyBtn.textContent = copied ? "Copied" : "Copy Failed";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy Link";
      }, 1200);
    });

    const qrImage = templateFragment.querySelector("[data-qr]");
    qrImage.src = getQrImageUrl(publicUrl);

    fragment.appendChild(templateFragment);
  }

  invoiceList.appendChild(fragment);
}
