import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { letters } from "../api/endpoints";
import { buttonClass, Loading, useDocumentTitle } from "../components/ui";

/**
 * CV en ligne (ADR 0042), page publique : l'instantané partagé par le candidat, affiché dans un cadre
 * isolé (aucun script). Jamais indexée par les moteurs de recherche.
 */
export function SharedCv() {
  const { token = "" } = useParams();
  useDocumentTitle("CV partagé");
  const cv = useQuery({
    queryKey: ["cv-en-ligne", token],
    queryFn: () => letters.publicCv(token),
    retry: false,
  });
  return (
    <div className="min-h-screen bg-surface-sunken">
      <meta name="robots" content="noindex, nofollow" />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3">
        <p className="text-sm text-ink-muted">
          CV partagé avec <span className="font-bold text-ink">Attesta</span> · chaque ligne renvoie au profil
          du candidat
        </p>
        <Link to="/" className={buttonClass("secondary")}>
          Créer mon CV
        </Link>
      </header>
      <main className="mx-auto max-w-[220mm] p-4">
        {cv.isPending && <Loading label="Chargement du CV…" />}
        {cv.isError && (
          <div className="card mt-10 text-center">
            <h1 className="text-xl font-bold">Ce CV n'est plus partagé</h1>
            <p className="mt-2 text-ink-muted">
              Le lien a expiré, a été retiré par son auteur, ou il est incorrect.
            </p>
          </div>
        )}
        {cv.data && (
          <iframe
            title="CV partagé"
            srcDoc={cv.data}
            sandbox=""
            className="h-[calc(100vh-6rem)] w-full rounded-2xl border border-line bg-white shadow-float"
          />
        )}
      </main>
    </div>
  );
}
