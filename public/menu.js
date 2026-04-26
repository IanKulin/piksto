const trigger = document.getElementById("user-menu-trigger");
const dropdown = document.getElementById("user-menu-dropdown");
if (trigger && dropdown) {
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains("user-menu__dropdown--open");
    dropdown.classList.toggle("user-menu__dropdown--open", !isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });
  document.addEventListener("click", () => {
    dropdown.classList.remove("user-menu__dropdown--open");
    trigger.setAttribute("aria-expanded", "false");
  });
}
