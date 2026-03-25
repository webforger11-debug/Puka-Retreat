import { ensureAuthenticated, logout } from "./auth.js";
import { APP_CONFIG } from "./constants.js";
import {
  addInvoice,
  deleteInvoice,
  exportInvoicesJson,
  getInvoices,
  replaceInvoices,
  updateInvoice
} from "./storage.js";
import {
  getGithubFileSha,
  loadGithubSyncConfig,
  loadInvoicesFromGithub,
  saveGithubSyncConfig,
  saveInvoicesToGithub
} from "./githubSync.js";
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

const ghOwnerInput = document.getElementById("ghOwner");
const ghRepoInput = document.getElementById("ghRepo");
const ghBranchInput = document.getElementById("ghBranch");
const ghPathInput = document.getElementById("ghPath");
const ghTokenInput = document.getElementById("ghToken");
const rememberTokenCheckbox = document.getElementById("rememberToken");
const clearTokenBtn = document.getElementById("clearTokenBtn");
const loadGithubBtn = document.getElementById("loadGithubBtn");
const saveGithubBtn = document.getElementById("saveGithubBtn");
const syncMessage = document.getElementById("syncMessage");

let invoices = await getInvoices();
let editingInvoiceId = null;
let githubFileSha = null;
const bundledGithubToken = String(APP_CONFIG.githubToken || "").trim();

renderInvoiceList(invoices);
setDefaultDates();
initializeGithubSyncSection();

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
    markUnsyncedChanges("Invoice updated locally.");
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
    markUnsyncedChanges("Invoice created locally.");
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

loadGithubBtn.addEventListener("click", async () => {
  const config = getGithubConfigFromInputs();
  if (!isGithubConfigValid(config)) {
    return;
  }

  persistTokenPreference();
  saveGithubSyncConfig(config);
  setSyncBusyState(true);
  setSyncMessage("Loading invoices from GitHub...", "info");

  try {
    const token = getActiveGithubToken();
    const result = await loadInvoicesFromGithub(config, token);

    invoices = await replaceInvoices(result.invoices);
    githubFileSha = result.sha;

    resetFormToCreateMode(true);
    renderInvoiceList(filterInvoices(invoices, searchInput.value));

    if (!invoices.length) {
      newInvoicePreview.classList.add("hidden");
    }

    setSyncMessage(
      `Loaded ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} from GitHub.`,
      "success"
    );
  } catch (error) {
    setSyncMessage(error.message || "Could not load invoices from GitHub.", "error");
  } finally {
    setSyncBusyState(false);
  }
});

saveGithubBtn.addEventListener("click", async () => {
  const config = getGithubConfigFromInputs();
  if (!isGithubConfigValid(config)) {
    return;
  }

  persistTokenPreference();
  const token = getActiveGithubToken();
  if (!token) {
    setSyncMessage("GitHub token is required to save data.", "error");
    return;
  }

  saveGithubSyncConfig(config);
  setSyncBusyState(true);
  setSyncMessage("Saving invoices to GitHub...", "info");

  try {
    const latestSha = await getGithubFileSha(config, token);
    const currentInvoices = await getInvoices();
    const result = await saveInvoicesToGithub(config, token, currentInvoices, latestSha || githubFileSha);

    githubFileSha = result.sha;

    const commitNote = result.commitUrl ? ` Commit: ${result.commitUrl}` : "";
    setSyncMessage(
      `Saved ${currentInvoices.length} invoice${currentInvoices.length === 1 ? "" : "s"} to GitHub.${commitNote}`,
      "success"
    );
  } catch (error) {
    setSyncMessage(error.message || "Could not save invoices to GitHub.", "error");
  } finally {
    setSyncBusyState(false);
  }
});

function initializeGithubSyncSection() {
  const config = loadGithubSyncConfig();
  ghOwnerInput.value = config.owner;
  ghRepoInput.value = config.repo;
  ghBranchInput.value = config.branch || "main";
  ghPathInput.value = config.path || APP_CONFIG.seedDataFile;

  const configInputs = [ghOwnerInput, ghRepoInput, ghBranchInput, ghPathInput];
  for (const input of configInputs) {
    input.addEventListener("change", () => {
      saveGithubSyncConfig(getGithubConfigFromInputs());
    });
  }

  const savedToken = String(localStorage.getItem(APP_CONFIG.githubTokenKey) || "").trim();
  ghTokenInput.value = savedToken || bundledGithubToken;
  if (savedToken) {
    rememberTokenCheckbox.checked = true;
  } else {
    rememberTokenCheckbox.checked = false;
  }

  rememberTokenCheckbox.addEventListener("change", () => {
    if (!rememberTokenCheckbox.checked) {
      localStorage.removeItem(APP_CONFIG.githubTokenKey);
      return;
    }

    persistTokenPreference();
  });

  clearTokenBtn.addEventListener("click", () => {
    ghTokenInput.value = "";
    rememberTokenCheckbox.checked = false;
    localStorage.removeItem(APP_CONFIG.githubTokenKey);
    setSyncMessage("Saved token removed from this browser.", "success");
  });

  ghTokenInput.addEventListener("change", () => {
    persistTokenPreference();
  });

  setSyncMessage(
    "Local mode active. Use \"Load From GitHub\" to pull shared invoices, then \"Save To GitHub\" after edits.",
    "info"
  );
}

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

function getGithubConfigFromInputs() {
  return {
    owner: String(ghOwnerInput.value || "").trim(),
    repo: String(ghRepoInput.value || "").trim(),
    branch: String(ghBranchInput.value || "main").trim() || "main",
    path: String(ghPathInput.value || APP_CONFIG.seedDataFile).trim() || APP_CONFIG.seedDataFile
  };
}

function isGithubConfigValid(config) {
  if (!config.owner || !config.repo || !config.branch || !config.path) {
    setSyncMessage("Fill owner, repo, branch, and JSON file path first.", "error");
    return false;
  }

  if (!config.path.toLowerCase().endsWith(".json")) {
    setSyncMessage("JSON file path should end with .json (example: data/invoices.json).", "error");
    return false;
  }

  return true;
}

function setSyncBusyState(isBusy) {
  loadGithubBtn.disabled = isBusy;
  saveGithubBtn.disabled = isBusy;
  loadGithubBtn.textContent = isBusy ? "Working..." : "Load From GitHub";
  saveGithubBtn.textContent = isBusy ? "Working..." : "Save To GitHub";
}

function setSyncMessage(message, type) {
  syncMessage.textContent = message;
  syncMessage.classList.remove("info", "success", "error");
  syncMessage.classList.add(type || "info");
}

function persistTokenPreference() {
  const token = String(ghTokenInput.value || "").trim();
  if (!rememberTokenCheckbox.checked) {
    localStorage.removeItem(APP_CONFIG.githubTokenKey);
    return;
  }

  if (token) {
    localStorage.setItem(APP_CONFIG.githubTokenKey, token);
  }
}

function getActiveGithubToken() {
  const typedToken = String(ghTokenInput.value || "").trim();
  return typedToken || bundledGithubToken;
}

function markUnsyncedChanges(prefix) {
  setSyncMessage(`${prefix} Click "Save To GitHub" so all browsers see the update.`, "info");
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

  if (!invoices.length) {
    newInvoicePreview.classList.add("hidden");
  }

  renderInvoiceList(filterInvoices(invoices, searchInput.value));
  setFormMessage("Invoice deleted successfully.", "success");
  markUnsyncedChanges("Invoice deleted locally.");
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
