import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { RequireAccount, RequireAdmin, RequireSession } from "./auth/guards";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { Home } from "./pages/Home";

/*
 * Pages chargées à la demande (un fichier JS par page) : le premier affichage ne télécharge que l'accueil et
 * le gabarit. L'attente est couverte par le `Suspense` du Layout.
 */
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const Applications = lazy(() => import("./pages/Applications").then((m) => ({ default: m.Applications })));
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const Builder = lazy(() => import("./pages/Builder").then((m) => ({ default: m.Builder })));
const Guide = lazy(() => import("./pages/Guide").then((m) => ({ default: m.Guide })));
const AssistantsHub = lazy(() =>
  import("./pages/assistants/Hub").then((m) => ({ default: m.AssistantsHub })),
);
const ProfileCoach = lazy(() =>
  import("./pages/assistants/ProfileCoach").then((m) => ({ default: m.ProfileCoach })),
);
const EvidencePage = lazy(() => import("./pages/Evidence").then((m) => ({ default: m.EvidencePage })));
const GenerationDetail = lazy(() =>
  import("./pages/Generations").then((m) => ({ default: m.GenerationDetail })),
);
const GenerationList = lazy(() => import("./pages/Generations").then((m) => ({ default: m.GenerationList })));
const LetterEditor = lazy(() => import("./pages/Letters").then((m) => ({ default: m.LetterEditor })));
const LetterList = lazy(() => import("./pages/Letters").then((m) => ({ default: m.LetterList })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const LoginConfirm = lazy(() => import("./pages/Login").then((m) => ({ default: m.LoginConfirm })));
const CollectedOffers = lazy(() => import("./pages/Offers").then((m) => ({ default: m.CollectedOffers })));
const SavedOffers = lazy(() => import("./pages/Offers").then((m) => ({ default: m.SavedOffers })));
const Forbidden = lazy(() => import("./pages/Static").then((m) => ({ default: m.Forbidden })));
const NotFound = lazy(() => import("./pages/Static").then((m) => ({ default: m.NotFound })));
const Privacy = lazy(() => import("./pages/Static").then((m) => ({ default: m.Privacy })));
const WatchLink = lazy(() => import("./pages/Watch").then((m) => ({ default: m.WatchLink })));
const Studio = lazy(() => import("./pages/studio/Studio").then((m) => ({ default: m.Studio })));
const WatchPage = lazy(() => import("./pages/Watch").then((m) => ({ default: m.WatchPage })));
const SharedCv = lazy(() => import("./pages/SharedCv").then((m) => ({ default: m.SharedCv })));
const Pricing = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const ExamplesList = lazy(() => import("./pages/Examples").then((m) => ({ default: m.ExamplesList })));
const ExampleDetail = lazy(() => import("./pages/Examples").then((m) => ({ default: m.ExampleDetail })));

/** Routes de l'application ; les liens des e-mails (connexion, veille) pointent vers ces adresses. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="connexion" element={<Login />} />
        <Route path="connexion/:token" element={<LoginConfirm />} />
        <Route path="confidentialite" element={<Privacy />} />
        <Route path="guide" element={<Guide />} />
        <Route path="exemples-cv" element={<ExamplesList />} />
        <Route path="tarifs" element={<Pricing />} />
        <Route path="exemples-cv/:slug" element={<ExampleDetail />} />
        <Route
          path="assistants"
          element={
            <RequireSession>
              <AssistantsHub />
            </RequireSession>
          }
        />
        <Route
          path="assistants/profil"
          element={
            <RequireSession>
              <ProfileCoach />
            </RequireSession>
          }
        />
        <Route path="veille/confirmer/:token" element={<WatchLink action="confirmer" />} />
        <Route path="veille/desabonner/:token" element={<WatchLink action="desabonner" />} />
        <Route path="cv" element={<Navigate to="/cv/etape/1" replace />} />
        <Route
          path="cv/etape/:step"
          element={
            <RequireSession>
              <Builder />
            </RequireSession>
          }
        />
        <Route
          path="mes-cv"
          element={
            <RequireSession>
              <GenerationList />
            </RequireSession>
          }
        />
        <Route
          path="mes-cv/:id"
          element={
            <RequireSession>
              <GenerationDetail />
            </RequireSession>
          }
        />
        <Route
          path="offres"
          element={
            <RequireSession>
              <SavedOffers />
            </RequireSession>
          }
        />
        <Route
          path="offres/collectees"
          element={
            <RequireSession>
              <CollectedOffers />
            </RequireSession>
          }
        />
        <Route
          path="lettres"
          element={
            <RequireAccount>
              <LetterList />
            </RequireAccount>
          }
        />
        <Route
          path="lettres/:id"
          element={
            <RequireAccount>
              <LetterEditor />
            </RequireAccount>
          }
        />
        <Route
          path="justificatifs"
          element={
            <RequireAccount>
              <EvidencePage />
            </RequireAccount>
          }
        />
        <Route
          path="veille"
          element={
            <RequireAccount>
              <WatchPage />
            </RequireAccount>
          }
        />
        <Route
          path="candidatures"
          element={
            <RequireAccount>
              <Applications />
            </RequireAccount>
          }
        />
        <Route
          path="compte"
          element={
            <RequireAccount>
              <Account />
            </RequireAccount>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
        <Route path="acces-refuse" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Studio IA : plein écran, avec sa propre barre (hors du gabarit commun). */}
      <Route
        path="studio/:id/:assistant?"
        element={
          <RequireSession>
            <Suspense fallback={<Loading />}>
              <Studio />
            </Suspense>
          </RequireSession>
        }
      />
      {/* CV en ligne (ADR 0042) : page publique, sans compte, hors du gabarit. */}
      <Route
        path="cv-en-ligne/:token"
        element={
          <Suspense fallback={<Loading />}>
            <SharedCv />
          </Suspense>
        }
      />
    </Routes>
  );
}
