const KEY = "piksto.allimagesFilter";

function readPref() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writePref(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // storage unavailable; the filter just won't persist
  }
}

if (readPref() === "none") {
  document
    .querySelectorAll('.site-nav a[href="/allimages"], .bottom-tab[href="/allimages"]')
    .forEach((a) => a.setAttribute("href", "/allimages?collection=none"));
}

document.querySelectorAll(".grid-toolbar__filter").forEach((a) => {
  a.addEventListener("click", () => {
    writePref(a.dataset.filter);
  });
});
