import crypto from "crypto";
import { sql } from "../config/db.js";
import redis from "../config/redis.js";
import { publishClickEvent } from "../producers/clickProducer.js";

const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "604800", 10); // 7 days


const pendingAnalytics = new Set();

const trackAnalyticsOperation = (operation, label, shortCode) => {
    let trackedOperation;

    trackedOperation = Promise.resolve()
        .then(operation)
        .catch((error) => {
            console.error(
                `${label} failed for ${shortCode}:`,
                error.message
            );
        })
        .finally(() => {
            pendingAnalytics.delete(trackedOperation);
        });

    pendingAnalytics.add(trackedOperation);
};

export const waitForPendingAnalytics = async () => {
    await Promise.allSettled([...pendingAnalytics]);
};

/**
 * Handles short URL redirection:
 * 1. Checks Redis cache first (Sub-millisecond lookup)
 * 2. On Cache Hit: Extends TTL (keeps hot URLs in cache) & redirects (302)
 * 3. On Cache Miss: Fetches from PostgreSQL, populates Redis cache & redirects (302)
 * 4. Asynchronously records click in Redis & dispatches Kafka event without blocking redirect response
 * (SQL updates are decoupled and handled purely by the Kafka analytics consumer)
 * GET /:shortCode
 */

export const handleRedirect = async (req, res) => {
    const { shortCode } = req.params;

    if (!shortCode || shortCode === "favicon.ico" || shortCode === "robots.txt") {
        return res.status(404).json({
            success: false,
            message: "Not found"
        });
    }

    const cacheKey = `url:${shortCode}`;
    let cachedUrl = null;

    // 1. Try Redis cache (best-effort).
    try {
        cachedUrl = await redis.get(cacheKey);
    } catch (error) {
        console.error("Redis cache read failed:", error.message);
    }

    // 2. Cache hit.
    if (cachedUrl) {
        let targetUrl = cachedUrl;
        let linkId = null;

        if (cachedUrl.startsWith("{")) {
            try {
                const parsed = JSON.parse(cachedUrl);
                targetUrl = parsed.longUrl || targetUrl;
                linkId = parsed.id || null;
            } catch {
                // Fallback to raw cached value.
            }
        }

        redis.expire(cacheKey, CACHE_TTL_SECONDS).catch(() => { });

        recordClick(shortCode, linkId, req);

        return res.redirect(302, targetUrl);
    }

    // 3. Cache miss or Redis failure: query PostgreSQL.
    try {
        const [urlRecord] = await sql`
            SELECT id, short_code, long_url, clicks
            FROM urls
            WHERE short_code = ${shortCode}
            LIMIT 1
        `;

        if (!urlRecord) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Link Not Found - LinkFlow</title>
                    <style>
                        body {
                            background-color: #0f172a;
                            color: #f8fafc;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                        }
                        .card {
                            background: #1e293b;
                            padding: 2.5rem;
                            border-radius: 1rem;
                            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
                            text-align: center;
                            max-width: 420px;
                        }
                        h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #f43f5e; }
                        p { color: #94a3b8; line-height: 1.5; margin-bottom: 1.5rem; }
                        .code { background: #334155; padding: 0.2rem 0.5rem; border-radius: 0.3rem; color: #38bdf8; font-family: monospace; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Link Not Found</h1>
                        <p>The short link <span class="code">${shortCode}</span> does not exist or has expired.</p>
                    </div>
                </body>
                </html>
            `);
        }

        const targetUrl = urlRecord.long_url;

        // 4. Cache population is best-effort.
        try {
            await redis.set(
                cacheKey,
                JSON.stringify({
                    id: urlRecord.id,
                    longUrl: targetUrl
                }),
                "EX",
                CACHE_TTL_SECONDS
            );
        } catch (error) {
            console.error("Redis cache write failed:", error.message);
        }

        recordClick(shortCode, urlRecord.id, req);

        return res.redirect(302, targetUrl);

    } catch (error) {
        console.error("Redirect error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/**
 * Diagnostic endpoint to check cache status for a short code
 * GET /cache-status/:shortCode
 */
export const getCacheStatus = async (req, res) => {
    try {
        const { shortCode } = req.params;
        const cacheKey = `url:${shortCode}`;

        const [cachedValue, ttl] = await Promise.all([
            redis.get(cacheKey),
            redis.ttl(cacheKey)
        ]);

        const [dbRecord] = await sql`
            SELECT id, short_code, long_url, clicks, created_at, updated_at
            FROM urls
            WHERE short_code = ${shortCode}
            LIMIT 1
        `;

        return res.status(200).json({
            shortCode,
            inCache: !!cachedValue,
            cachedUrl: cachedValue,
            cacheTtlSecondsRemaining: ttl,
            inDatabase: !!dbRecord,
            databaseDetails: dbRecord || null
        });
    } catch (error) {
        console.error("Get cache status error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

/**
 * Background helper to increment Redis in-memory count and stream event to Kafka.
 * NOTE: SQL updates are completely delegated to Kafka consumer to eliminate DB lock contention on redirect path.
 */
const recordClick = (shortCode, linkId = null, req = null) => {
    // 1. Increment Redis click counter.
    trackAnalyticsOperation(
        () => redis.hincrby("url_clicks", shortCode, 1),
        "Redis click counter",
        shortCode
    );

    // 2. Create click event.
    const clickEvent = {
        eventId: crypto.randomUUID(),
        linkId: linkId ? String(linkId) : null,
        shortCode,
        clickedAt: new Date().toISOString(),
        ip: req?.ip || req?.headers?.["x-forwarded-for"] || null,
        userAgent: req?.headers?.["user-agent"] || null,
        referer: req?.headers?.["referer"] || req?.headers?.["referrer"] || null,
    };

    // 3. Publish event to Kafka.
    trackAnalyticsOperation(
        () => publishClickEvent(clickEvent),
        "Kafka click event",
        shortCode
    );
};