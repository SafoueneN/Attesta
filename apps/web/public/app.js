// Amélioration progressive : tout le parcours fonctionne sans JavaScript.
(() => {
  const root = document.documentElement;
  const KEY = "attesta-theme";

  // Le stockage local peut être indisponible (navigation privée, sites bloqués).
  const read = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const save = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Préférence non mémorisée : le thème reste valable pour la page en cours.
    }
  };

  const stored = read();
  if (stored === "dark" || stored === "light") root.dataset.theme = stored;

  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    const current = () =>
      root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const sync = () => toggle.setAttribute("aria-pressed", String(current() === "dark"));
    toggle.hidden = false;
    sync();
    toggle.addEventListener("click", () => {
      root.dataset.theme = current() === "dark" ? "light" : "dark";
      save(root.dataset.theme);
      sync();
    });
  }

  // Après une erreur de validation, le focus va au récapitulatif pour qu'il soit lu.
  document.querySelector("[data-error-summary]")?.focus();
})();
