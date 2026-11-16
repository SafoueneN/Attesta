// Extension « Cibler cette offre » (ADR 0044) : lit le texte de l'annonce dans l'onglet actif (sélection,
// sinon contenu principal de la page), puis ouvre Attesta à l'étape « Offre visée » avec ce texte dans le
// fragment de l'URL : il n'est jamais envoyé à un serveur, ni à Attesta ni à un tiers. Aucune donnée n'est
// conservée par l'extension, hormis l'adresse d'Attesta choisie.

const adresse = document.getElementById("adresse");
const etat = document.getElementById("etat");
const bouton = document.getElementById("envoyer");

chrome.storage.local.get("adresse").then(({ adresse: saved }) => {
  if (saved) adresse.value = saved;
});
adresse.addEventListener("change", () => chrome.storage.local.set({ adresse: adresse.value }));

/** Exécuté dans la page : sélection, sinon le bloc de texte le plus long (l'annonce), titre en tête. */
function lireAnnonce() {
  const selection = String(window.getSelection() ?? "").trim();
  if (selection.length > 200) return selection;
  const blocs = [...document.querySelectorAll("main, article, [role=main], section, div")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.innerText.trim())
    .filter((t) => t.length > 300 && t.length < 30000)
    .sort((a, b) => b.length - a.length);
  // Le plus long bloc contient souvent toute la page : on préfère le plus court qui garde 80 % du texte.
  const plusLong = blocs[0] ?? document.body.innerText;
  const cible = blocs.reverse().find((t) => t.length >= plusLong.length * 0.6) ?? plusLong;
  const titre = document.querySelector("h1")?.innerText.trim();
  return [titre, cible].filter(Boolean).join("\n\n");
}

bouton.addEventListener("click", async () => {
  bouton.disabled = true;
  etat.textContent = "Lecture de l'annonce…";
  try {
    const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: onglet.id },
      func: lireAnnonce,
    });
    const texte = String(result ?? "").slice(0, 20000);
    if (texte.length < 100) throw new Error("trop court");
    const fragment = new URLSearchParams({ annonce: texte, source: onglet.url ?? "" });
    const base = adresse.value.replace(/\/$/, "");
    await chrome.tabs.create({ url: `${base}/cv/etape/3#${fragment}` });
    window.close();
  } catch {
    etat.textContent = "Annonce introuvable : sélectionnez le texte de l'offre, puis réessayez.";
    bouton.disabled = false;
  }
});
