import { Navigate, Route, Routes } from "react-router";
import { RequireAccount, RequireAdmin, RequireSession } from "./auth/guards";
import { Layout } from "./components/Layout";
import { Account } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { Builder } from "./pages/Builder";
import { GenerationDetail, GenerationList } from "./pages/Generations";
import { Home } from "./pages/Home";
import { LetterEditor, LetterList } from "./pages/Letters";
import { Login, LoginConfirm } from "./pages/Login";
import { CollectedOffers, SavedOffers } from "./pages/Offers";
import { Forbidden, NotFound, Privacy } from "./pages/Static";
import { WatchLink, WatchPage } from "./pages/Watch";

/** Routes de l'application ; les liens des e-mails (connexion, veille) pointent vers ces adresses. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="connexion" element={<Login />} />
        <Route path="connexion/:token" element={<LoginConfirm />} />
        <Route path="confidentialite" element={<Privacy />} />
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
          path="veille"
          element={
            <RequireAccount>
              <WatchPage />
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
    </Routes>
  );
}
