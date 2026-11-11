
import request from "supertest";
import { jest } from "@jest/globals";

const mockSql = jest.fn();

jest.unstable_mockModule("../../config/db.js", () => ({
    sql: mockSql
}));

jest.unstable_mockModule("../../config/redis.js", () => ({
    default: {
        get: jest.fn(),
        incr: jest.fn(),
        set: jest.fn(),
        del: jest.fn()
    },
    redis: {
        get: jest.fn(),
        incr: jest.fn(),
        set: jest.fn(),
        del: jest.fn()
    }
}));

const { default: app } = await import("../../app.js");

describe("GET /my-urls", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });


    test("should return URLs belonging to the authenticated user", async () => {
        const mockUrls = [
            {
                id: 1,
                short_code: "abc123",
                long_url: "https://example.com",
                title: "Example Website",
                clicks: 25,
                created_at: new Date("2026-11-01T10:00:00.000Z")
            },
            {
                id: 2,
                short_code: "xyz789",
                long_url: "https://google.com",
                title: "Google",
                clicks: 10,
                created_at: new Date("2026-11-02T10:00:00.000Z")
            }
        ];

        mockSql.mockResolvedValueOnce(mockUrls);

        const response = await request(app)
            .get("/my-urls")
            .set("x-user-id", "user-123");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.count).toBe(2);

        expect(response.body.data).toHaveLength(2);

        expect(response.body.data[0]).toEqual({
            id: 1,
            shortCode: "abc123",
            shortUrl: "http://localhost:8000/abc123",
            longUrl: "https://example.com",
            title: "Example Website",
            clicks: 25,
            createdAt: mockUrls[0].created_at.toISOString()
        });

        // Verify the authenticated user's ID was passed to PostgreSQL
        expect(mockSql.mock.calls[0][1]).toBe("user-123");

        expect(mockSql).toHaveBeenCalledTimes(1);
    });



    test("should return an empty array when user has no URLs", async () => {
        mockSql.mockResolvedValueOnce([]);

        const response = await request(app)
            .get("/my-urls")
            .set("x-user-id", "user-456");

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            success: true,
            count: 0,
            data: []
        });

        expect(mockSql.mock.calls[0][1]).toBe("user-456");
    });



    test("should return 401 when user is not authenticated", async () => {
        const response = await request(app).get("/my-urls");

        expect(response.status).toBe(401);

        expect(response.body).toEqual({
            message: "Authentication required to access this resource"
        });

        // Database should never be queried
        expect(mockSql).not.toHaveBeenCalled();
    });


    test("should return 500 when PostgreSQL query fails", async () => {
        mockSql.mockRejectedValueOnce(
            new Error("PostgreSQL connection failed")
        );

        const response = await request(app)
            .get("/my-urls")
            .set("x-user-id", "user-123");

        expect(response.status).toBe(500);

        expect(response.body).toEqual({
            success: false,
            message: "Internal server error"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
    });

});
