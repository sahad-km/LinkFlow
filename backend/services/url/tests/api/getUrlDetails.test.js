
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

describe("GET /:shortCode", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });


    test("should return URL details when short code exists", async () => {
        const mockUrl = {
            id: 1,
            user_id: "user-123",
            short_code: "abc123",
            long_url: "https://example.com",
            title: "Example Website",
            clicks: 25,
            created_at: new Date("2026-11-01T10:00:00.000Z"),
            updated_at: new Date("2026-11-02T10:00:00.000Z")
        };

        mockSql.mockResolvedValueOnce([mockUrl]);

        const response = await request(app).get("/abc123");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        expect(response.body.data).toEqual({
            id: 1,
            shortCode: "abc123",
            shortUrl: "http://localhost:8000/abc123",
            longUrl: "https://example.com",
            title: "Example Website",
            clicks: 25,
            createdAt: mockUrl.created_at.toISOString(),
            updatedAt: mockUrl.updated_at.toISOString()
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
    });



    test("should return 404 when short code does not exist", async () => {
        mockSql.mockResolvedValueOnce([]);

        const response = await request(app).get("/notfound");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            success: false,
            message: "Short URL not found"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
    });


    test("should return 500 when PostgreSQL query fails", async () => {
        mockSql.mockRejectedValueOnce(
            new Error("PostgreSQL connection failed")
        );

        const response = await request(app).get("/abc123");

        expect(response.status).toBe(500);

        expect(response.body).toEqual({
            success: false,
            message: "Internal server error"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
    });



});
