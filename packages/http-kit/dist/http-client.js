import { currentRequestId } from "@attesta/logger";
import { AppError } from "./errors.js";
/**
 * Réponse non attendue d'un autre service, ou service injoignable. Le message public reste générique ;
 * `upstreamStatus` et `problem` permettent au consommateur de réagir (404, 409…) sans tout relayer.
 */
export class UpstreamError extends AppError {
    target;
    upstreamStatus;
    problem;
    constructor(target, upstreamStatus, problem, options) {
        const unreachable = upstreamStatus === undefined || upstreamStatus >= 500;
        super(unreachable ? "service_indisponible" : "service_refus", unreachable ? 503 : 502, unreachable
            ? "Un service est momentanément indisponible. Réessayez dans un instant."
            : "Une erreur est survenue entre nos services. Réessayez dans un instant.", undefined, options);
        this.target = target;
        this.upstreamStatus = upstreamStatus;
        this.problem = problem;
        this.name = "UpstreamError";
    }
}
const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const RETRYABLE = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Client HTTP entre services (ADR 0012, point 5) : `X-Request-Id` propagé, délai d'attente, 2 reprises
 * avec gigue sur GET, PUT et DELETE, erreurs typées. Ne journalise ni corps ni en-tête.
 */
export function createServiceClient(options) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const base = options.baseUrl.replace(/\/+$/, "");
    const retries = options.retries ?? 2;
    async function send(method, path, req = {}) {
        const headers = { accept: "application/json", ...req.headers };
        const requestId = currentRequestId();
        if (requestId)
            headers["x-request-id"] = requestId;
        if (req.token)
            headers.authorization = `Bearer ${req.token}`;
        let body;
        if (req.body !== undefined) {
            headers["content-type"] = "application/json";
            body = JSON.stringify(req.body);
        }
        const attempts = IDEMPOTENT.has(method) ? retries + 1 : 1;
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0)
                await sleep(100 * 2 ** attempt + Math.random() * 100);
            try {
                const res = await fetchImpl(`${base}${path}`, {
                    method,
                    headers,
                    body,
                    signal: AbortSignal.timeout(req.timeoutMs ?? options.timeoutMs ?? 5000),
                });
                if (RETRYABLE.has(res.status) && attempt < attempts - 1) {
                    await res.body?.cancel();
                    lastError = new UpstreamError(options.target, res.status);
                    continue;
                }
                return res;
            }
            catch (err) {
                lastError = err;
            }
        }
        throw lastError instanceof UpstreamError
            ? lastError
            : new UpstreamError(options.target, undefined, undefined, { cause: lastError });
    }
    async function checked(method, path, req = {}) {
        const res = await send(method, path, req);
        const ok = req.accept ? req.accept.includes(res.status) : res.ok;
        if (ok)
            return res;
        let problem;
        try {
            problem = (await res.json());
        }
        catch {
            // corps absent ou non JSON
        }
        throw new UpstreamError(options.target, res.status, problem);
    }
    return {
        target: options.target,
        async json(method, path, req) {
            const res = await checked(method, path, req);
            const text = await res.text();
            return { status: res.status, data: (text ? JSON.parse(text) : undefined) };
        },
        raw: checked,
    };
}
/**
 * Jetons de service émis par `auth` (5 min), mis en cache par audience et portée jusqu'à 30 s avant
 * leur expiration.
 */
export function createServiceTokens({ client, service, secret }) {
    const cache = new Map();
    return async (audience, scope) => {
        const key = `${audience} ${scope}`;
        const cached = cache.get(key);
        if (cached && cached.until > Date.now())
            return cached.token;
        const { data } = await client.json("POST", "/internal/v1/token", { body: { service, secret, audience, scope } });
        cache.set(key, { token: data.accessToken, until: Date.now() + (data.expiresIn - 30) * 1000 });
        return data.accessToken;
    };
}
