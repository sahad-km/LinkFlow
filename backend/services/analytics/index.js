
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

const PORT = process.env.PORT || 8004;

let server;
let startupPromise;

const startServer = async () => {
    try {
        await connectDB();
        await connectDLQProducer();
        await connectConsumer();

        server = app.listen(PORT, () => {
            console.log(`Analytics server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Analytics service startup failed:", error);
        process.exit(1);
    }
};

let isShuttingDown = false;

const gracefulShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nAnalytics Service shutting down...");

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
            console.log("HTTP server closed");
        }

        // 2. Disconnect Kafka consumer

        await disconnectConsumer();
        console.log("Kafka consumer disconnected");

        await disconnectDLQProducer();
        console.log("DLQ producer disconnected");

    } catch (error) {
        console.error("Error during service shutdown:", error);
        process.exitCode = 1;
    } finally {
        // 3. Close PostgreSQL pool
        try {
            await sql.end({ timeout: 5 });
            console.log("PostgreSQL connection pool closed");
        } catch (error) {
            console.error("Error closing PostgreSQL:", error);
            process.exitCode = 1;
        }
    }
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startupPromise = startServer();
