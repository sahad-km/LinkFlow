import { sql } from "../config/db.js";
import redis from "../config/redis.js";
import { encodeBase62 } from "../utils/base62.utils.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:8000";

/**
 * Create a new shortened URL
 * Uses atomic Redis INCR counter + Base62 encoding to ensure absolute uniqueness
 * POST /create
 */
export const createUrl = async (req, res) => {
    try {
        const { longUrl, customCode, title } = req.body;
        const userId = req.user?.id || null;

        let shortCode;

        if (customCode) {
            // Check if custom alias is already taken in PostgreSQL
            const [existing] = await sql`
                SELECT id FROM urls WHERE short_code = ${customCode} LIMIT 1
            `;

            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "Custom alias is already in use. Please choose another."
                });
            }

            shortCode = customCode;
        } else {
            // Atomically increment the Redis counter
            // Redis INCR is single-threaded & atomic, guaranteeing zero collisions
            const counter = await redis.incr("url:counter");

            // Convert counter integer to Base62 string
            shortCode = encodeBase62(counter);
        }

        // Save URL record to PostgreSQL
        const [newUrl] = await sql`
            INSERT INTO urls (user_id, short_code, long_url, title)
            VALUES (${userId}, ${shortCode}, ${longUrl}, ${title || null})
            RETURNING id, user_id, short_code, long_url, title, clicks, created_at
        `;

        // Cache the mapping in Redis for ultra-fast redirection (sub-millisecond lookup)
        // Store for 30 days (2592000 seconds)
        await redis.set(`url:${shortCode}`, longUrl, "EX", 2592000);

        const shortUrl = `${BASE_URL}/${shortCode}`;

        return res.status(201).json({
            success: true,
            message: "Short URL created successfully",
            data: {
                id: newUrl.id,
                shortCode: newUrl.short_code,
                shortUrl,
                longUrl: newUrl.long_url,
                title: newUrl.title,
                clicks: Number(newUrl.clicks),
                createdAt: newUrl.created_at
            }
        });
    } catch (error) {
        console.error("Create URL error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

/**
 * Get details & analytics stats for a specific short URL
 * GET /:shortCode
 */
export const getUrlDetails = async (req, res) => {
    try {
        const { shortCode } = req.params;

        const [urlRecord] = await sql`
            SELECT id, user_id, short_code, long_url, title, clicks, created_at, updated_at
            FROM urls
            WHERE short_code = ${shortCode}
            LIMIT 1
        `;

        if (!urlRecord) {
            return res.status(404).json({
                success: false,
                message: "Short URL not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                id: urlRecord.id,
                shortCode: urlRecord.short_code,
                shortUrl: `${BASE_URL}/${urlRecord.short_code}`,
                longUrl: urlRecord.long_url,
                title: urlRecord.title,
                clicks: Number(urlRecord.clicks),
                createdAt: urlRecord.created_at,
                updatedAt: urlRecord.updated_at
            }
        });
    } catch (error) {
        console.error("Get URL details error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

/**
 * Get all URLs created by the currently authenticated user
 * GET /my-urls
 */
export const getMyUrls = async (req, res) => {
    try {
        const userId = req.user.id;

        const urls = await sql`
            SELECT id, short_code, long_url, title, clicks, created_at
            FROM urls
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
        `;

        const formattedUrls = urls.map((u) => ({
            id: u.id,
            shortCode: u.short_code,
            shortUrl: `${BASE_URL}/${u.short_code}`,
            longUrl: u.long_url,
            title: u.title,
            clicks: Number(u.clicks),
            createdAt: u.created_at
        }));

        return res.status(200).json({
            success: true,
            count: formattedUrls.length,
            data: formattedUrls
        });
    } catch (error) {
        console.error("Get my URLs error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

/**
 * Delete a short URL
 * DELETE /:shortCode
 */
export const deleteUrl = async (req, res) => {
    try {
        const { shortCode } = req.params;
        const userId = req.user?.id;

        // Fetch URL to check ownership if user is logged in
        const [urlRecord] = await sql`
            SELECT id, user_id FROM urls WHERE short_code = ${shortCode} LIMIT 1
        `;

        if (!urlRecord) {
            return res.status(404).json({
                success: false,
                message: "Short URL not found"
            });
        }

        // If URL was created by a user, ensure only that user can delete it
        if (urlRecord.user_id && (!userId || urlRecord.user_id !== userId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: You are not authorized to delete this URL"
            });
        }

        // Delete from PostgreSQL
        await sql`
            DELETE FROM urls WHERE short_code = ${shortCode}
        `;

        // Invalidate Redis cache
        await redis.del(`url:${shortCode}`);

        return res.status(200).json({
            success: true,
            message: "Short URL deleted successfully"
        });
    } catch (error) {
        console.error("Delete URL error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};