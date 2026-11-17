import app from "./app.js";
import { connectDB, closeDB } from "./config/db.js";
import redis from "./config/redis.js";
import {
    connectProducer,
    disconnectProducer
} from "./producers/clickProducer.js";
import { waitForPendingAnalytics } from "./controllers/redirect.controller.js";
import logger from "./logger.js";

const ANALYTICS_SHUTDOWN_TIMEOUT_MS = Number(
    process.env.ANALYTICS_SHUTDOWN_TIMEOUT_MS || 10000
);

const PORT = process.env.PORT || 8003;

let server;

const waitForAnalyticsWithTimeout = async () => {
    let timeoutId;

    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(false), ANALYTICS_SHUTDOWN_TIMEOUT_MS);
    });

    const analyticsPromise = waitForPendingAnalytics().then(() => true);

    const completed = await Promise.race([
        analyticsPromise,
        timeoutPromise
    ]);

    clearTimeout(timeoutId);

    if (completed) {
        logger.info("Shutdown: Pending analytics completed");
    } else {
        logger.warn(
            { timeoutMs: ANALYTICS_SHUTDOWN_TIMEOUT_MS },
            `Shutdown: Analytics wait timed out after ${ANALYTICS_SHUTDOWN_TIMEOUT_MS}ms`
        );
    }
};

const startServer = async () => {
    try {
        await connectDB();
        await redis.ping();
        logger.info("Redirect Service: Redis Connected");

        await connectProducer();

        server = app.listen(PORT, () => {
            logger.info({ port: PORT }, `Redirect server is running on port ${PORT}`);
        });
    } catch (error) {
        logger.error({ err: error }, "Redirect Service startup failed");
        await shutdown();
        process.exit(1);
    }
};


let isShuttingDown = false;

const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info("Redirect Service shutting down...");

    if (server) {
        logger.info("Shutdown: Closing HTTP server...");

        await new Promise((resolve) => {
            server.close((error) => {
                if (error) {
                    logger.error({ err: error }, "HTTP server close error");
                } else {
                    logger.info("HTTP server closed");
                }

                resolve();
            });
        });
    }

    logger.info("Shutdown: HTTP server step completed");

    // Wait for ongoing analytics operations.
    logger.info("Shutdown: Waiting for pending analytics...");

    await waitForAnalyticsWithTimeout();

    // 2. Disconnect Kafka.
    try {
        logger.info("Shutdown: Disconnecting Kafka...");
        await disconnectProducer();
        logger.info("Shutdown: Kafka disconnected");
    } catch (error) {
        logger.error({ err: error }, "Kafka shutdown failed");
    }

    // 3. Close Redis.
    try {
        logger.info("Shutdown: Closing Redis...");
        if (redis.status !== "end") {
            await redis.quit();
        }
        logger.info("Shutdown: Redis closed");
    } catch (error) {
        logger.error({ err: error }, "Redis shutdown failed");
    }

    // 4. Close PostgreSQL.
    try {
        logger.info("Shutdown: Closing PostgreSQL...");
        await closeDB();
        logger.info("Shutdown: PostgreSQL closed");
    } catch (error) {
        logger.error({ err: error }, "PostgreSQL shutdown failed");
    }

    logger.info("Redirect Service shutdown complete");
};


process.on("SIGINT", () => {
    logger.info("SIGINT received");
    shutdown().catch((error) => {
        logger.error({ err: error }, "Shutdown error");
    });
});

process.on("SIGTERM", () => {
    logger.info("SIGTERM received");
    shutdown().catch((error) => {
        logger.error({ err: error }, "Shutdown error");
    });
});

startServer();
