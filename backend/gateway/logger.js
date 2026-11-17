import pino from "pino";

const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
        service: "gateway",
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
            "res.headers['set-cookie']",
        ],
        censor: "[REDACTED]",
    },
});

export default logger;
