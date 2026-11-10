import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();

// Core middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// Health check / Service info
app.get("/", (req, res) => {
    res.json({
        service: "LinkFlow Auth Service",
        status: "active",
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// Mount auth routes (support both direct /auth prefix and proxied root path)
app.use("/auth", authRoutes);
app.use("/", authRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

// Centralized error handling
app.use((err, req, res, next) => {
    console.error("Unhandled Auth Error:", err);
    res.status(err.status || 500).json({
        message: err.message || "Internal server error"
    });
});

const PORT = process.env.PORT || 8001;
app.listen(PORT, async () => {
    console.log(`Auth server is running on port ${PORT}`);
    await connectDB();
});