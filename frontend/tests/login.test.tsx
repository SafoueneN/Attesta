import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { session } from "../src/api/client";
import { SessionProvider } from "../src/auth/session";
import { RequireAdmin } from "../src/auth/guards";
import { ToastProvider } from "../src/components/toasts";
import { Login } from "../src/pages/Login";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrap(ui: ReactNode, path = "/") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <SessionProvider>{ui}</SessionProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  session.set(null);
});

describe("connexion", () => {
  it("affiche un résumé d'erreurs focalisé qui mène aux champs (création de compte)", async () => {
    vi.stubGlobal("fetch", async () =>
      json(200, { accessToken: "t", expiresIn: 60, user: { id: "g", role: "guest" } }),
    );
    const user = userEvent.setup();
    wrap(<Login />);
    await user.click(screen.getByRole("tab", { name: "Créer un compte" }));
    await user.type(screen.getByLabelText("Mot de passe"), "un-mot-de-passe-long");
    await user.type(screen.getByLabelText("Confirmer le mot de passe"), "un-autre");
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveFocus();
    expect(summary).toHaveTextContent("Les deux mots de passe ne sont pas identiques.");
    expect(summary).toHaveTextContent(
      "Acceptez les conditions d'utilisation et la politique de confidentialité",
    );
    expect(screen.getByLabelText("Identifiant")).toHaveAttribute("aria-invalid", "true");
  });

  it("connecte avec l'identifiant et le mot de passe, sans adresse e-mail", async () => {
    const calls: { route: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ route: `${init.method} ${url}`, body: init.body && JSON.parse(String(init.body)) });
      const role = url.endsWith("/session/password") ? "candidate" : "guest";
      return json(200, { accessToken: "t", expiresIn: 60, user: { id: "u", role } });
    });
    const user = userEvent.setup();
    wrap(<Login />);
    await user.type(screen.getByLabelText("Identifiant"), "  lea.martin ");
    await user.type(screen.getByLabelText("Mot de passe"), "demo-attesta-local");
    await user.click(screen.getByRole("button", { name: "Me connecter" }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        route: "POST /api/auth/v1/session/password",
        body: { username: "lea.martin", password: "demo-attesta-local" },
      }),
    );
  });
});

describe("routes protégées", () => {
  it("renvoie un candidat vers la page d'accès refusé pour l'administration", async () => {
    vi.stubGlobal("fetch", async () =>
      json(200, { accessToken: "t", expiresIn: 60, user: { id: "u", role: "candidate" } }),
    );
    wrap(
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <p>Tableau de bord</p>
            </RequireAdmin>
          }
        />
        <Route path="/acces-refuse" element={<p>Accès refusé</p>} />
      </Routes>,
      "/admin",
    );
    await waitFor(() => expect(screen.getByText("Accès refusé")).toBeInTheDocument());
    expect(screen.queryByText("Tableau de bord")).not.toBeInTheDocument();
  });
});
