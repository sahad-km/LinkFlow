import pino from "pino";

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
        service: "analytics",
    },
    redact: {
        paths: [
            "password",
            "token",
            "accessToken",
            "refreshToken",
            "req.headers.authorization",
            "req.headers.cookie",
            "headers.authorization",
            "headers.cookie",
        ],
        censor: "[REDACTED]",
    },
});

export default logger;
