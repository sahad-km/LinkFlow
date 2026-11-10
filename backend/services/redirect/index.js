import "dotenv/config";
import express from "express";
import morgan from "morgan";
import { connectDB } from "./config/db.js";
import { connectProducer, disconnectProducer } from "./producers/clickProducer.js";
import redirectRoutes from "./routes/redirect.routes.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(morgan("dev"));

// Health check / Service info
app.get("/", (req, res) => {
    res.json({
        service: "LinkFlow Redirect Service",
        status: "active",
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// Mount redirect routes (support both direct /:shortCode and gateway-forwarded paths)
app.use("/redirect", redirectRoutes);
app.use("/", redirectRoutes);

const PORT = process.env.PORT || 8003;

const server = app.listen(PORT, async () => {
    console.log(`Redirect server is running on port ${PORT}`);
    await connectDB();
    await connectProducer();
});

const gracefulShutdown = async () => {
    console.log("\nRedirect Service shutting down...");
    await disconnectProducer();
    server.close(() => {
        process.exit(0);
    });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);