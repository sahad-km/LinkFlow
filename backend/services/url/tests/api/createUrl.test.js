
import request from "supertest";
import { jest } from "@jest/globals";

const mockSql = jest.fn();
const mockRedisIncr = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.unstable_mockModule("../../config/db.js", () => ({
    sql: mockSql
}));

jest.unstable_mockModule("../../config/redis.js", () => ({
    default: {
        incr: mockRedisIncr,
        set: mockRedisSet,
        del: mockRedisDel
    },
    redis: {
        incr: mockRedisIncr,
        set: mockRedisSet,
        del: mockRedisDel
    }
}));

const { default: app } = await import("../../app.js");

describe("POST /create", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("should create a short URL successfully for an anonymous user", async () => {
        // Mock Redis counter
        mockRedisIncr.mockResolvedValue(60000000001);

        // Mock PostgreSQL INSERT
        mockSql.mockResolvedValue([
            {
                id: 1,
                user_id: null,
                short_code: "13uxSTv",
                long_url: "https://example.com",
                title: "Example website",
                clicks: 0,
                created_at: new Date()
            }
        ]);

        // Mock Redis cache
        mockRedisSet.mockResolvedValue("OK");

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com",
                title: "Example website"
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);

        expect(response.body.data.shortCode).toBe("13uxSTv");
        expect(response.body.data.longUrl).toBe("https://example.com");

        expect(mockRedisIncr).toHaveBeenCalledWith("url:counter");
        expect(mockSql).toHaveBeenCalledTimes(1);
        expect(mockRedisSet).toHaveBeenCalledWith(
            "url:13uxSTv",
            "https://example.com",
            "EX",
            2592000
        );
    });

    test("should reject an invalid URL", async () => {
        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "not-a-valid-url"
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Validation failed");

        expect(mockRedisIncr).not.toHaveBeenCalled();
        expect(mockSql).not.toHaveBeenCalled();
    });

    test("should reject a custom alias shorter than 3 characters", async () => {
        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com",
                customCode: "ab"
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Validation failed");

        expect(mockRedisIncr).not.toHaveBeenCalled();
        expect(mockSql).not.toHaveBeenCalled();
    });

    test("should reject an already existing custom alias", async () => {
        // Mock PostgreSQL SELECT: alias already exists
        mockSql.mockResolvedValueOnce([
            {
                id: 10
            }
        ]);

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com",
                customCode: "myalias"
            });

        expect(response.status).toBe(409);

        expect(response.body).toEqual({
            success: false,
            message: "Custom alias is already in use. Please choose another."
        });

        // No Redis counter should be generated
        expect(mockRedisIncr).not.toHaveBeenCalled();

        // PostgreSQL should only be queried once
        expect(mockSql).toHaveBeenCalledTimes(1);

        // No cache should be created
        expect(mockRedisSet).not.toHaveBeenCalled();
    });


    test("should return 500 when Redis counter fails", async () => {
        mockRedisIncr.mockRejectedValueOnce(
            new Error("Redis connection failed")
        );

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com"
            });

        expect(response.status).toBe(500);

        expect(response.body).toEqual({
            success: false,
            message: "Internal server error"
        });

        // PostgreSQL should not be called
        expect(mockSql).not.toHaveBeenCalled();

        // Redis cache should not be created
        expect(mockRedisSet).not.toHaveBeenCalled();
    });


    test("should return 500 when PostgreSQL insert fails", async () => {
        mockRedisIncr.mockResolvedValueOnce(60000000002);

        mockSql.mockRejectedValueOnce(
            new Error("PostgreSQL connection failed")
        );

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com"
            });

        expect(response.status).toBe(500);

        expect(response.body).toEqual({
            success: false,
            message: "Internal server error"
        });

        expect(mockRedisIncr).toHaveBeenCalledTimes(1);
        expect(mockSql).toHaveBeenCalledTimes(1);

        // No cache should be created
        expect(mockRedisSet).not.toHaveBeenCalled();
    });



    test("should still create URL successfully when Redis cache write fails", async () => {
        mockRedisIncr.mockResolvedValueOnce(60000000003);

        mockSql.mockResolvedValueOnce([
            {
                id: 3,
                user_id: null,
                short_code: "13uxSTx",
                long_url: "https://example.com",
                title: null,
                clicks: 0,
                created_at: new Date()
            }
        ]);

        mockRedisSet.mockRejectedValueOnce(
            new Error("Redis cache write failed")
        );

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com"
            });

        // PostgreSQL succeeded, so API should still return 201
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.shortCode).toBe("13uxSTx");

        // Verify PostgreSQL was called
        expect(mockSql).toHaveBeenCalledTimes(1);

        // Verify Redis caching was attempted
        expect(mockRedisSet).toHaveBeenCalledTimes(1);
    });


    test("should create a URL successfully with a custom alias", async () => {
        // First SQL call: check whether alias exists
        mockSql.mockResolvedValueOnce([]);

        // Second SQL call: insert the URL
        mockSql.mockResolvedValueOnce([
            {
                id: 4,
                user_id: null,
                short_code: "myportfolio",
                long_url: "https://example.com",
                title: "My Portfolio",
                clicks: 0,
                created_at: new Date()
            }
        ]);

        mockRedisSet.mockResolvedValueOnce("OK");

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com",
                customCode: "myportfolio",
                title: "My Portfolio"
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.shortCode).toBe("myportfolio");

        // Custom aliases should not consume the Redis counter
        expect(mockRedisIncr).not.toHaveBeenCalled();

        // One SELECT + one INSERT
        expect(mockSql).toHaveBeenCalledTimes(2);

        expect(mockRedisSet).toHaveBeenCalledWith(
            "url:myportfolio",
            "https://example.com",
            "EX",
            2592000
        );
    });



    test("should return 409 when PostgreSQL detects a duplicate short code", async () => {
        // Alias availability check succeeds
        mockSql.mockResolvedValueOnce([]);

        // INSERT fails because another request inserted the same alias
        const duplicateError = new Error("Duplicate short code");
        duplicateError.code = "23505";

        mockSql.mockRejectedValueOnce(duplicateError);

        const response = await request(app)
            .post("/create")
            .send({
                longUrl: "https://example.com",
                customCode: "myportfolio"
            });

        expect(response.status).toBe(409);

        expect(response.body).toEqual({
            success: false,
            message: "This short code is already in use. Please choose another."
        });

        expect(mockSql).toHaveBeenCalledTimes(2);
        expect(mockRedisIncr).not.toHaveBeenCalled();
        expect(mockRedisSet).not.toHaveBeenCalled();
    });


    test("should associate the created URL with an authenticated user", async () => {
        mockRedisIncr.mockResolvedValueOnce(60000000004);

        mockSql.mockResolvedValueOnce([
            {
                id: 5,
                user_id: "user-123",
                short_code: "13uxSTy",
                long_url: "https://example.com",
                title: null,
                clicks: 0,
                created_at: new Date()
            }
        ]);

        mockRedisSet.mockResolvedValueOnce("OK");

        const response = await request(app)
            .post("/create")
            .set("x-user-id", "user-123")
            .send({
                longUrl: "https://example.com"
            });

        expect(response.status).toBe(201);

        expect(mockSql).toHaveBeenCalledTimes(1);

        // Verify the authenticated user's ID was passed to PostgreSQL
        expect(mockSql.mock.calls[0][1]).toBe("user-123");

        expect(response.body.data.shortCode).toBe("13uxSTy");
    });

});
