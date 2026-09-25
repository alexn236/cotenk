try {
  var t = localStorage.getItem("cotenk-theme");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
  } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    document.documentElement.dataset.theme = "light";
  }
} catch (e) {}
