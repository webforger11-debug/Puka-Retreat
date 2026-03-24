import { ensureAuthenticated, logout } from "./auth.js";
import { APP_CONFIG } from "./constants.js";
import {
  addInvoice,
  deleteInvoice,
  exportInvoicesJson,
  getInvoices,
  updateInvoice
} from "./storage.js";
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
const submitInvoiceBtn = document.getElementById("submitInvoiceBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

const newInvoicePreview = document.getElementById("newInvoicePreview");
const newInvoiceLink = document.getElementById("newInvoiceLink");
const copyNewLinkBtn = document.getElementById("copyNewLinkBtn");
const openNewLinkBtn = document.getElementById("openNewLinkBtn");
const newInvoiceQr = document.getElementById("newInvoiceQr");

let invoices = await getInvoices();
let editingInvoiceId = null;

renderInvoiceList(invoices);
setDefaultDates();

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(invoiceForm);
  const payload = buildInvoicePayload(formData);

  if (!payload) {
    return;
  }

  if (editingInvoiceId) {
    const existing = invoices.find((item) => item.id === editingInvoiceId);
    if (!existing) {
      setFormMessage("Could not find invoice to update.", "error");
      resetFormToCreateMode(true);
      return;
    }

    const updatedInvoice = {
      ...existing,
      ...payload,
      id: existing.id,
      createdAt: existing.createdAt
    };

    invoices = await updateInvoice(updatedInvoice);
    showNewInvoicePreview(updatedInvoice);
    setFormMessage("Invoice updated successfully.", "success");
    resetFormToCreateMode(true);
  } else {
    const newInvoice = {
      id: createInvoiceId(),
      createdAt: new Date().toISOString(),
      ...payload
    };

    invoices = await addInvoice(newInvoice);
    showNewInvoicePreview(newInvoice);
    invoiceForm.reset();
    setDefaultDates();
    setFormMessage("Invoice created successfully.", "success");
  }

  renderInvoiceList(filterInvoices(invoices, searchInput.value));
});

searchInput.addEventListener("input", () => {
  const filtered = filterInvoices(invoices, searchInput.value);
  renderInvoiceList(filtered);
});

logoutBtn.addEventListener("click", () => {
  logout();
  window.location.href = "index.html";
});

exportBtn.addEventListener("click", async () => {
  const json = await exportInvoicesJson();
  downloadTextFile("invoices.json", json, "application/json");
});

cancelEditBtn.addEventListener("click", () => {
  resetFormToCreateMode(true);
  setFormMessage("Edit mode canceled.", "success");
});

copyNewLinkBtn.addEventListener("click", async () => {
  if (!newInvoiceLink.href || newInvoiceLink.href === "#") {
    setFormMessage("Create an invoice first to generate a link.", "error");
    return;
  }

  const url = newInvoiceLink.href;
  const copied = await copyToClipboard(url);
  setFormMessage(copied ? "Link copied to clipboard." : "Could not copy link. Copy it manually.", copied ? "success" : "error");
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

  if (
    !guestName ||
    !guestLastName ||
    !reservationNumber ||
    !checkInDate ||
    !checkOutDate
  ) {
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

  setFormMessage("", "success");

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
}

function setFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.classList.remove("error", "success");
  if (type) {
    formMessage.classList.add(type);
  }
}

function resetFormToCreateMode(resetFormFields) {
  editingInvoiceId = null;
  submitInvoiceBtn.textContent = "Create Invoice";
  cancelEditBtn.classList.add("hidden");

  if (resetFormFields) {
    invoiceForm.reset();
    setDefaultDates();
  }
}

function startEditInvoice(invoice) {
  editingInvoiceId = invoice.id;
  submitInvoiceBtn.textContent = "Update Invoice";
  cancelEditBtn.classList.remove("hidden");

  invoiceForm.elements.guestName.value = invoice.guestName;
  invoiceForm.elements.guestLastName.value = invoice.guestLastName;
  invoiceForm.elements.reservationNumber.value = invoice.reservationNumber;
  invoiceForm.elements.checkInDate.value = invoice.checkInDate;
  invoiceForm.elements.checkOutDate.value = invoice.checkOutDate;
  invoiceForm.elements.commissionableAmount.value = String(invoice.commissionableAmount);
  invoiceForm.elements.commission.value = String(invoice.commission);
  invoiceForm.elements.total.value = String(invoice.total);

  setFormMessage(`Editing reservation #${invoice.reservationNumber}.`, "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleDeleteInvoice(invoice) {
  const approved = window.confirm(
    `Delete invoice for ${invoice.guestName} ${invoice.guestLastName} (Reservation #${invoice.reservationNumber})?`
  );

  if (!approved) {
    return;
  }

  invoices = await deleteInvoice(invoice.id);
  if (editingInvoiceId === invoice.id) {
    resetFormToCreateMode(true);
  }

  if (invoices.length === 0) {
    newInvoicePreview.classList.add("hidden");
  }

  renderInvoiceList(filterInvoices(invoices, searchInput.value));
  setFormMessage("Invoice deleted successfully.", "success");
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

    const editBtn = templateFragment.querySelector("[data-edit]");
    editBtn.addEventListener("click", () => {
      startEditInvoice(invoice);
    });

    const copyBtn = templateFragment.querySelector("[data-copy]");
    copyBtn.addEventListener("click", async () => {
      const copied = await copyToClipboard(publicUrl);
      copyBtn.textContent = copied ? "Copied" : "Copy Failed";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy Link";
      }, 1200);
    });

    const deleteBtn = templateFragment.querySelector("[data-delete]");
    deleteBtn.addEventListener("click", async () => {
      await handleDeleteInvoice(invoice);
    });

    const qrImage = templateFragment.querySelector("[data-qr]");
    qrImage.src = getQrImageUrl(publicUrl);

    fragment.appendChild(templateFragment);
  }

  invoiceList.appendChild(fragment);
}
