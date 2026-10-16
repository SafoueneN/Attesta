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

  // Génération : progression en direct (SSE). Sans EventSource, ou en cas
  // d'échec du flux, le formulaire est envoyé normalement.
  const generation = document.querySelector("[data-generation]");
  const status = document.querySelector("[data-generation-status]");
  if (generation && status && "EventSource" in window) {
    generation.addEventListener("submit", (event) => {
      event.preventDefault();
      const button = generation.querySelector("button[type=submit]");
      if (button) button.disabled = true;
      status.textContent = "Génération en cours…";
      const stream = new EventSource(generation.dataset.stream);
      let finished = false;
      const message = (e) => JSON.parse(e.data).message;
      stream.addEventListener("progress", (e) => {
        status.textContent = message(e);
      });
      stream.addEventListener("done", (e) => {
        finished = true;
        stream.close();
        window.location.assign(JSON.parse(e.data).redirect);
      });
      stream.addEventListener("failure", (e) => {
        finished = true;
        stream.close();
        status.textContent = message(e);
        if (button) button.disabled = false;
      });
      stream.addEventListener("error", () => {
        stream.close();
        if (!finished) generation.submit();
      });
    });
  }

  // Après une erreur de validation, le focus va au récapitulatif pour qu'il soit lu.
  document.querySelector("[data-error-summary]")?.focus();
})();
