// Pre-paint theme (mirrors src/lib/theme.ts): "dark" / "light" as
// chosen, anything else ("system", unset) follows the OS.
try {
  var t = localStorage.getItem("cotenk-theme");
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  document.documentElement.dataset.theme = t;
} catch (e) {}
