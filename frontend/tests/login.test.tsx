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
  it("affiche un résumé d'erreurs focalisé qui mène aux champs", async () => {
    vi.stubGlobal("fetch", async () =>
      json(200, { accessToken: "t", expiresIn: 60, user: { id: "g", role: "guest" } }),
    );
    const user = userEvent.setup();
    wrap(<Login />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "pas-une-adresse");
    await user.click(screen.getByRole("button", { name: "Recevoir mon lien de connexion" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveFocus();
    expect(summary).toHaveTextContent("Saisissez une adresse e-mail valide.");
    expect(summary).toHaveTextContent("Acceptez la politique de confidentialité");
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("envoie le lien et confirme sans révéler si le compte existe", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      if (url.includes("/session"))
        return json(200, { accessToken: "t", expiresIn: 60, user: { id: "g", role: "guest" } });
      return json(202, { message: "ok" });
    });
    const user = userEvent.setup();
    wrap(<Login />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "Lea@Example.org");
    await user.click(screen.getByLabelText(/politique de confidentialité/));
    await user.click(screen.getByRole("button", { name: "Recevoir mon lien de connexion" }));
    expect(await screen.findByText("Lien envoyé")).toBeInTheDocument();
    expect(calls).toContain("POST /api/auth/v1/login-links");
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
