import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "linkflow_access_secret_key_2026";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "linkflow_refresh_secret_key_2026";
const ACCESS_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";

export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export const generateTokens = (user) => {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role || "user"
    };

    // Use crypto.randomUUID() as jti to guarantee uniqueness even if issued in the same second
    const accessToken = jwt.sign(payload, ACCESS_SECRET, {
        expiresIn: ACCESS_EXPIRES_IN,
        jwtid: crypto.randomUUID()
    });

    const refreshToken = jwt.sign(payload, REFRESH_SECRET, {
        expiresIn: REFRESH_EXPIRES_IN,
        jwtid: crypto.randomUUID()
    });

    return { accessToken, refreshToken };
};

export const verifyAccessToken = (token) => {
    try {
        return { valid: true, payload: jwt.verify(token, ACCESS_SECRET) };
    } catch (err) {
        return { valid: false, error: err.message };
    }
};

export const verifyRefreshToken = (token) => {
    try {
        return { valid: true, payload: jwt.verify(token, REFRESH_SECRET) };
    } catch (err) {
        return { valid: false, error: err.message };
    }
};
