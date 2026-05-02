(function () {
  try {
    // Wave 6 — the prototype is light-first. Default to light unless
    // the user has explicitly chosen another theme via /settings/theme.
    // This keeps the app looking consistent with the prototype on every
    // page (including the ones that haven't been migrated to
    // W6AppShell yet — they read the legacy theme tokens).
    var stored = localStorage.getItem("settle:theme");
    var theme = stored || "light";
    var resolved = theme;
    if (theme === "auto") {
      resolved =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    }
    document.documentElement.classList.toggle("light", resolved === "light");
    document.documentElement.classList.toggle("dark", resolved === "dark");
  } catch (e) {}
})();
