
import {
    describe,
    test,
    expect,
    beforeAll,
    afterAll,
} from "@jest/globals";

import request from "supertest";
import { randomUUID } from "node:crypto";

import app from "../../app.js";
import { sql } from "../../config/db.js";

describe("Analytics API Integration", () => {
    let shortCode;
    let urlId;

    beforeAll(async () => {
        shortCode = `api-${randomUUID()}`;

        const [url] = await sql`
            INSERT INTO urls (
                short_code,
                long_url,
                title,
                clicks
            )
            VALUES (
                ${shortCode},
                'https://example.com/analytics-test',
                'Analytics API Integration Test',
                5
            )
            RETURNING id
        `;

        urlId = url.id;
    });

    afterAll(async () => {
        await sql`
            DELETE FROM click_events
            WHERE short_code = ${shortCode}
        `;

        await sql`
            DELETE FROM urls
            WHERE id = ${urlId}
        `;

        await sql.end();
    });

    test("should return URL analytics for an existing short code", async () => {
        const response = await request(app)
            .get(`/analytics/${shortCode}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(response.body.data).toMatchObject({
            shortCode,
            longUrl: "https://example.com/analytics-test",
            title: "Analytics API Integration Test",
            totalClicks: 5,
            totalLoggedEvents: 0,
            clicksByDate: [],
            devices: [],
            browsers: [],
            operatingSystems: [],
            referrers: [],
            recentClicks: [],
        });
    });



    test("should return aggregated analytics for click events", async () => {
        await sql`
        INSERT INTO click_events (
            event_id,
            link_id,
            short_code,
            ip,
            browser,
            os,
            device,
            referer
        )
        VALUES
            (
                ${randomUUID()},
                ${urlId},
                ${shortCode},
                '192.168.1.10',
                'Chrome',
                'Windows',
                'Desktop',
                'https://google.com'
            ),
            (
                ${randomUUID()},
                ${urlId},
                ${shortCode},
                '192.168.1.11',
                'Firefox',
                'Linux',
                'Desktop',
                'https://google.com'
            ),
            (
                ${randomUUID()},
                ${urlId},
                ${shortCode},
                '192.168.1.12',
                'Chrome',
                'Android',
                'Mobile',
                ''
            )
    `;

        const response = await request(app)
            .get(`/analytics/${shortCode}`);

        expect(response.status).toBe(200);

        const { data } = response.body;

        expect(data.totalClicks).toBe(5);
        expect(data.totalLoggedEvents).toBe(3);

        expect(data.devices).toEqual(
            expect.arrayContaining([
                { name: "Desktop", count: 2 },
                { name: "Mobile", count: 1 },
            ])
        );

        expect(data.browsers).toEqual(
            expect.arrayContaining([
                { name: "Chrome", count: 2 },
                { name: "Firefox", count: 1 },
            ])
        );

        expect(data.operatingSystems).toEqual(
            expect.arrayContaining([
                { name: "Windows", count: 1 },
                { name: "Linux", count: 1 },
                { name: "Android", count: 1 },
            ])
        );

        expect(data.referrers).toEqual(
            expect.arrayContaining([
                { name: "https://google.com", count: 2 },
                { name: "Direct / Unknown", count: 1 },
            ])
        );

        expect(data.recentClicks).toHaveLength(3);
    });



    test("should filter clicks by date and return only 15 recent clicks", async () => {
        // Insert one old event (outside the 30-day window)
        await sql`
        INSERT INTO click_events (
            event_id,
            link_id,
            short_code,
            browser,
            os,
            device,
            clicked_at
        )
        VALUES (
            ${randomUUID()},
            ${urlId},
            ${shortCode},
            'Chrome',
            'Windows',
            'Desktop',
            NOW() - INTERVAL '40 days'
        )
    `;

        // Insert 16 recent events
        await sql`
        INSERT INTO click_events (
            event_id,
            link_id,
            short_code,
            browser,
            os,
            device,
            clicked_at
        )
        SELECT
            gen_random_uuid()::text,
            ${urlId},
            ${shortCode},
            'Chrome',
            'Windows',
            'Desktop',
            NOW() - (n * INTERVAL '1 minute')
        FROM generate_series(1, 16) AS n
    `;

        const response = await request(app)
            .get(`/analytics/${shortCode}`);

        expect(response.status).toBe(200);

        const { data } = response.body;

        // 3 events from previous test + 16 recent events
        expect(data.totalLoggedEvents).toBe(20);

        // The 40-day-old event should not appear in daily analytics
        const totalRecentDailyClicks = data.clicksByDate.reduce(
            (total, item) => total + item.count,
            0
        );

        expect(totalRecentDailyClicks).toBe(19);

        // Only 15 most recent records should be returned
        expect(data.recentClicks).toHaveLength(15);

        // Most recent event should come first
        const timestamps = data.recentClicks.map(
            (click) => new Date(click.clicked_at).getTime()
        );

        expect(timestamps).toEqual(
            [...timestamps].sort((a, b) => b - a)
        );
    });


    test("should return 404 for an unknown short code", async () => {
        const response = await request(app)
            .get("/analytics/this-code-does-not-exist");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            success: false,
            message: "No URL found for short code: this-code-does-not-exist",
        });
    });


    test("should return the global analytics summary", async () => {
        const response = await request(app)
            .get("/analytics/summary");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const { data } = response.body;

        expect(data.totalUrls).toBeGreaterThan(0);
        expect(data.totalClicks).toBeGreaterThanOrEqual(5);
        expect(data.clicksLast24Hours).toBeGreaterThanOrEqual(3);

        expect(data.topLinks.length).toBeLessThanOrEqual(5);

        expect(data.topLinks[0]).toHaveProperty("short_code");
        expect(data.topLinks[0]).toHaveProperty("long_url");
        expect(data.topLinks[0]).toHaveProperty("clicks");
    });


    test("should return the top 5 URLs ordered by click count", async () => {
        const response = await request(app)
            .get("/analytics/summary");

        expect(response.status).toBe(200);

        const { topLinks } = response.body.data;

        expect(topLinks.length).toBeLessThanOrEqual(5);

        const clickCounts = topLinks.map(link => link.clicks);

        expect(clickCounts).toEqual(
            [...clickCounts].sort((a, b) => b - a)
        );
    });



    test("should return the actual top 5 URLs by click count", async () => {
        const fixtures = [
            { shortCode: `rank-1-${randomUUID()}`, clicks: 100001 },
            { shortCode: `rank-2-${randomUUID()}`, clicks: 100002 },
            { shortCode: `rank-3-${randomUUID()}`, clicks: 100003 },
            { shortCode: `rank-4-${randomUUID()}`, clicks: 100004 },
            { shortCode: `rank-5-${randomUUID()}`, clicks: 100005 },
            { shortCode: `rank-6-${randomUUID()}`, clicks: 100006 },
        ];

        try {
            await sql`
            INSERT INTO urls (short_code, long_url, title, clicks)
            VALUES ${sql(fixtures.map(item => [
                item.shortCode,
                "https://example.com/ranking-test",
                "Ranking Test",
                item.clicks,
            ]))}
        `;

            const response = await request(app).get("/analytics/summary");

            expect(response.status).toBe(200);

            const { topLinks } = response.body.data;

            const returnedCodes = topLinks.map(link => link.short_code);

            const expectedCodes = fixtures
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 5)
                .map(item => item.shortCode);

            expect(returnedCodes).toEqual(
                expect.arrayContaining(expectedCodes)
            );

            expect(returnedCodes).toHaveLength(5);
            expect(returnedCodes).toEqual(expectedCodes);

            expect(returnedCodes).not.toContain(
                fixtures.find(item => item.clicks === 100001).shortCode
            );
        } finally {
            await sql`
            DELETE FROM urls
            WHERE short_code IN ${sql(fixtures.map(item => item.shortCode))}
        `;
        }
    });



    test("should return empty analytics for a URL with zero clicks", async () => {
        const shortCode = `zero-${randomUUID()}`;

        try {
            await sql`
            INSERT INTO urls (short_code, long_url, title, clicks)
            VALUES (
                ${shortCode},
                'https://example.com/zero-clicks',
                'Zero Click URL',
                0
            )
        `;

            const response = await request(app)
                .get(`/analytics/${shortCode}`);

            expect(response.status).toBe(200);

            const { data } = response.body;

            expect(data.totalClicks).toBe(0);
            expect(data.totalLoggedEvents).toBe(0);

            expect(data.clicksByDate).toEqual([]);
            expect(data.devices).toEqual([]);
            expect(data.browsers).toEqual([]);
            expect(data.operatingSystems).toEqual([]);
            expect(data.referrers).toEqual([]);
            expect(data.recentClicks).toEqual([]);
        } finally {
            await sql`
            DELETE FROM click_events
            WHERE short_code = ${shortCode}
        `;

            await sql`
            DELETE FROM urls
            WHERE short_code = ${shortCode}
        `;
        }
    });

});
