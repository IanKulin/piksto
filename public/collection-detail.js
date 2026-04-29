const grid = document.getElementById("image-grid");
const toolbar = document.getElementById("grid-toolbar");
const countEl = document.getElementById("grid-count");
const selectBtn = document.getElementById("grid-select-btn");
const removeForm = document.getElementById("remove-form");
const deleteForm = document.getElementById("delete-form");
const removeModal = document.getElementById("remove-modal");
const deleteModal = document.getElementById("delete-modal");
const removeCancelBtn = document.getElementById("remove-cancel-btn");
const removeConfirmBtn = document.getElementById("remove-confirm-btn");
const deleteCancelBtn = document.getElementById("delete-cancel-btn");
const deleteConfirmBtn = document.getElementById("delete-confirm-btn");
const tabBar = document.getElementById("bottom-tab-bar");
const actionsBar = document.getElementById("bottom-tab-bar-actions");
const mobileCancel = document.getElementById("mobile-select-cancel");
const mobileCount = document.getElementById("mobile-select-count");
const mobileDelete = document.getElementById("mobile-select-delete");

let selectMode = false;
let removeBtn = null;
let permDeleteBtn = null;
let addToCollectionBtn = null;

const total = document.querySelectorAll(".image-card").length;

function selectedIds() {
  return [...document.querySelectorAll(".image-card__checkbox:checked")].map((cb) =>
    Number(cb.value)
  );
}

function syncSelection() {
  const ids = selectedIds();
  const n = ids.length;

  document.querySelectorAll(".image-card").forEach((card) => {
    const cb = card.querySelector(".image-card__checkbox");
    card.classList.toggle("photo-card--selected", cb?.checked ?? false);
  });

  countEl.textContent = `${n} selected`;
  if (removeBtn) removeBtn.disabled = n === 0;
  if (permDeleteBtn) permDeleteBtn.disabled = n === 0;
  if (addToCollectionBtn) addToCollectionBtn.disabled = n === 0;
  if (mobileDelete) mobileDelete.disabled = n === 0;
  if (mobileCount) mobileCount.textContent = `${n} selected`;
}

function enterSelectMode() {
  selectMode = true;
  grid?.classList.add("image-grid--select-mode");

  if (selectBtn) {
    selectBtn.textContent = "Cancel";
    selectBtn.classList.remove("btn--secondary");
  }

  const actionsEl = document.getElementById("grid-toolbar-actions");

  if (!addToCollectionBtn) {
    addToCollectionBtn = document.createElement("button");
    addToCollectionBtn.className = "btn btn--small btn--secondary";
    addToCollectionBtn.type = "button";
    addToCollectionBtn.textContent = "Add to collection";
    addToCollectionBtn.disabled = true;
    addToCollectionBtn.addEventListener("click", () => {
      const ids = selectedIds();
      if (ids.length > 0) window.openAddToCollectionModal?.(ids);
    });
    actionsEl?.appendChild(addToCollectionBtn);
  } else {
    addToCollectionBtn.hidden = false;
  }

  if (!removeBtn) {
    removeBtn = document.createElement("button");
    removeBtn.className = "btn btn--small btn--secondary";
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.disabled = true;
    removeBtn.addEventListener("click", () => {
      if (selectedIds().length > 0) removeModal.hidden = false;
    });
    actionsEl?.appendChild(removeBtn);
  } else {
    removeBtn.hidden = false;
  }

  if (!permDeleteBtn) {
    permDeleteBtn = document.createElement("button");
    permDeleteBtn.className = "btn btn--small btn--danger";
    permDeleteBtn.type = "button";
    permDeleteBtn.textContent = "Delete";
    permDeleteBtn.disabled = true;
    permDeleteBtn.addEventListener("click", () => {
      if (selectedIds().length > 0) deleteModal.hidden = false;
    });
    actionsEl?.appendChild(permDeleteBtn);
  } else {
    permDeleteBtn.hidden = false;
  }

  countEl.textContent = "0 selected";
  if (mobileDelete) mobileDelete.disabled = true;
  tabBar?.classList.add("bottom-tab-bar--select-mode");
  actionsBar?.removeAttribute("aria-hidden");
  toolbar?.classList.add("grid-toolbar--select-mode");
}

function exitSelectMode() {
  selectMode = false;
  grid?.classList.remove("image-grid--select-mode");

  document.querySelectorAll(".image-card__checkbox").forEach((cb) => (cb.checked = false));
  document
    .querySelectorAll(".image-card")
    .forEach((card) => card.classList.remove("photo-card--selected"));

  if (selectBtn) {
    selectBtn.textContent = "Select";
    selectBtn.classList.add("btn--secondary");
  }
  if (addToCollectionBtn) addToCollectionBtn.hidden = true;
  if (removeBtn) removeBtn.hidden = true;
  if (permDeleteBtn) permDeleteBtn.hidden = true;

  countEl.textContent = `${total} ${total === 1 ? "image" : "images"}`;
  tabBar?.classList.remove("bottom-tab-bar--select-mode");
  actionsBar?.setAttribute("aria-hidden", "true");
  toolbar?.classList.remove("grid-toolbar--select-mode");
}

function submitWithIds(form) {
  const ids = selectedIds();
  if (ids.length === 0) return;
  form.innerHTML = "";
  ids.forEach((id) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "ids";
    input.value = id;
    form.appendChild(input);
  });
  form.submit();
}

selectBtn?.addEventListener("click", () => {
  if (selectMode) exitSelectMode();
  else enterSelectMode();
});

grid?.addEventListener("change", (e) => {
  if (e.target.matches(".image-card__checkbox")) syncSelection();
});

mobileCancel?.addEventListener("click", () => exitSelectMode());

mobileDelete?.addEventListener("click", () => {
  if (selectedIds().length > 0) removeModal.hidden = false;
});

removeCancelBtn?.addEventListener("click", () => {
  removeModal.hidden = true;
});
removeModal?.addEventListener("click", (e) => {
  if (e.target === removeModal) removeModal.hidden = true;
});
removeConfirmBtn?.addEventListener("click", () => submitWithIds(removeForm));

deleteCancelBtn?.addEventListener("click", () => {
  deleteModal.hidden = true;
});
deleteModal?.addEventListener("click", (e) => {
  if (e.target === deleteModal) deleteModal.hidden = true;
});
deleteConfirmBtn?.addEventListener("click", () => submitWithIds(deleteForm));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    removeModal.hidden = true;
    deleteModal.hidden = true;
  }
});
