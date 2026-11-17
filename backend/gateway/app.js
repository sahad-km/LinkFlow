import "dotenv/config";
import express from "express";
import proxy from "express-http-proxy";
import cors from "cors";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import logger from "./logger.js";

const app = express();

// Production-ready CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map(u => u.trim())
    : ["*"];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
}));

app.use(pinoHttp({
    logger,
    autoLogging: {
        ignore: (req) => process.env.NODE_ENV === "test" && req.url === "/health"
    },
    customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
    serializers: {
        req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
        }),
        res: (res) => ({
            statusCode: res.statusCode,
        }),
    },
}));

// 1. Global Rate Limiter: General DoS & aggressive crawler protection
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 600, // Limit each IP to 600 requests per 15 minutes
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests from this IP. Please try again after 15 minutes."
    }
});

// 2. Strict Auth Limiter: Brute-force & credential stuffing protection
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 25, // 25 login/register attempts per IP per 15 mins
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication attempts. Please wait 15 minutes before trying again."
    }
});

// 3. URL Creation Limiter: Prevents automated link generation spam
export const urlCreateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 50, // 50 URL creations per IP per 15 mins
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many shortened links created from this IP. Please wait a few minutes."
    }
});

// Apply global rate limiting across all gateway endpoints
app.use(globalLimiter);

// Gateway Health / Status
app.get("/", (req, res) => {
    res.json({
        service: "LinkFlow Gateway",
        status: "active",
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

const proxyOptions = {
    parseReqBody: false,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        if (srcReq.id) {
            proxyReqOpts.headers["x-request-id"] = srcReq.id;
        }
        return proxyReqOpts;
    },
};

// Target-specific rate limits before proxying
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);
app.use("/url/create", urlCreateLimiter);

// Dedicated service proxy routes
app.use("/auth", proxy(process.env.AUTH_SERVICE || "http://localhost:8001", proxyOptions));
app.use("/url", proxy(process.env.URL_SERVICE || "http://localhost:8002", proxyOptions));
app.use("/redirect", proxy(process.env.REDIRECT_SERVICE || "http://localhost:8003", proxyOptions));
app.use("/analytics", proxy(process.env.ANALYTICS_SERVICE || "http://localhost:8004", proxyOptions));

// TinyURL-style clean root short URL routing: GET /:shortCode -> Redirect Service
app.get("/:shortCode", proxy(process.env.REDIRECT_SERVICE || "http://localhost:8003", {
    ...proxyOptions,
    proxyReqPathResolver: (req) => `/${req.params.shortCode}`
}));

// Centralized error handling
app.use((err, req, res, next) => {
    logger.error({ err }, "Gateway unhandled error");
    if (!res.headersSent) {
        res.status(err.status || 500).json({
            message: err.message || "Internal gateway error"
        });
    }
});

export default app;
