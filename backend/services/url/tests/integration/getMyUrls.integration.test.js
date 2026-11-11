
import request from "supertest";
import app from "../../app.js";
import { sql, connectDB, closeDB } from "../../config/db.js";

describe("Get My URLs Integration Test", () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const emptyUser = "33333333-3333-4333-8333-333333333333";

    beforeAll(async () => {
        await connectDB();
    });

    afterAll(async () => {
        await closeDB();
    });

    beforeEach(async () => {
        await sql`
            INSERT INTO urls (
                user_id, short_code, long_url, title, clicks, created_at
            )
            VALUES
                (
                    ${userA},
                    ${"my-urls-old"},
                    ${"https://example.com/old"},
                    ${"Old URL"},
                    ${10},
                    ${"2026-11-01T10:00:00Z"}
                ),
                (
                    ${userA},
                    ${"my-urls-new"},
                    ${"https://example.com/new"},
                    ${"New URL"},
                    ${25},
                    ${"2026-11-05T10:00:00Z"}
                ),
                (
                    ${userB},
                    ${"other-user-url"},
                    ${"https://example.com/other"},
                    ${"Other User URL"},
                    ${5},
                    ${"2026-11-03T10:00:00Z"}
                )
        `;
    });

    afterEach(async () => {
        await sql`
            DELETE FROM urls
            WHERE short_code IN (
                ${"my-urls-old"},
                ${"my-urls-new"},
                ${"other-user-url"}
            )
        `;
    });

    test("should return only URLs belonging to the authenticated user", async () => {
        const response = await request(app)
            .get("/url/my-urls")
            .set("x-user-id", userA);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.count).toBe(2);

        expect(
            response.body.data.map((url) => url.shortCode)
        ).toEqual(["my-urls-new", "my-urls-old"]);

        const baseUrl = process.env.BASE_URL || "http://localhost:8000";

        expect(response.body.data[0]).toMatchObject({
            shortCode: "my-urls-new",
            longUrl: "https://example.com/new",
            title: "New URL",
            clicks: 25,
            shortUrl: `${baseUrl}/my-urls-new`
        });
    });

    test("should not return URLs belonging to another user", async () => {
        const response = await request(app)
            .get("/url/my-urls")
            .set("x-user-id", userA);

        expect(response.status).toBe(200);

        const shortCodes = response.body.data.map(
            (url) => url.shortCode
        );

        expect(shortCodes).not.toContain("other-user-url");
    });

    test("should reject requests without authentication", async () => {
        const response = await request(app)
            .get("/url/my-urls");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe(
            "Authentication required to access this resource"
        );
    });

    test("should return an empty array when the user has no URLs", async () => {
        const response = await request(app)
            .get("/url/my-urls")
            .set("x-user-id", emptyUser);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.count).toBe(0);
        expect(response.body.data).toEqual([]);
    });
});
