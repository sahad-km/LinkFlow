
import { jest } from "@jest/globals";
import request from "supertest";
import { sql } from "../../config/db.js";
import redis from "../../config/redis.js";
// Mock Kafka so this test doesn't require a running Kafka broker.
jest.unstable_mockModule("../../producers/clickProducer.js", () => ({
    connectProducer: jest.fn(),
    disconnectProducer: jest.fn(),
    publishClickEvent: jest.fn().mockResolvedValue(undefined)
}));

const { publishClickEvent } = await import(
    "../../producers/clickProducer.js"
);

// Import app only after registering the Kafka mock.
const { default: app } = await import("../../app.js");

const shortCode = "cache-miss-integration";
const longUrl = "https://example.com/linkflow-integration-test";

describe("Redirect Integration Tests", () => {
    beforeAll(async () => {
        await sql`SELECT 1`;
        await redis.ping();

        // Create the URL table if it doesn't exist.
        await sql`
            CREATE TABLE IF NOT EXISTS urls (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID,
                short_code VARCHAR(50) UNIQUE NOT NULL,
                long_url TEXT NOT NULL,
                title VARCHAR(255),
                clicks BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
    });

    afterEach(async () => {
        await sql`
            DELETE FROM urls
            WHERE short_code = ${shortCode}
        `;

        await redis.del(`url:${shortCode}`);
        await redis.hdel("url_clicks", shortCode);
    });

    afterAll(async () => {
        await redis.quit();
        await sql.end();
    });

    test("should fetch URL from PostgreSQL, cache it in Redis and redirect", async () => {
        // 1. Insert URL into PostgreSQL.
        await sql`
            INSERT INTO urls (short_code, long_url)
            VALUES (${shortCode}, ${longUrl})
        `;

        // 2. Confirm URL is not cached.
        const initialCache = await redis.get(`url:${shortCode}`);
        expect(initialCache).toBeNull();

        // 3. Request the short URL.
        const response = await request(app)
            .get(`/${shortCode}`)
            .redirects(0);

        // 4. Verify redirect response.
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(longUrl);

        // 5. Verify Redis cache was populated.
        const cachedValue = await redis.get(`url:${shortCode}`);

        expect(cachedValue).not.toBeNull();

        const parsedCache = JSON.parse(cachedValue);

        expect(parsedCache.longUrl).toBe(longUrl);
        expect(parsedCache.id).toBeDefined();
    });


    test("should redirect directly from Redis cache without querying PostgreSQL", async () => {
        const cachedShortCode = "cache-hit-integration";
        const cachedLongUrl = "https://example.com/cached-destination";

        try {
            // Insert URL directly into Redis.
            await redis.set(
                `url:${cachedShortCode}`,
                JSON.stringify({
                    id: "11111111-1111-4111-8111-111111111111",
                    longUrl: cachedLongUrl
                }),
                "EX",
                600
            );

            // Request the short URL.
            const response = await request(app)
                .get(`/${cachedShortCode}`)
                .redirects(0);

            // Verify redirect.
            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(cachedLongUrl);

            // Verify the cached entry still exists.
            const cachedValue = await redis.get(`url:${cachedShortCode}`);
            expect(cachedValue).not.toBeNull();

            // Verify sliding expiration was applied.
            const ttl = await redis.ttl(`url:${cachedShortCode}`);
            expect(ttl).toBeGreaterThan(0);
        } finally {
            await redis.del(`url:${cachedShortCode}`);
            await redis.hdel("url_clicks", cachedShortCode);
        }
    });


    test("should return 404 when short code does not exist", async () => {
        const missingCode = "missing-integration";

        try {
            // Ensure the short code doesn't exist in either store.
            await sql`
            DELETE FROM urls
            WHERE short_code = ${missingCode}
        `;

            await redis.del(`url:${missingCode}`);

            // Request the missing short code.
            const response = await request(app)
                .get(`/${missingCode}`)
                .redirects(0);

            // Verify not found response.
            expect(response.status).toBe(404);

            // Verify Redis was not populated.
            const cachedValue = await redis.get(`url:${missingCode}`);
            expect(cachedValue).toBeNull();
        } finally {
            await sql`
            DELETE FROM urls
            WHERE short_code = ${missingCode}
        `;

            await redis.del(`url:${missingCode}`);
        }
    });


    test("should redirect using PostgreSQL when Redis cache lookup fails", async () => {
        const redisErrorCode = "redis-error-integration";

        await sql`
        INSERT INTO urls (short_code, long_url)
        VALUES (${redisErrorCode}, ${"https://example.com/redis-error"})
    `;

        const originalGet = redis.get;

        try {
            redis.get = jest.fn().mockRejectedValue(
                new Error("Simulated Redis connection failure")
            );

            const response = await request(app)
                .get(`/${redisErrorCode}`)
                .redirects(0);

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(
                "https://example.com/redis-error"
            );
        } finally {
            redis.get = originalGet;

            await sql`
            DELETE FROM urls
            WHERE short_code = ${redisErrorCode}
        `;

            await redis.del(`url:${redisErrorCode}`);
        }
    });




    test("should redirect successfully when Redis cache write fails", async () => {
        const shortCode = "redis-write-error";
        const longUrl = "https://example.com/redis-write-error";

        const originalSet = redis.set;

        try {
            await sql`
            INSERT INTO urls (short_code, long_url)
            VALUES (${shortCode}, ${longUrl})
        `;

            await redis.del(`url:${shortCode}`);

            // Simulate Redis SET failure.
            redis.set = jest.fn().mockRejectedValue(
                new Error("Simulated Redis write failure")
            );

            const response = await request(app)
                .get(`/${shortCode}`)
                .redirects(0);

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(longUrl);

            // The cache should remain empty because SET failed.
            expect(await redis.get(`url:${shortCode}`)).toBeNull();

        } finally {
            redis.set = originalSet;

            await sql`
            DELETE FROM urls
            WHERE short_code = ${shortCode}
        `;

            await redis.del(`url:${shortCode}`);
            await redis.hdel("url_clicks", shortCode);
        }
    });



    test("should redirect successfully when Kafka publishing fails", async () => {
        const shortCode = "kafka-error-integration";
        const longUrl = "https://example.com/kafka-error";

        await sql`
        INSERT INTO urls (short_code, long_url)
        VALUES (${shortCode}, ${longUrl})
    `;

        try {
            // Force Kafka publishing to fail.
            publishClickEvent.mockRejectedValueOnce(
                new Error("Simulated Kafka publishing failure")
            );

            const response = await request(app)
                .get(`/${shortCode}`)
                .redirects(0);

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(longUrl);

        } finally {
            await sql`
            DELETE FROM urls
            WHERE short_code = ${shortCode}
        `;

            await redis.del(`url:${shortCode}`);
            await redis.hdel("url_clicks", shortCode);
        }
    });



});
