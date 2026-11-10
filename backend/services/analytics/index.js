import "dotenv/config";
import express from "express";
import morgan from "morgan";
import { connectDB } from "./config/db.js";
import { connectConsumer, disconnectConsumer } from "./consumers/clickConsumer.js";
import analyticsRoutes from "./routes/analytics.routes.js";

const app = express();

app.use(express.json());
app.use(morgan("dev"));

// Health checks
app.get("/", (req, res) => {
    res.json({
        service: "LinkFlow Analytics Service",
        status: "active",
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// Analytics API routes (supports both /analytics/... and direct /...)
app.use("/analytics", analyticsRoutes);
app.use("/", analyticsRoutes);

const PORT = process.env.PORT || 8004;

const server = app.listen(PORT, async () => {
    console.log(`Analytics server is running on port ${PORT}`);
    await connectDB();
    await connectConsumer();
});

const gracefulShutdown = async () => {
    console.log("\nAnalytics Service shutting down...");
    await disconnectConsumer();
    server.close(() => {
        process.exit(0);
    });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);