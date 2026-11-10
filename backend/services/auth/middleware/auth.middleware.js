import { verifyAccessToken } from "../utils/token.utils.js";

export const authenticateUser = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

        const token = bearerToken || req.cookies?.accessToken;

        if (!token) {
            return res.status(401).json({ message: "Unauthorized: No token provided" });
        }

        const { valid, payload, error } = verifyAccessToken(token);

        if (!valid) {
            return res.status(401).json({ message: "Unauthorized: Invalid or expired token", error });
        }

        req.user = payload;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
