
import request from "supertest";
import app from "../../app.js";
import { sql, connectDB, closeDB } from "../../config/db.js";
import redis, { connectRedis, closeRedis } from "../../config/redis.js";

describe("URL Creation Integration Test", () => {
    beforeAll(async () => {
        await connectDB();
        await connectRedis();
    });

    afterAll(async () => {
        await closeRedis();
        await closeDB();
    });

    afterEach(async () => {
        const records = await sql`
        DELETE FROM urls
        WHERE long_url IN (
            ${"https://example.com/linkflow-integration-test"},
            ${"https://example.com/redis-failure-test"}
        )
        OR short_code = ${"integration-test"}
        RETURNING short_code
    `;

        const keys = records.map(
            ({ short_code }) => `url:${short_code}`
        );

        if (keys.length > 0) {
            await redis.del(...keys);
        }
    });

    test("should create a URL in PostgreSQL and cache it in Redis", async () => {
        const longUrl = "https://example.com/linkflow-integration-test";
        const title = "Integration Test URL";

        const response = await request(app)
            .post("/url/create")
            .send({ longUrl, title });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);

        const { shortCode } = response.body.data;

        // Verify the record exists in PostgreSQL
        const [urlRecord] = await sql`
            SELECT * FROM urls WHERE short_code = ${shortCode}
        `;

        expect(urlRecord).toBeDefined();
        expect(urlRecord.long_url).toBe(longUrl);
        expect(urlRecord.title).toBe(title);

        // Verify the URL exists in Redis
        const cachedUrl = await redis.get(`url:${shortCode}`);

        expect(cachedUrl).toBe(longUrl);
    });


    test("should reject an invalid URL without writing to PostgreSQL", async () => {
        const response = await request(app)
            .post("/url/create")
            .send({
                longUrl: "not-a-valid-url",
                title: "Invalid URL"
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Validation failed");

        const records = await sql`
        SELECT id FROM urls
        WHERE long_url = 'not-a-valid-url'
    `;

        expect(records).toHaveLength(0);
    });


    test("should reject duplicate custom aliases", async () => {
        const customCode = "integration-test";

        // Insert an existing record directly into PostgreSQL
        await sql`
        INSERT INTO urls (short_code, long_url)
        VALUES (${customCode}, ${"https://example.com/first"})
    `;

        const response = await request(app)
            .post("/url/create")
            .send({
                longUrl: "https://example.com/second",
                customCode
            });

        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);

        // Verify only the original record exists
        const records = await sql`
        SELECT id FROM urls WHERE short_code = ${customCode}
    `;

        expect(records).toHaveLength(1);

        // Cleanup
        await sql`
        DELETE FROM urls WHERE short_code = ${customCode}
    `;
    });



    test("should create URL successfully even if Redis cache write fails", async () => {
        const longUrl = "https://example.com/redis-failure-test";

        const originalSet = redis.set;

        try {
            // Simulate Redis cache-write failure
            redis.set = async () => {
                throw new Error("Simulated Redis cache failure");
            };

            const response = await request(app)
                .post("/url/create")
                .send({ longUrl });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);

            const { shortCode } = response.body.data;

            // PostgreSQL should still contain the URL
            const [urlRecord] = await sql`
            SELECT * FROM urls WHERE short_code = ${shortCode}
        `;

            expect(urlRecord).toBeDefined();
            expect(urlRecord.long_url).toBe(longUrl);

            // Cleanup
            await sql`
            DELETE FROM urls WHERE short_code = ${shortCode}
        `;
        } finally {
            // Restore the original Redis method
            redis.set = originalSet;
        }
    });



});
