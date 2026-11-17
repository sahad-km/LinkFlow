import "dotenv/config";
import app from "./app.js";
import { connectDB, sql } from "./config/db.js";
import {
    connectConsumer,
    disconnectConsumer
} from "./consumers/clickConsumer.js";
import {
    connectDLQProducer,
    disconnectDLQProducer
} from "./producers/dlqProducer.js";
import logger from "./logger.js";

const PORT = process.env.PORT || 8004;

let server;
let startupPromise;

const startServer = async () => {
    try {
        await connectDB();
        await connectDLQProducer();
        await connectConsumer();

        server = app.listen(PORT, () => {
            logger.info({ port: PORT }, `Analytics server is running on port ${PORT}`);
        });
    } catch (error) {
        logger.error({ err: error }, "Analytics service startup failed");
        process.exit(1);
    }
};

let isShuttingDown = false;

const gracefulShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info("Analytics Service shutting down...");

    try {
        // Wait for startup to finish before shutting down.
        if (startupPromise) {
            await startupPromise.catch(() => { });
        }

        // 1. Stop accepting HTTP requests
        if (server) {
            await new Promise((resolve) => {
                server.close(resolve);
            });
            logger.info("HTTP server closed");
        }

        // 2. Disconnect Kafka consumer

        await disconnectConsumer();
        logger.info("Kafka consumer disconnected");

        await disconnectDLQProducer();
        logger.info("DLQ producer disconnected");

    } catch (error) {
        logger.error({ err: error }, "Error during service shutdown");
        process.exitCode = 1;
    } finally {
        // 3. Close PostgreSQL pool
        try {
            await sql.end({ timeout: 5 });
            logger.info("PostgreSQL connection pool closed");
        } catch (error) {
            logger.error({ err: error }, "Error closing PostgreSQL");
            process.exitCode = 1;
        }
    }
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startupPromise = startServer();
