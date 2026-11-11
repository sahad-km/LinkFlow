
import request from "supertest";
import { jest } from "@jest/globals";

const mockSql = jest.fn();
const mockRedisDel = jest.fn();

jest.unstable_mockModule("../../config/db.js", () => ({
    sql: mockSql
}));

jest.unstable_mockModule("../../config/redis.js", () => ({
    default: {
        get: jest.fn(),
        incr: jest.fn(),
        set: jest.fn(),
        del: mockRedisDel
    },
    redis: {
        get: jest.fn(),
        incr: jest.fn(),
        set: jest.fn(),
        del: mockRedisDel
    }
}));

const { default: app } = await import("../../app.js");

describe("DELETE /:shortCode", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });


    test("should delete an anonymous URL successfully", async () => {
        // First SQL call: Find the URL
        mockSql.mockResolvedValueOnce([
            {
                id: 1,
                user_id: null,
                short_code: "abc123"
            }
        ]);

        // Second SQL call: Delete the URL
        mockSql.mockResolvedValueOnce([]);

        mockRedisDel.mockResolvedValueOnce(1);

        const response = await request(app)
            .delete("/abc123");

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            success: true,
            message: "Short URL deleted successfully"
        });

        expect(mockSql).toHaveBeenCalledTimes(2);

        expect(mockRedisDel).toHaveBeenCalledWith("url:abc123");
    });



    test("should allow the owner to delete their own URL", async () => {
        mockSql.mockResolvedValueOnce([
            {
                id: 2,
                user_id: "user-123",
                short_code: "owner123"
            }
        ]);

        mockSql.mockResolvedValueOnce([]);

        mockRedisDel.mockResolvedValueOnce(1);

        const response = await request(app)
            .delete("/owner123")
            .set("x-user-id", "user-123");

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            success: true,
            message: "Short URL deleted successfully"
        });

        expect(mockSql).toHaveBeenCalledTimes(2);

        expect(mockRedisDel).toHaveBeenCalledWith("url:owner123");
    });


    test("should prevent another user from deleting someone else's URL", async () => {
        mockSql.mockResolvedValueOnce([
            {
                id: 3,
                user_id: "user-A",
                short_code: "private123"
            }
        ]);

        const response = await request(app)
            .delete("/private123")
            .set("x-user-id", "user-B");

        expect(response.status).toBe(403);

        expect(response.body).toEqual({
            success: false,
            message: "Forbidden: You are not authorized to delete this URL"
        });

        // Only the SELECT query should execute
        expect(mockSql).toHaveBeenCalledTimes(1);

        // Redis cache must not be invalidated
        expect(mockRedisDel).not.toHaveBeenCalled();
    });



    test("should prevent unauthenticated users from deleting a registered user's URL", async () => {
        mockSql.mockResolvedValueOnce([
            {
                id: 4,
                user_id: "user-A",
                short_code: "protected123"
            }
        ]);

        const response = await request(app)
            .delete("/protected123");

        expect(response.status).toBe(403);

        expect(response.body).toEqual({
            success: false,
            message: "Forbidden: You are not authorized to delete this URL"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
        expect(mockRedisDel).not.toHaveBeenCalled();
    });

    test("should return 404 when URL does not exist", async () => {
        mockSql.mockResolvedValueOnce([]);

        const response = await request(app)
            .delete("/unknown123");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            success: false,
            message: "Short URL not found"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
        expect(mockRedisDel).not.toHaveBeenCalled();
    });

    test("should return 500 when PostgreSQL query fails", async () => {
        mockSql.mockRejectedValueOnce(
            new Error("Database connection failed")
        );

        const response = await request(app)
            .delete("/abc123");

        expect(response.status).toBe(500);

        expect(response.body).toEqual({
            success: false,
            message: "Internal server error"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
        expect(mockRedisDel).not.toHaveBeenCalled();
    });

    test("should return 500 when Redis cache invalidation fails", async () => {
        mockSql.mockResolvedValueOnce([
            {
                id: 7,
                user_id: null,
                short_code: "redisfail123"
            }
        ]);

        // PostgreSQL DELETE succeeds
        mockSql.mockResolvedValueOnce([]);

        // Redis DEL fails
        mockRedisDel.mockRejectedValueOnce(
            new Error("Redis connection failed")
        );

        const response = await request(app)
            .delete("/redisfail123");

        expect(response.status).toBe(500);

        expect(response.body).toEqual({
            success: false,
            message: "Internal server error"
        });

        expect(mockSql).toHaveBeenCalledTimes(1);
        expect(mockRedisDel).toHaveBeenCalledWith("url:redisfail123");
    });

});
