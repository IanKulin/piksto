const atcModal = document.getElementById("atc-modal");
const closeBtn = document.getElementById("atc-close-btn");
const loadingEl = document.getElementById("atc-loading");
const emptyEl = document.getElementById("atc-empty");
const listEl = document.getElementById("atc-list");

let activeImageIds = [];

async function openAddToCollectionModal(imageIds) {
  if (!atcModal) return;
  activeImageIds = [...imageIds];
  showLoading();
  atcModal.hidden = false;

  try {
    const collections = await fetch("/api/collections").then((r) => r.json());

    const memberships = await Promise.all(
      imageIds.map((id) => fetch(`/api/image/${id}/collections`).then((r) => r.json()))
    );

    renderList(collections, memberships);
  } catch (_e) {
    hideLoading();
  }
}

function showLoading() {
  if (listEl) listEl.innerHTML = "";
  if (loadingEl) loadingEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;
}

function hideLoading() {
  if (loadingEl) loadingEl.hidden = true;
}

function renderList(collections, memberships) {
  hideLoading();
  if (!listEl) return;
  listEl.innerHTML = "";

  if (collections.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  collections.forEach((col) => {
    const allIn = memberships.every((m) => m.some((c) => c.id === col.id));
    const anyIn = memberships.some((m) => m.some((c) => c.id === col.id));

    const li = document.createElement("li");
    li.className = "atc-row";

    const label = document.createElement("label");
    label.className = "atc-row__label";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "atc-row__checkbox";
    if (allIn) {
      cb.checked = true;
    } else if (anyIn) {
      cb.indeterminate = true;
    }

    const span = document.createElement("span");
    span.textContent = col.name;

    label.appendChild(cb);
    label.appendChild(span);
    li.appendChild(label);
    listEl.appendChild(li);

    cb.addEventListener("change", () => handleToggle(cb, li, col.id));
  });
}

async function handleToggle(cb, li, collectionId) {
  cb.disabled = true;
  li.classList.remove("atc-row--saved");
  li.classList.add("atc-row--saving");

  try {
    await Promise.all(
      activeImageIds.map((imageId) =>
        fetch(`/api/image/${imageId}/collections/${collectionId}/toggle`, { method: "POST" })
      )
    );
    li.classList.remove("atc-row--saving");
    li.classList.add("atc-row--saved");
    setTimeout(() => li.classList.remove("atc-row--saved"), 1000);
  } catch (_e) {
    li.classList.remove("atc-row--saving");
    cb.checked = !cb.checked;
  } finally {
    cb.disabled = false;
    cb.indeterminate = false;
  }
}

closeBtn?.addEventListener("click", () => {
  if (atcModal) atcModal.hidden = true;
});

atcModal?.addEventListener("click", (e) => {
  if (e.target === atcModal) atcModal.hidden = true;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && atcModal && !atcModal.hidden) atcModal.hidden = true;
});

window.openAddToCollectionModal = openAddToCollectionModal;
