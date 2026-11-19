(() => {
  const modal = document.getElementById("share-modal");
  const openBtn = document.getElementById("share-open-btn");
  const closeBtn = document.getElementById("share-close-btn");
  const createForm = document.getElementById("share-create-form");
  const createBtn = document.getElementById("share-create-btn");
  const copyBtn = document.getElementById("share-copy-btn");
  const urlInput = document.getElementById("share-new-url");

  openBtn?.addEventListener("click", () => {
    modal.hidden = false;
  });
  closeBtn?.addEventListener("click", () => {
    modal.hidden = true;
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal) modal.hidden = true;
  });

  // Prevent a double submit creating duplicate shares.
  createForm?.addEventListener("submit", () => {
    setTimeout(() => {
      if (createBtn) createBtn.disabled = true;
    }, 0);
  });

  urlInput?.addEventListener("focus", () => urlInput.select());

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(urlInput.value);
      copyBtn.textContent = "Copied";
    } catch {
      urlInput.focus();
      urlInput.select();
    }
  });
})();
