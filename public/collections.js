const grid = document.getElementById("collection-grid");
const toolbar = document.getElementById("grid-toolbar");
const countEl = document.getElementById("grid-count");
const selectBtn = document.getElementById("collections-select-btn");
const addBtn = document.getElementById("collections-add-btn");
const bulkModal = document.getElementById("bulk-modal");
const bulkConfirmBtn = document.getElementById("bulk-confirm-btn");
const bulkCancelBtn = document.getElementById("bulk-cancel-btn");
const form = document.getElementById("bulk-delete-form");
const createModal = document.getElementById("create-modal");
const createCancelBtn = document.getElementById("create-cancel-btn");
const tabBar = document.getElementById("bottom-tab-bar");
const actionsBar = document.getElementById("bottom-tab-bar-actions");
const mobileCancel = document.getElementById("mobile-select-cancel");
const mobileCount = document.getElementById("mobile-select-count");
const mobileDelete = document.getElementById("mobile-select-delete");

let selectMode = false;
let deleteBtn = null;

const total = document.querySelectorAll(".collection-card").length;

function selectedIds() {
  return [...document.querySelectorAll(".collection-card__checkbox:checked")].map((cb) =>
    Number(cb.value)
  );
}

function syncSelection() {
  const ids = selectedIds();
  const n = ids.length;

  document.querySelectorAll(".collection-card").forEach((card) => {
    const cb = card.querySelector(".collection-card__checkbox");
    card.classList.toggle("photo-card--selected", cb?.checked ?? false);
  });

  countEl.textContent = `${n} selected`;
  if (deleteBtn) deleteBtn.disabled = n === 0;
  if (mobileDelete) mobileDelete.disabled = n === 0;
  if (mobileCount) mobileCount.textContent = `${n} selected`;
}

function enterSelectMode() {
  selectMode = true;
  grid?.classList.add("collection-grid--select-mode");

  if (selectBtn) {
    selectBtn.textContent = "Cancel";
    selectBtn.classList.remove("btn--secondary");
  }

  if (!deleteBtn) {
    deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--small btn--danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = true;
    deleteBtn.addEventListener("click", () => {
      if (selectedIds().length > 0) bulkModal.hidden = false;
    });
    document.getElementById("grid-toolbar-actions")?.appendChild(deleteBtn);
  } else {
    deleteBtn.hidden = false;
  }

  countEl.textContent = "0 selected";
  if (mobileDelete) mobileDelete.disabled = true;
  tabBar?.classList.add("bottom-tab-bar--select-mode");
  actionsBar?.removeAttribute("aria-hidden");
  toolbar?.classList.add("grid-toolbar--select-mode");
}

function exitSelectMode() {
  selectMode = false;
  grid?.classList.remove("collection-grid--select-mode");

  document.querySelectorAll(".collection-card__checkbox").forEach((cb) => (cb.checked = false));
  document
    .querySelectorAll(".collection-card")
    .forEach((card) => card.classList.remove("photo-card--selected"));

  if (selectBtn) {
    selectBtn.textContent = "Select";
    selectBtn.classList.add("btn--secondary");
  }
  if (deleteBtn) deleteBtn.hidden = true;

  countEl.textContent = `${total} ${total === 1 ? "collection" : "collections"}`;
  tabBar?.classList.remove("bottom-tab-bar--select-mode");
  actionsBar?.setAttribute("aria-hidden", "true");
  toolbar?.classList.remove("grid-toolbar--select-mode");
}

selectBtn?.addEventListener("click", () => {
  if (selectMode) exitSelectMode();
  else enterSelectMode();
});

grid?.addEventListener("change", (e) => {
  if (e.target.matches(".collection-card__checkbox")) syncSelection();
});

mobileCancel?.addEventListener("click", () => exitSelectMode());

mobileDelete?.addEventListener("click", () => {
  if (selectedIds().length > 0) bulkModal.hidden = false;
});

bulkCancelBtn?.addEventListener("click", () => {
  bulkModal.hidden = true;
});

bulkModal?.addEventListener("click", (e) => {
  if (e.target === bulkModal) bulkModal.hidden = true;
});

bulkConfirmBtn?.addEventListener("click", () => {
  const ids = selectedIds();
  if (ids.length === 0) {
    bulkModal.hidden = true;
    return;
  }
  form.innerHTML = "";
  ids.forEach((id) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "ids";
    input.value = id;
    form.appendChild(input);
  });
  form.submit();
});

addBtn?.addEventListener("click", () => {
  const nameInput = document.getElementById("collection-name-input");
  if (nameInput) nameInput.value = "";
  const errEl = document.getElementById("create-error");
  if (errEl) errEl.hidden = true;
  createModal.hidden = false;
  document.getElementById("collection-name-input")?.focus();
});

createCancelBtn?.addEventListener("click", () => {
  createModal.hidden = true;
});

createModal?.addEventListener("click", (e) => {
  if (e.target === createModal) createModal.hidden = true;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    bulkModal.hidden = true;
    createModal.hidden = true;
  }
});

// If the page re-rendered with an error from the server, show the create modal
const serverError = document.getElementById("collections-error");
if (serverError) {
  createModal.hidden = false;
}
