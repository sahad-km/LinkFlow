import "dotenv/config";
import app from "./app.js";
import logger from "./logger.js";

const PORT = process.env.PORT || 8000;

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, "Gateway shutdown initiated");

    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        logger.info("Gateway shut down successfully");
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "Gateway shutdown failed");
        process.exit(1);
    }
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Gateway server started");
});
