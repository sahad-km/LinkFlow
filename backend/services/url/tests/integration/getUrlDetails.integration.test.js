
import request from "supertest";
import app from "../../app.js";
import { sql, connectDB, closeDB } from "../../config/db.js";

describe("Get URL Details Integration Test", () => {
    const shortCode = "details-integration";
    const longUrl = "https://example.com/details-integration-test";

    beforeAll(async () => {
        await connectDB();
    });

    afterAll(async () => {
        await closeDB();
    });

    beforeEach(async () => {
        await sql`
            INSERT INTO urls (short_code, long_url, title, clicks)
            VALUES (
                ${shortCode},
                ${longUrl},
                ${"Integration Test URL"},
                ${25}
            )
            ON CONFLICT (short_code)
            DO UPDATE SET
                long_url = EXCLUDED.long_url,
                title = EXCLUDED.title,
                clicks = EXCLUDED.clicks
        `;
    });

    afterEach(async () => {
        await sql`
            DELETE FROM urls WHERE short_code = ${shortCode}
        `;
    });

    test("should retrieve URL details from PostgreSQL", async () => {
        const response = await request(app)
            .get(`/url/${shortCode}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const baseUrl = process.env.BASE_URL || "http://localhost:8000";

        expect(response.body.data).toMatchObject({
            shortCode,
            shortUrl: `${baseUrl}/${shortCode}`,
            longUrl,
            title: "Integration Test URL",
            clicks: 25
        });

        expect(response.body.data.id).toBeDefined();
        expect(response.body.data.createdAt).toBeDefined();
        expect(response.body.data.updatedAt).toBeDefined();
    });

    test("should return 404 for a nonexistent short URL", async () => {
        const response = await request(app)
            .get("/url/nonexistent-details-test");

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Short URL not found");
    });
});
