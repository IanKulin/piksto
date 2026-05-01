(function () {
  const zone = document.getElementById("drop-zone");
  const input = document.getElementById("file-input");
  const fileList = document.getElementById("file-list");
  const uploadBtn = document.getElementById("upload-btn");
  const form = zone.closest("form");

  let selectedFiles = [];

  function isImage(file) {
    return file.type.startsWith("image/");
  }

  function renderFileList() {
    fileList.innerHTML = "";
    for (const file of selectedFiles) {
      const item = document.createElement("div");
      item.className = "file-list__item";
      item.dataset.filename = file.name;

      const name = document.createElement("span");
      name.className = "file-list__name";
      name.textContent = file.name;

      const status = document.createElement("span");
      status.className = "file-list__status";
      status.textContent = "pending";

      item.appendChild(name);
      item.appendChild(status);
      fileList.appendChild(item);
    }
  }

  function setFileStatus(file, state, message) {
    const item = fileList.querySelector(`[data-filename="${CSS.escape(file.name)}"]`);
    if (!item) return;
    const status = item.querySelector(".file-list__status");
    status.className = "file-list__status";
    if (state === "uploading") {
      status.classList.add("file-list__status--uploading");
      status.textContent = "uploading…";
    } else if (state === "done") {
      status.classList.add("file-list__status--done");
      status.textContent = "done";
    } else if (state === "error") {
      status.classList.add("file-list__status--error");
      status.textContent = message ? `error: ${message}` : "error";
    }
  }

  async function uploadOne(file) {
    const body = new FormData();
    body.append("image", file);
    try {
      const res = await fetch("/upload/file", { method: "POST", body });
      if (res.redirected && res.url.includes("success=1")) return { ok: true };
      if (res.ok || res.redirected) return { ok: true };
      const html = await res.text();
      const match = html.match(/banner--error[^>]*>([^<]+)</);
      const error = match ? match[1].trim() : "Upload failed";
      return { ok: false, error };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  zone.addEventListener("dragover", function (e) {
    e.preventDefault();
    zone.classList.add("drop-zone--active");
  });

  zone.addEventListener("dragleave", function () {
    zone.classList.remove("drop-zone--active");
  });

  zone.addEventListener("drop", function (e) {
    e.preventDefault();
    zone.classList.remove("drop-zone--active");
    const dropped = Array.from(e.dataTransfer.files).filter(isImage);
    if (dropped.length === 0) return;
    selectedFiles = dropped;
    const dt = new DataTransfer();
    for (const f of dropped) dt.items.add(f);
    input.files = dt.files;
    renderFileList();
    uploadBtn.disabled = false;
  });

  const label = zone.querySelector('label[for="file-input"]');
  label.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener("change", function () {
    selectedFiles = Array.from(input.files);
    renderFileList();
    uploadBtn.disabled = selectedFiles.length === 0;
  });

  uploadBtn.addEventListener("click", async function (e) {
    e.preventDefault();
    if (selectedFiles.length === 0) return;
    uploadBtn.disabled = true;

    let allOk = true;
    for (const file of selectedFiles) {
      setFileStatus(file, "uploading");
      const result = await uploadOne(file);
      if (result.ok) {
        setFileStatus(file, "done");
      } else {
        setFileStatus(file, "error", result.error);
        allOk = false;
      }
    }

    if (allOk) {
      window.location.href = "/?success=1";
    } else {
      uploadBtn.disabled = false;
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
  });
})();
