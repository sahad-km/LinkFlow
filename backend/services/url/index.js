import "dotenv/config";
import app from "./app.js";
import { connectDB, closeDB } from "./config/db.js";
import { initCounter, closeRedis } from "./config/redis.js";
import logger from "./logger.js";

const PORT = process.env.PORT || 8002;

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, "URL service shutdown initiated");

    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        await closeRedis();
        await closeDB();

        logger.info("URL service shut down successfully");
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "URL service shutdown failed");
        process.exit(1);
    }
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

const startServer = async () => {
    try {
        await connectDB();
        await initCounter();

        server = app.listen(PORT, () => {
            logger.info({ port: PORT }, "URL server started");
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to start URL service");

        await closeRedis().catch((err) => {
            logger.error({ err }, "Failed to close Redis after startup failure");
        });

        await closeDB().catch((err) => {
            logger.error({ err }, "Failed to close PostgreSQL after startup failure");
        });

        process.exit(1);
    }
};

startServer();
