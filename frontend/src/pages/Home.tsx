import { Link } from "react-router";
import { useSession } from "../auth/session";
import { useDocumentTitle } from "../components/ui";

const STEPS = [
  {
    title: "Votre profil, une fois",
    text: "Saisissez votre parcours ou importez votre CV PDF. Il devient la seule source de vérité.",
  },
  {
    title: "L'offre visée",
    text: "Collez l'annonce, ou choisissez une offre collectée. Ses exigences et mots-clés sont analysés.",
  },
  {
    title: "Un CV ciblé et prouvé",
    text: "Chaque ligne cite le fait de votre profil qui la prouve. Ce qui n'est pas prouvé est retiré.",
  },
  {
    title: "Relecture et export",
    text: "Corrigez ligne par ligne, exportez en PDF lisible par les ATS, rédigez la lettre.",
  },
];

export function Home() {
  useDocumentTitle("Accueil");
  const { isAccount } = useSession();
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="font-semibold text-brand-700 dark:text-brand-100">Le CV qui dit vrai</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
            Un CV ciblé pour chaque offre, prouvable ligne par ligne.
          </h1>
          <p className="mt-4 text-lg text-slate-700 dark:text-slate-300">
            Attesta adapte votre CV à l'offre sans jamais inventer : aucune compétence ajoutée, aucun chiffre
            gonflé. Les mots-clés que vous n'avez pas sont signalés, jamais ajoutés.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/cv"
              className="rounded-lg bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-800"
            >
              Créer mon CV ciblé
            </Link>
            {!isAccount && (
              <Link
                to="/connexion"
                className="rounded-lg border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Créer un compte
              </Link>
            )}
          </div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Sans compte, vos données sont effacées 24 heures après votre arrivée. Avec un compte : historique,
            lettres de motivation et veille emploi quotidienne.
          </p>
        </div>
        <div className="card" aria-hidden="true">
          <p className="text-sm font-semibold text-slate-500">Exemple de ligne vérifiée</p>
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
            Réduction de 40 % du temps de réponse de l'API de réservation
          </p>
          <p className="mt-1 text-xs text-slate-500">Source : Expérience 1 – réalisation 2</p>
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-950 line-through dark:bg-red-950 dark:text-red-100">
            Réduction de 60 % du temps de réponse grâce à Kubernetes
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">
            Retirée : le chiffre « 60 » et « Kubernetes » ne figurent pas dans votre profil
          </p>
        </div>
      </section>
      <section aria-labelledby="comment">
        <h2 id="comment" className="text-2xl font-bold">
          Comment ça marche
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card">
              <p className="text-sm font-bold text-brand-700 dark:text-brand-100">Étape {i + 1}</p>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
