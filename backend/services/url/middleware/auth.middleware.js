import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "linkflow_access_secret_key_2026";

/**
 * Optional authentication middleware:
 * If an authorization header or x-user-id is provided, attaches req.user.
 * Otherwise, allows the request to proceed as anonymous (req.user = null).
 */
export const optionalAuth = (req, res, next) => {
    try {
        // 1. Check if user ID is forwarded by API Gateway
        if (req.headers["x-user-id"]) {
            req.user = { id: req.headers["x-user-id"] };
            return next();
        }

        // 2. Check for Bearer token
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : null;

        if (token) {
            try {
                const decoded = jwt.verify(token, ACCESS_SECRET);
                req.user = decoded;
            } catch (err) {
                // If token is expired or invalid, proceed as anonymous or return 401?
                // Let's set req.user to null so anonymous shortening still works
                req.user = null;
            }
        } else {
            req.user = null;
        }

        next();
    } catch (err) {
        req.user = null;
        next();
    }
};

/**
 * Strict authentication middleware: Requires a valid logged-in user
 */
export const requireAuth = (req, res, next) => {
    optionalAuth(req, res, () => {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: "Authentication required to access this resource" });
        }
        next();
    });
};
