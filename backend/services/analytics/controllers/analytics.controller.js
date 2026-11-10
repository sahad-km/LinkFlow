import { sql } from "../config/db.js";

/**
 * Get comprehensive analytics for a specific short URL
 * GET /analytics/:shortCode
 */
export const getUrlAnalytics = async (req, res) => {
    try {
        const { shortCode } = req.params;

        if (!shortCode) {
            return res.status(400).json({ success: false, message: "shortCode is required" });
        }

        // 1. Fetch URL metadata
        const [urlRecord] = await sql`
            SELECT id, short_code, long_url, title, clicks, created_at
            FROM urls
            WHERE short_code = ${shortCode}
            LIMIT 1
        `;

        if (!urlRecord) {
            return res.status(404).json({
                success: false,
                message: `No URL found for short code: ${shortCode}`
            });
        }

        // 2. Fetch Aggregated Metrics concurrently
        const [
            clicksByDate,
            devices,
            browsers,
            operatingSystems,
            referrers,
            recentClicks,
            [totalLoggedClicks]
        ] = await Promise.all([
            // Clicks grouped by Day (last 30 days)
            sql`
                SELECT 
                    TO_CHAR(clicked_at, 'YYYY-MM-DD') AS date,
                    COUNT(*)::int AS count
                FROM click_events
                WHERE short_code = ${shortCode}
                  AND clicked_at >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY TO_CHAR(clicked_at, 'YYYY-MM-DD')
                ORDER BY date ASC
            `,

            // Device types breakdown
            sql`
                SELECT 
                    COALESCE(device, 'Desktop') AS name,
                    COUNT(*)::int AS count
                FROM click_events
                WHERE short_code = ${shortCode}
                GROUP BY device
                ORDER BY count DESC
            `,

            // Browsers breakdown
            sql`
                SELECT 
                    COALESCE(browser, 'Other') AS name,
                    COUNT(*)::int AS count
                FROM click_events
                WHERE short_code = ${shortCode}
                GROUP BY browser
                ORDER BY count DESC
                LIMIT 8
            `,

            // Operating systems breakdown
            sql`
                SELECT 
                    COALESCE(os, 'Other') AS name,
                    COUNT(*)::int AS count
                FROM click_events
                WHERE short_code = ${shortCode}
                GROUP BY os
                ORDER BY count DESC
                LIMIT 8
            `,

            // Referrers breakdown
            sql`
                SELECT 
                    COALESCE(NULLIF(referer, ''), 'Direct / Unknown') AS name,
                    COUNT(*)::int AS count
                FROM click_events
                WHERE short_code = ${shortCode}
                GROUP BY referer
                ORDER BY count DESC
                LIMIT 10
            `,

            // Recent 15 click logs
            sql`
                SELECT 
                    id, event_id, clicked_at, ip, browser, os, device, referer
                FROM click_events
                WHERE short_code = ${shortCode}
                ORDER BY clicked_at DESC
                LIMIT 15
            `,

            // Total events recorded
            sql`
                SELECT COUNT(*)::int AS count
                FROM click_events
                WHERE short_code = ${shortCode}
            `
        ]);

        return res.status(200).json({
            success: true,
            data: {
                shortCode,
                longUrl: urlRecord.long_url,
                title: urlRecord.title,
                createdAt: urlRecord.created_at,
                totalClicks: Number(urlRecord.clicks || 0),
                totalLoggedEvents: totalLoggedClicks?.count || 0,
                clicksByDate,
                devices,
                browsers,
                operatingSystems,
                referrers,
                recentClicks
            }
        });

    } catch (error) {
        console.error("Analytics fetch error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve analytics"
        });
    }
};

/**
 * Get global analytics summary
 * GET /analytics/summary
 */
export const getGlobalSummary = async (req, res) => {
    try {
        const [[totalUrls], [totalClicks], [last24HoursClicks], topLinks] = await Promise.all([
            sql`SELECT COUNT(*)::int AS count FROM urls`,
            sql`SELECT COALESCE(SUM(clicks), 0)::bigint AS count FROM urls`,
            sql`SELECT COUNT(*)::int AS count FROM click_events WHERE clicked_at >= NOW() - INTERVAL '24 hours'`,
            sql`
                SELECT short_code, long_url, title, clicks 
                FROM urls 
                ORDER BY clicks DESC 
                LIMIT 5
            `
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalUrls: totalUrls?.count || 0,
                totalClicks: Number(totalClicks?.count || 0),
                clicksLast24Hours: last24HoursClicks?.count || 0,
                topLinks
            }
        });
    } catch (error) {
        console.error("Global summary error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve global analytics summary"
        });
    }
};
