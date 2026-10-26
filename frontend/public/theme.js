// Thème appliqué avant le premier rendu : aucun flash de couleur. Préférence enregistrée par le bouton du
// bandeau, sinon le thème vert forêt, identité visuelle d'Attesta. Fichier séparé : la CSP n'autorise aucun
// script en ligne.
try {
  const saved = localStorage.getItem("attesta-theme");
  document.documentElement.classList.toggle("dark", saved ? saved === "sombre" : true);
} catch {
  // stockage indisponible (navigation privée stricte) : thème vert forêt
  document.documentElement.classList.add("dark");
}
