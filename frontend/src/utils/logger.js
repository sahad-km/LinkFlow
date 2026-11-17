/**
 * Lightweight frontend logger utility for LinkFlow.
 *
 * - In development: Outputs structured messages to the browser console with timestamp and log levels.
 * - In production: Suppresses debug/info/warn output to avoid unnecessary console clutter.
 * - Automatic redaction of sensitive parameters (passwords, tokens, credentials).
 */

const isDev = import.meta.env.DEV;

const SENSITIVE_KEYS = [
    "password",
    "oldpassword",
    "newpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "cookie",
    "secret",
];

const sanitize = (value) => {
    if (value === null || value === undefined) return value;

    if (typeof value === "string") {
        return value;
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: isDev ? value.stack : undefined,
        };
    }

    if (Array.isArray(value)) {
        return value.map(sanitize);
    }

    if (typeof value === "object") {
        const sanitized = {};
        for (const [key, val] of Object.entries(value)) {
            if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
                sanitized[key] = "[REDACTED]";
            } else {
                sanitized[key] = sanitize(val);
            }
        }
        return sanitized;
    }

    return value;
};

const formatPrefix = (level) => {
    const timestamp = new Date().toISOString();
    return `[LinkFlow][${timestamp}][${level.toUpperCase()}]`;
};

export const logger = {
    debug: (...args) => {
        if (isDev) {
            console.debug(formatPrefix("debug"), ...args.map(sanitize));
        }
    },

    info: (...args) => {
        if (isDev) {
            console.info(formatPrefix("info"), ...args.map(sanitize));
        }
    },

    warn: (...args) => {
        if (isDev) {
            console.warn(formatPrefix("warn"), ...args.map(sanitize));
        }
    },

    error: (...args) => {
        console.error(formatPrefix("error"), ...args.map(sanitize));
    },
};

export default logger;
