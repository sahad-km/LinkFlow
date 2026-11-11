
import request from "supertest";
import app from "../../app.js";
import { sql, connectDB, closeDB } from "../../config/db.js";
import redis, { connectRedis, closeRedis } from "../../config/redis.js";

describe("URL Deletion Integration Test", () => {
    beforeAll(async () => {
        await connectDB();
        await connectRedis();
    });

    afterAll(async () => {
        await closeRedis();
        await closeDB();
    });

    test("should delete URL from PostgreSQL and invalidate Redis cache", async () => {
        const shortCode = "delete-integration";
        const longUrl = "https://example.com/delete-test";

        // Create test URL directly in PostgreSQL
        await sql`
            INSERT INTO urls (short_code, long_url)
            VALUES (${shortCode}, ${longUrl})
        `;

        // Add URL to Redis cache
        await redis.set(`url:${shortCode}`, longUrl);

        // Call actual deletion API
        const response = await request(app)
            .delete(`/url/${shortCode}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify deletion from PostgreSQL
        const records = await sql`
            SELECT id FROM urls WHERE short_code = ${shortCode}
        `;

        expect(records).toHaveLength(0);

        // Verify cache invalidation
        const cachedUrl = await redis.get(`url:${shortCode}`);

        expect(cachedUrl).toBeNull();
    });

    test("should return 404 when deleting a nonexistent URL", async () => {
        const response = await request(app)
            .delete("/url/does-not-exist");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);

        // Redis should not contain this URL either
        const cachedUrl = await redis.get("url:does-not-exist");

        expect(cachedUrl).toBeNull();

    });
});
