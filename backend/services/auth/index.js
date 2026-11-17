import "dotenv/config";
import app from "./app.js";
import { connectDB, closeDB } from "./config/db.js";
import logger from "./logger.js";

const PORT = process.env.PORT || 8001;

let server;
let isShuttingDown = false;

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, "Auth service shutdown initiated");

    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        await closeDB();

        logger.info("Auth service shut down successfully");
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "Auth service shutdown failed");
        process.exit(1);
    }
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

const startServer = async () => {
    try {
        await connectDB();

        server = app.listen(PORT, () => {
            logger.info({ port: PORT }, "Auth server started");
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to start Auth service");
        process.exit(1);
    }
};

startServer();
