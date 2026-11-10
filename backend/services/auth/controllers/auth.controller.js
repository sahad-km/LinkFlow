import bcrypt from "bcryptjs";
import sql from "../config/db.js";
import { generateTokens, verifyRefreshToken, COOKIE_OPTIONS } from "../utils/token.utils.js";

/**
 * Register a new user
 * POST /register
 */
export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const [existingUser] = await sql`
            SELECT id FROM users WHERE email = ${email} LIMIT 1
        `;

        if (existingUser) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }

        // Hash the password with bcrypt (12 rounds)
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const [newUser] = await sql`
            INSERT INTO users (name, email, password)
            VALUES (${name}, ${email}, ${hashedPassword})
            RETURNING id, name, email, role, created_at
        `;

        // Generate JWT Access and Refresh Tokens
        const { accessToken, refreshToken } = generateTokens(newUser);

        // Store refresh token in database
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sql`
            INSERT INTO refresh_tokens (user_id, token, expires_at)
            VALUES (${newUser.id}, ${refreshToken}, ${expiresAt})
        `;

        // Set refresh token in secure HTTP-only cookie
        res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);

        return res.status(201).json({
            message: "User registered successfully",
            user: newUser,
            accessToken,
            refreshToken
        });
    } catch (error) {
        console.error("Register error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Login user
 * POST /login
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Fetch user by email
        const [user] = await sql`
            SELECT id, name, email, password, role, created_at
            FROM users
            WHERE email = ${email}
            LIMIT 1
        `;

        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token in database
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sql`
            INSERT INTO refresh_tokens (user_id, token, expires_at)
            VALUES (${user.id}, ${refreshToken}, ${expiresAt})
        `;

        // Set HTTP-only cookie
        res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);

        return res.status(200).json({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                created_at: user.created_at
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Refresh Access Token (with Token Rotation)
 * POST /refresh
 */
export const refreshToken = async (req, res) => {
    try {
        // Read refresh token from either request body or HTTP-only cookie
        const token = req.body?.refreshToken || req.cookies?.refreshToken;

        if (!token) {
            return res.status(401).json({ message: "Refresh token is required" });
        }

        // Verify cryptographic signature
        const { valid, payload } = verifyRefreshToken(token);
        if (!valid) {
            return res.status(401).json({ message: "Invalid or expired refresh token" });
        }

        // Check if token exists in database (and hasn't been revoked/expired)
        const [tokenRecord] = await sql`
            SELECT id, user_id, expires_at
            FROM refresh_tokens
            WHERE token = ${token}
            LIMIT 1
        `;

        if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
            return res.status(401).json({ message: "Refresh token is revoked or expired" });
        }

        // Fetch user
        const [user] = await sql`
            SELECT id, name, email, role
            FROM users
            WHERE id = ${tokenRecord.user_id}
            LIMIT 1
        `;

        if (!user) {
            return res.status(401).json({ message: "User belonging to this token no longer exists" });
        }

        // Rotate Refresh Token: delete the old one
        await sql`
            DELETE FROM refresh_tokens WHERE id = ${tokenRecord.id}
        `;

        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        // Store new refresh token
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sql`
            INSERT INTO refresh_tokens (user_id, token, expires_at)
            VALUES (${user.id}, ${newRefreshToken}, ${newExpiresAt})
        `;

        // Set new HTTP-only cookie
        res.cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS);

        return res.status(200).json({
            accessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error("Refresh token error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Logout
 * POST /logout
 */
export const logout = async (req, res) => {
    try {
        const token = req.body?.refreshToken || req.cookies?.refreshToken;

        if (token) {
            // Invalidate/delete refresh token from database
            await sql`
                DELETE FROM refresh_tokens WHERE token = ${token}
            `;
        }

        // Clear HTTP-only cookie
        res.clearCookie("refreshToken", {
            ...COOKIE_OPTIONS,
            maxAge: 0
        });

        return res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get current authenticated user profile
 * GET /me
 */
export const getMe = async (req, res) => {
    try {
        const [user] = await sql`
            SELECT id, name, email, role, created_at, updated_at
            FROM users
            WHERE id = ${req.user.id}
            LIMIT 1
        `;

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ user });
    } catch (error) {
        console.error("GetMe error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Change Password
 * POST /change-password
 */
export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        const [user] = await sql`
            SELECT id, email, role, password
            FROM users
            WHERE id = ${req.user.id}
            LIMIT 1
        `;

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password" });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        await sql`
            UPDATE users
            SET password = ${hashedNewPassword}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${req.user.id}
        `;

        // Revoke all existing refresh tokens for security
        await sql`
            DELETE FROM refresh_tokens WHERE user_id = ${req.user.id}
        `;

        // Generate fresh tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens({ id: user.id });
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await sql`
            INSERT INTO refresh_tokens (user_id, token, expires_at)
            VALUES (${user.id}, ${newRefreshToken}, ${expiresAt})
        `;

        res.cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS);

        return res.status(200).json({
            message: "Password changed successfully",
            accessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error("Change password error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
