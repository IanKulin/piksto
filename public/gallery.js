const grid = document.getElementById("gallery-grid");
const toolbar = document.getElementById("gallery-toolbar");
const countEl = document.getElementById("gallery-count");
const selectBtn = document.getElementById("gallery-select-btn");
const modal = document.getElementById("bulk-modal");
const confirmBtn = document.getElementById("bulk-confirm-btn");
const cancelBtn = document.getElementById("bulk-cancel-btn");
const form = document.getElementById("bulk-delete-form");
const tabBar = document.getElementById("bottom-tab-bar");
const mobileCancel = document.getElementById("mobile-select-cancel");
const mobileCount = document.getElementById("mobile-select-count");
const mobileDelete = document.getElementById("mobile-select-delete");

let selectMode = false;
let deleteBtn = null;
let addToCollectionBtn = null;

function selectedIds() {
  return [...document.querySelectorAll(".gallery-card__checkbox:checked")].map((cb) =>
    Number(cb.value)
  );
}

function syncSelection() {
  const ids = selectedIds();
  const n = ids.length;

  document.querySelectorAll(".gallery-card").forEach((card) => {
    const cb = card.querySelector(".gallery-card__checkbox");
    card.classList.toggle("gallery-card--selected", cb?.checked ?? false);
  });

  countEl.textContent = `${n} selected`;
  if (deleteBtn) {
    deleteBtn.disabled = n === 0;
  }
  if (addToCollectionBtn) {
    addToCollectionBtn.disabled = n === 0;
  }
  if (mobileDelete) {
    mobileDelete.disabled = n === 0;
  }
  if (mobileCount) {
    mobileCount.textContent = `${n} selected`;
  }
}

function enterSelectMode() {
  selectMode = true;
  grid?.classList.add("gallery-grid--select-mode");

  // Swap Select button to Cancel + add Delete button in toolbar
  if (selectBtn) {
    selectBtn.textContent = "Cancel";
    selectBtn.classList.remove("btn--secondary");
  }

  const actionsEl = document.getElementById("gallery-toolbar-actions");

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

  if (!deleteBtn) {
    deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--small btn--danger";
    deleteBtn.type = "button";
    deleteBtn.id = "gallery-delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = true;
    deleteBtn.addEventListener("click", () => {
      if (selectedIds().length > 0) modal.hidden = false;
    });
    actionsEl?.appendChild(deleteBtn);
  } else {
    deleteBtn.hidden = false;
  }

  countEl.textContent = "0 selected";
  if (mobileDelete) {
    mobileDelete.disabled = true;
  }

  // Mobile: transform bottom tab bar, hide top toolbar
  tabBar?.classList.add("bottom-tab-bar--select-mode");
  toolbar?.classList.add("gallery-toolbar--select-mode");
}

function exitSelectMode() {
  selectMode = false;
  grid?.classList.remove("gallery-grid--select-mode");

  // Clear all checkboxes
  document.querySelectorAll(".gallery-card__checkbox").forEach((cb) => (cb.checked = false));
  document
    .querySelectorAll(".gallery-card")
    .forEach((card) => card.classList.remove("gallery-card--selected"));

  // Restore toolbar
  if (selectBtn) {
    selectBtn.textContent = "Select";
    selectBtn.classList.add("btn--secondary");
  }
  if (addToCollectionBtn) {
    addToCollectionBtn.hidden = true;
  }
  if (deleteBtn) {
    deleteBtn.hidden = true;
  }

  const total = document.querySelectorAll(".gallery-card").length;
  countEl.textContent = `${total} ${total === 1 ? "image" : "images"}`;

  // Mobile: restore bottom tab bar, show top toolbar
  tabBar?.classList.remove("bottom-tab-bar--select-mode");
  toolbar?.classList.remove("gallery-toolbar--select-mode");
}

selectBtn?.addEventListener("click", () => {
  if (selectMode) {
    exitSelectMode();
  } else {
    enterSelectMode();
  }
});

grid?.addEventListener("change", (e) => {
  if (e.target.matches(".gallery-card__checkbox")) syncSelection();
});

mobileCancel?.addEventListener("click", () => {
  exitSelectMode();
});

mobileDelete?.addEventListener("click", () => {
  if (selectedIds().length > 0) modal.hidden = false;
});

cancelBtn?.addEventListener("click", () => {
  modal.hidden = true;
});

modal?.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modal.hidden = true;
});

confirmBtn?.addEventListener("click", () => {
  const ids = selectedIds();
  if (ids.length === 0) {
    modal.hidden = true;
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
