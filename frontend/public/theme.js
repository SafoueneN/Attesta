// Thème appliqué avant le premier rendu : aucun flash de couleur. Préférence locale, sinon système.
// Fichier séparé : la CSP n'autorise aucun script en ligne.
try {
  const saved = localStorage.getItem("attesta-theme");
  const dark = saved ? saved === "sombre" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch {
  // stockage indisponible (navigation privée stricte) : thème du système via CSS
}
