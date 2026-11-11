import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { randomUUID } from "node:crypto";

// Import microservice apps
import authApp from "../../services/auth/app.js";
import urlApp from "../../services/url/app.js";
import redirectApp from "../../services/redirect/app.js";
import analyticsApp from "../../services/analytics/app.js";

// Import database and Redis connections
import { sql as authSql, connectDB as connectAuthDB, closeDB as closeAuthDB } from "../../services/auth/config/db.js";
import { sql as urlSql, connectDB as connectUrlDB, closeDB as closeUrlDB } from "../../services/url/config/db.js";
import urlRedis, { connectRedis as connectUrlRedis, closeRedis as closeUrlRedis } from "../../services/url/config/redis.js";
import redirectRedis from "../../services/redirect/config/redis.js";
import { connectProducer as connectRedirectProducer, disconnectProducer as disconnectRedirectProducer } from "../../services/redirect/producers/clickProducer.js";
import { sql as analyticsSql, connectDB as connectAnalyticsDB } from "../../services/analytics/config/db.js";
import { connectConsumer as connectAnalyticsConsumer, disconnectConsumer as disconnectAnalyticsConsumer } from "../../services/analytics/consumers/clickConsumer.js";
import { connectDLQProducer, disconnectDLQProducer } from "../../services/analytics/producers/dlqProducer.js";

describe("LinkFlow Cross-Service End-to-End (E2E) Pipeline", () => {
    const e2eEmail = `e2e-user-${randomUUID()}@example.com`;
    const e2ePassword = "E2ESecurePassword123";
    const targetLongUrl = `https://example.com/dest-${randomUUID()}`;

    let accessToken;
    let createdShortCode;
    let urlRecordId;

    beforeAll(async () => {
        // Connect shared infrastructure
        await connectAuthDB();
        await connectUrlDB();
        await connectUrlRedis();
        await connectAnalyticsDB();
        await connectRedirectProducer();
        await connectDLQProducer();
        await connectAnalyticsConsumer();
    }, 30000);

    afterAll(async () => {
        // Cleanup created data
        if (createdShortCode) {
            await urlSql`DELETE FROM urls WHERE short_code = ${createdShortCode}`;
            await analyticsSql`DELETE FROM click_events WHERE short_code = ${createdShortCode}`;
            await urlRedis.del(`url:${createdShortCode}`);
            await redirectRedis.del(`url:${createdShortCode}`);
            await redirectRedis.hdel("url_clicks", createdShortCode);
        }

        await authSql`DELETE FROM users WHERE email = ${e2eEmail}`;

        // Disconnect clients
        await disconnectAnalyticsConsumer();
        await disconnectDLQProducer();
        await disconnectRedirectProducer();
        await closeUrlRedis();
        await closeUrlDB();
        await closeAuthDB();
        await analyticsSql.end();
        await redirectRedis.quit();
    }, 30000);

    test("1. Register User in Auth Service", async () => {
        const res = await request(authApp)
            .post("/auth/register")
            .send({
                name: "E2E Test User",
                email: e2eEmail,
                password: e2ePassword
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty("accessToken");
        accessToken = res.body.accessToken;
        expect(typeof accessToken).toBe("string");
    });

    test("2. Create Shortened URL in URL Service using Bearer Token", async () => {
        const res = await request(urlApp)
            .post("/url/create")
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                longUrl: targetLongUrl,
                title: "E2E Destination"
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);

        createdShortCode = res.body.data.shortCode;
        urlRecordId = res.body.data.id;

        expect(createdShortCode).toBeDefined();
        expect(typeof createdShortCode).toBe("string");
    });

    test("3. Resolve Short URL via Redirect Service & Trigger Async Click Stream", async () => {
        const res = await request(redirectApp)
            .get(`/${createdShortCode}`)
            .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")
            .set("X-Forwarded-For", "203.0.113.195");

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(targetLongUrl);
    });

    test("4. Wait for Analytics Consumer to Process Event from Kafka and Persist to PostgreSQL", async () => {
        let clickEvents = [];
        let urlRows = [];

        // Poll for asynchronous Kafka consumer processing and database persistence
        for (let attempt = 0; attempt < 30; attempt++) {
            clickEvents = await analyticsSql`
                SELECT id, event_id, short_code, browser, os, device
                FROM click_events
                WHERE short_code = ${createdShortCode}
            `;

            urlRows = await urlSql`
                SELECT clicks FROM urls WHERE short_code = ${createdShortCode}
            `;

            if (clickEvents.length >= 1 && Number(urlRows[0]?.clicks) >= 1) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        expect(clickEvents.length).toBeGreaterThanOrEqual(1);
        expect(clickEvents[0].short_code).toBe(createdShortCode);
        expect(clickEvents[0].os).toBe("iOS"); // Verifies our parser bug fix!
        expect(clickEvents[0].device).toBe("Mobile");
        expect(Number(urlRows[0].clicks)).toBe(1);
    }, 20000);

    test("5. Retrieve Granular Analytics from Analytics Service API", async () => {
        const res = await request(analyticsApp)
            .get(`/analytics/${createdShortCode}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.shortCode).toBe(createdShortCode);
        expect(res.body.data.totalClicks).toBe(1);
        expect(res.body.data.browsers.some(b => b.name === "Safari")).toBe(true);
        expect(res.body.data.devices.some(d => d.name === "Mobile")).toBe(true);
        expect(res.body.data.operatingSystems.some(o => o.name === "iOS")).toBe(true);
    });

    test("6. Delete Short URL via URL Service and Invalidate Cache", async () => {
        const deleteRes = await request(urlApp)
            .delete(`/url/${createdShortCode}`)
            .set("Authorization", `Bearer ${accessToken}`);

        expect(deleteRes.status).toBe(200);

        // Verify URL is deleted from PostgreSQL
        const [checkDb] = await urlSql`
            SELECT id FROM urls WHERE short_code = ${createdShortCode}
        `;
        expect(checkDb).toBeUndefined();

        // Verify Redirect now returns 404
        const redirectRes = await request(redirectApp)
            .get(`/${createdShortCode}`);

        expect(redirectRes.status).toBe(404);
    });
});
