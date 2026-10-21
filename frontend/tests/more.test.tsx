import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCall, download, publicCall, session } from "../src/api/client";
import { admin, auth, cv, jobs, letters, profiles, watch } from "../src/api/endpoints";
import { RequireAccount, RequireSession } from "../src/auth/guards";
import { SessionProvider, useSession } from "../src/auth/session";
import { formatDateTime, formatDay, percent } from "../src/lib/describe";
import { DraftProvider, useDraft } from "../src/lib/draftStore";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: { url: string; method: string; body?: unknown }[] = [];
beforeEach(() => {
  calls = [];
  session.set({ accessToken: "t", expiresIn: 900, user: { id: "u", role: "admin" } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      body: init.body instanceof FormData ? "formulaire" : init.body && JSON.parse(String(init.body)),
    });
    return json(200, []);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  session.set(null);
});

describe("appels par service, à travers la gateway", () => {
  it("vise les bonnes routes avec les bonnes méthodes", async () => {
    await Promise.all([
      auth.me(),
      auth.setPromoConsent(true),
      auth.deleteAccount(),
      auth.adminStats(),
      profiles.current(),
      profiles.save({ basics: { name: "x", profiles: [] } } as never),
      profiles.remove(),
      profiles.versions(),
      profiles.importPdf(new File(["%PDF"], "cv.pdf")),
      profiles.adminStats(),
      jobs.offers(),
      jobs.offer("o"),
      jobs.createOffer("texte", undefined),
      jobs.fromPosting("p"),
      jobs.deleteOffer("o"),
      jobs.postings({ q: "node", country: "" }),
      jobs.cities("DE", "Ber"),
      jobs.adminStats(),
      cv.generations(),
      cv.generation("g"),
      cv.correct("g", { revision: 2, lines: [] }),
      cv.remove("g"),
      cv.adminStats(),
      letters.list(),
      letters.get("l"),
      letters.create("g", "sobre"),
      letters.update("l", { greeting: "a", closing: "b", paragraphs: [] }),
      letters.remove("l"),
      letters.previewCv({ generationId: "g", variant: "ats" }),
      letters.adminStats(),
      watch.subscription(),
      watch.save({
        occupations: ["Dev"],
        country: "DE",
        city: "Berlin",
        radiusKm: 25,
        workingTime: "plein",
        consent: true,
      }),
      watch.stop(),
      watch.matches(),
      watch.adminStats(),
      watch.runs(),
      watch.runNow(),
      admin.health(),
    ]);
    const routes = calls.map((c) => `${c.method} ${c.url}`);
    expect(routes).toEqual(
      expect.arrayContaining([
        "PUT /api/auth/v1/me/consents",
        "DELETE /api/auth/v1/me",
        "PUT /api/profiles/v1/profiles/me",
        "POST /api/profiles/v1/profiles/import",
        "POST /api/jobs/v1/offers/from-posting/p",
        "GET /api/jobs/v1/postings?q=node",
        "GET /api/jobs/v1/cities?country=DE&q=Ber",
        "PATCH /api/cv/v1/generations/g/lines",
        "POST /api/letters/v1/exports/cv/preview",
        "PUT /api/watch/v1/subscriptions/me",
        "POST /api/watch/v1/admin/runs",
        "GET /api/admin/v1/health",
      ]),
    );
    expect(calls.find((c) => c.url.endsWith("/me") && c.method === "DELETE")!.body).toEqual({
      confirm: true,
    });
  });

  it("appels sans jeton : lien magique (anti-CSRF) et liens des e-mails de la veille", async () => {
    await auth.requestLink("lea@example.org");
    await auth.previewLink("jeton");
    await auth.openSession("jeton");
    await watch.confirm("jeton");
    await watch.unsubscribe("jeton");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/auth/v1/login-links",
      "GET /api/auth/v1/login-links/jeton",
      "POST /api/auth/v1/session",
      "POST /api/watch/v1/subscriptions/confirm/jeton",
      "POST /api/watch/v1/subscriptions/unsubscribe/jeton",
    ]);
    expect(calls[0]!.body).toEqual({ email: "lea@example.org", policyAccepted: true });
  });

  it("propage les erreurs des appels sans jeton", async () => {
    vi.stubGlobal("fetch", async () =>
      json(410, { type: "urn:attesta:erreur:lien_invalide", title: "Lien expiré", status: 410 }),
    );
    await expect(authCall("/x", "GET")).rejects.toMatchObject({ status: 410, message: "Lien expiré" });
    await expect(publicCall("/x")).rejects.toMatchObject({ code: "lien_invalide" });
  });

  it("télécharge un fichier sous le nom donné par le serveur", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("%PDF", {
          status: 200,
          headers: { "content-disposition": 'attachment; filename="cv-lea.pdf"' },
        }),
    );
    const created = vi.fn(() => "blob:essai");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await download("/letters/v1/exports/cv", { method: "POST", body: {} }, "cv.pdf");
    expect(click).toHaveBeenCalled();
    expect(created).toHaveBeenCalled();
    await letters.exportCv({ variant: "ats" });
    await letters.pdf("l");
    await auth.exportData();
    expect(click).toHaveBeenCalledTimes(4);
  });
});

describe("brouillon du parcours", () => {
  it("se conserve dans la session de l'onglet, et s'efface", () => {
    sessionStorage.clear();
    const { result, unmount } = renderHook(() => useDraft(), {
      wrapper: ({ children }: { children: ReactNode }) => <DraftProvider>{children}</DraftProvider>,
    });
    act(() => result.current.update((d) => ({ ...d, basics: { ...d.basics, name: "Léa" } })));
    act(() => result.current.setOfferId("o-1"));
    unmount();
    const again = renderHook(() => useDraft(), {
      wrapper: ({ children }: { children: ReactNode }) => <DraftProvider>{children}</DraftProvider>,
    });
    expect(again.result.current).toMatchObject({ offerId: "o-1", restored: true });
    expect(again.result.current.draft.basics.name).toBe("Léa");
    act(() => again.result.current.clear());
    expect(again.result.current.draft.basics.name).toBe("");
    expect(sessionStorage.getItem("attesta-brouillon")).toContain('"name":""');
  });
});

function withSession(ui: ReactNode, path = "/") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>{ui}</SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("session et gardes", () => {
  it("renvoie un invité vers la connexion pour une page de compte", async () => {
    session.set(null);
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("/refresh")
        ? json(401)
        : json(200, { accessToken: "g", expiresIn: 60, user: { id: "guest_1", role: "guest" } }),
    );
    withSession(
      <Routes>
        <Route
          path="/compte"
          element={
            <RequireAccount>
              <p>Mon compte</p>
            </RequireAccount>
          }
        />
        <Route path="/connexion" element={<p>Page de connexion</p>} />
      </Routes>,
      "/compte",
    );
    await waitFor(() => expect(screen.getByText("Page de connexion")).toBeInTheDocument());
  });

  it("ouvre la page une fois la session établie, puis déconnecte et repasse en invité", async () => {
    session.set(null);
    let loggedIn = true;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/refresh"))
        return loggedIn
          ? json(200, { accessToken: "c", expiresIn: 60, user: { id: "u", role: "candidate" } })
          : json(401);
      if (init.method === "DELETE") {
        loggedIn = false;
        return new Response(null, { status: 204 });
      }
      return json(200, { accessToken: "g", expiresIn: 60, user: { id: "guest_2", role: "guest" } });
    });
    function Probe() {
      const s = useSession();
      return (
        <div>
          <p>Rôle : {s.user?.role ?? "aucun"}</p>
          <button onClick={() => void s.signOut()}>Sortir</button>
        </div>
      );
    }
    withSession(
      <RequireSession>
        <Probe />
      </RequireSession>,
    );
    expect(await screen.findByText("Rôle : candidate")).toBeInTheDocument();
    act(() => screen.getByText("Sortir").click());
    expect(await screen.findByText("Rôle : guest")).toBeInTheDocument();
  });
});

describe("formats", () => {
  it("affiche dates et pourcentages en français", () => {
    expect(formatDay("2026-10-21T10:00:00Z")).toBe("21 octobre 2026");
    expect(formatDateTime("2026-10-21T10:00:00Z")).toMatch(/^21 octobre 2026/);
    expect(percent(0.876)).toBe("88 %");
  });
});
