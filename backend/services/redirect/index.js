
import app from "./app.js";
import { connectDB, closeDB } from "./config/db.js";
import redis from "./config/redis.js";
import {
    connectProducer,
    disconnectProducer
} from "./producers/clickProducer.js";
import { waitForPendingAnalytics } from "./controllers/redirect.controller.js";

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
        console.log("Shutdown: Pending analytics completed");
    } else {
        console.warn(
            `Shutdown: Analytics wait timed out after ${ANALYTICS_SHUTDOWN_TIMEOUT_MS}ms`
        );
    }
};

const startServer = async () => {
    try {
        await connectDB();
        await redis.ping();
        console.log("Redirect Service: Redis Connected");

        await connectProducer();

        server = app.listen(PORT, () => {
            console.log(`Redirect server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Redirect Service startup failed:", error);
        await shutdown();
        process.exit(1);
    }
};


let isShuttingDown = false;

const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nRedirect Service shutting down...");

    // 1. Stop accepting new HTTP requests.
    // if (server) {
    //     await new Promise((resolve) => {
    //         server.close(resolve);
    //     });

    //     console.log("HTTP server closed");
    // }

    if (server) {
        console.log("Shutdown: Closing HTTP server...");

        await new Promise((resolve) => {
            server.close((error) => {
                if (error) {
                    console.error("HTTP server close error:", error);
                } else {
                    console.log("HTTP server closed");
                }

                resolve();
            });
        });
    }

    console.log("Shutdown: HTTP server step completed");


    // Wait for ongoing analytics operations.
    console.log("Shutdown: Waiting for pending analytics...");

    await waitForAnalyticsWithTimeout();

    // 2. Disconnect Kafka.
    try {
        console.log("Shutdown: Disconnecting Kafka...");
        await disconnectProducer();
        console.log("Shutdown: Kafka disconnected");
    } catch (error) {
        console.error("Kafka shutdown failed:", error.message);
    }

    // 3. Close Redis.
    try {
        console.log("Shutdown: Closing Redis...");
        if (redis.status !== "end") {
            await redis.quit();
        }
        console.log("Shutdown: Redis closed");
    } catch (error) {
        console.error("Redis shutdown failed:", error.message);
    }

    // 4. Close PostgreSQL.
    try {
        console.log("Shutdown: Closing PostgreSQL...");
        await closeDB();
        console.log("Shutdown: PostgreSQL closed");
    } catch (error) {
        console.error("PostgreSQL shutdown failed:", error.message);
    }

    console.log("Redirect Service shutdown complete");
};


process.on("SIGINT", () => {
    console.log("SIGINT received");
    shutdown().catch((error) => {
        console.error("Shutdown error:", error);
    });
});

process.on("SIGTERM", () => {
    console.log("SIGTERM received");
    shutdown().catch((error) => {
        console.error("Shutdown error:", error);
    });
});

startServer();
