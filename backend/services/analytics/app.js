
import express from "express";
import morgan from "morgan";
import analyticsRoutes from "./routes/analytics.routes.js";
import logger from "./logger.js";

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

// Analytics API routes
app.use("/analytics", analyticsRoutes);
app.use("/", analyticsRoutes);

// Centralized error handling
app.use((err, req, res, next) => {
    logger.error({ err }, "Analytics Service Error");
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error"
    });
});

export default app;
