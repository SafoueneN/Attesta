/** Démarre le serveur et l'arrête proprement sur SIGTERM et SIGINT (compose, Ctrl+C). */
export function startServer({ app, port, logger, onClose }) {
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            logger.info({ event: "demarrage", port }, "service démarré");
            resolve(server);
        });
        let stopping = false;
        const stop = (signal) => {
            if (stopping)
                return;
            stopping = true;
            logger.info({ event: "arret", signal }, "arrêt demandé");
            server.close(async () => {
                try {
                    await onClose?.();
                    process.exit(0);
                }
                catch (err) {
                    logger.error({ err }, "échec de la libération des ressources");
                    process.exit(1);
                }
            });
            // Connexions longues (SSE) : on n'attend pas plus de 10 s.
            setTimeout(() => process.exit(1), 10_000).unref();
        };
        process.once("SIGTERM", () => stop("SIGTERM"));
        process.once("SIGINT", () => stop("SIGINT"));
    });
}
