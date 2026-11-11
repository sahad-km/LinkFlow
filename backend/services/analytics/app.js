
import express from "express";
import morgan from "morgan";
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

// Analytics API routes
app.use("/analytics", analyticsRoutes);
app.use("/", analyticsRoutes);

export default app;
