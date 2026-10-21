import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ApiError } from "./api/client";
import { App } from "./App";
import { SessionProvider } from "./auth/session";
import { ToastProvider } from "./components/toasts";
import "./index.css";
import { DraftProvider } from "./lib/draftStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Une erreur de requête (4xx) ne se corrige pas en réessayant : seules les pannes sont reprises.
      retry: (count, error) =>
        count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <DraftProvider>
              <App />
            </DraftProvider>
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
