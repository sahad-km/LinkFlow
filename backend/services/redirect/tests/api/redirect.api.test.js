import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockSql = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisExpire = jest.fn();
const mockRedisHincrby = jest.fn();
const mockRedisTtl = jest.fn();
const mockPublishClickEvent = jest.fn();

jest.unstable_mockModule("../../config/db.js", () => ({
    sql: mockSql,
    default: mockSql,
    connectDB: jest.fn(),
    closeDB: jest.fn()
}));

jest.unstable_mockModule("../../config/redis.js", () => ({
    default: {
        get: mockRedisGet,
        set: mockRedisSet,
        expire: mockRedisExpire,
        hincrby: mockRedisHincrby,
        ttl: mockRedisTtl
    }
}));

jest.unstable_mockModule("../../producers/clickProducer.js", () => ({
    publishClickEvent: mockPublishClickEvent,
    connectProducer: jest.fn(),
    disconnectProducer: jest.fn()
}));

const { default: app } = await import("../../app.js");
const { waitForPendingAnalytics } = await import("../../controllers/redirect.controller.js");

describe("Redirect Service API Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisExpire.mockResolvedValue(1);
        mockRedisHincrby.mockResolvedValue(1);
        mockPublishClickEvent.mockResolvedValue(undefined);
    });

    describe("GET /health & Service Info", () => {
        test("should return 200 with healthy status", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("healthy");
        });

        test("GET / should return service info", async () => {
            const res = await request(app).get("/");
            expect(res.status).toBe(200);
            expect(res.body.service).toBe("LinkFlow Redirect Service");
            expect(res.body.status).toBe("active");
        });
    });

    describe("GET /:shortCode - System File Ignores", () => {
        test("should return 404 for favicon.ico", async () => {
            const res = await request(app).get("/favicon.ico");
            expect(res.status).toBe(404);
            expect(res.body.message).toBe("Not found");
            expect(mockRedisGet).not.toHaveBeenCalled();
            expect(mockSql).not.toHaveBeenCalled();
        });

        test("should return 404 for robots.txt", async () => {
            const res = await request(app).get("/robots.txt");
            expect(res.status).toBe(404);
            expect(res.body.message).toBe("Not found");
        });
    });

    describe("GET /:shortCode - Cache Hit Flow", () => {
        test("should resolve from Redis JSON cache, extend TTL, record clicks, and return 302", async () => {
            const cachedPayload = JSON.stringify({
                id: "url-uuid-101",
                longUrl: "https://example.com/cached-page"
            });
            mockRedisGet.mockResolvedValueOnce(cachedPayload);

            const res = await request(app).get("/fast-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe("https://example.com/cached-page");

            // Verify PostgreSQL was NOT touched
            expect(mockSql).not.toHaveBeenCalled();

            // Verify Redis TTL extension
            expect(mockRedisExpire).toHaveBeenCalledWith("url:fast-link", expect.any(Number));

            // Wait for background analytics tracking
            await waitForPendingAnalytics();

            expect(mockRedisHincrby).toHaveBeenCalledWith("url_clicks", "fast-link", 1);
            expect(mockPublishClickEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    shortCode: "fast-link",
                    linkId: "url-uuid-101"
                })
            );
        });

        test("should support raw string cache value (legacy cache entry)", async () => {
            mockRedisGet.mockResolvedValueOnce("https://legacy.example.com");

            const res = await request(app).get("/legacy-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe("https://legacy.example.com");
            expect(mockSql).not.toHaveBeenCalled();

            await waitForPendingAnalytics();
            expect(mockPublishClickEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    shortCode: "legacy-link",
                    linkId: null
                })
            );
        });

        test("should fall back gracefully to raw string if cached JSON is malformed", async () => {
            mockRedisGet.mockResolvedValueOnce("{invalid-json-content");

            const res = await request(app).get("/broken-json-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe(encodeURI("{invalid-json-content"));
        });
    });

    describe("GET /:shortCode - Cache Miss Flow", () => {
        test("should query PostgreSQL on cache miss, populate Redis, record click, and return 302", async () => {
            mockRedisGet.mockResolvedValueOnce(null); // Cache miss

            const dbRow = {
                id: "db-uuid-202",
                short_code: "cold-link",
                long_url: "https://example.com/cold-destination",
                clicks: 10
            };
            mockSql.mockResolvedValueOnce([dbRow]);
            mockRedisSet.mockResolvedValueOnce("OK");

            const res = await request(app).get("/cold-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe("https://example.com/cold-destination");

            // Verify Redis cache population
            expect(mockRedisSet).toHaveBeenCalledWith(
                "url:cold-link",
                JSON.stringify({ id: dbRow.id, longUrl: dbRow.long_url }),
                "EX",
                expect.any(Number)
            );

            await waitForPendingAnalytics();
            expect(mockRedisHincrby).toHaveBeenCalledWith("url_clicks", "cold-link", 1);
            expect(mockPublishClickEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    shortCode: "cold-link",
                    linkId: "db-uuid-202"
                })
            );
        });

        test("should return 404 HTML page if shortCode is not found in database", async () => {
            mockRedisGet.mockResolvedValueOnce(null);
            mockSql.mockResolvedValueOnce([]); // No record

            const res = await request(app).get("/unknown-shortcode");

            expect(res.status).toBe(404);
            expect(res.text).toContain("Link Not Found");
            expect(res.text).toContain("unknown-shortcode");
            expect(mockRedisSet).not.toHaveBeenCalled();
            expect(mockPublishClickEvent).not.toHaveBeenCalled();
        });
    });

    describe("Resilience & Dependency Failure Modes", () => {
        test("should fall back to PostgreSQL and redirect if Redis GET throws an error", async () => {
            mockRedisGet.mockRejectedValueOnce(new Error("Redis connection refused"));

            const dbRow = {
                id: "db-uuid-303",
                short_code: "resilient-link",
                long_url: "https://example.com/fallback-page"
            };
            mockSql.mockResolvedValueOnce([dbRow]);
            mockRedisSet.mockResolvedValueOnce("OK");

            const res = await request(app).get("/resilient-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe("https://example.com/fallback-page");
        });

        test("should complete redirect even if Redis SET throws an error on cache write", async () => {
            mockRedisGet.mockResolvedValueOnce(null);
            mockSql.mockResolvedValueOnce([{
                id: "db-uuid-404",
                short_code: "write-fail-link",
                long_url: "https://example.com/write-fail"
            }]);
            mockRedisSet.mockRejectedValueOnce(new Error("Redis OOM error"));

            const res = await request(app).get("/write-fail-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe("https://example.com/write-fail");
        });

        test("should complete redirect even if Kafka publishClickEvent throws an error", async () => {
            mockRedisGet.mockResolvedValueOnce("https://example.com/kafka-fail");
            mockPublishClickEvent.mockRejectedValueOnce(new Error("Kafka broker disconnected"));

            const res = await request(app).get("/kafka-fail-link");

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe("https://example.com/kafka-fail");

            // Waiting for pending analytics should settle cleanly without unhandled rejection
            await expect(waitForPendingAnalytics()).resolves.toBeUndefined();
        });

        test("should return 500 when PostgreSQL query fails on cache miss", async () => {
            mockRedisGet.mockResolvedValueOnce(null);
            mockSql.mockRejectedValueOnce(new Error("PostgreSQL pool exhausted"));

            const res = await request(app).get("/failing-link");

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Internal server error");
        });
    });

    describe("GET /cache-status/:shortCode", () => {
        test("should return cache status and database details", async () => {
            mockRedisGet.mockResolvedValueOnce("https://example.com/status-target");
            mockRedisTtl.mockResolvedValueOnce(3600);

            const dbRow = {
                id: "uuid-505",
                short_code: "status-test",
                long_url: "https://example.com/status-target",
                clicks: 42
            };
            mockSql.mockResolvedValueOnce([dbRow]);

            const res = await request(app).get("/cache-status/status-test");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                shortCode: "status-test",
                inCache: true,
                cachedUrl: "https://example.com/status-target",
                cacheTtlSecondsRemaining: 3600,
                inDatabase: true,
                databaseDetails: dbRow
            });
        });

        test("should return 500 if cache-status lookup encounters an error", async () => {
            mockRedisGet.mockRejectedValueOnce(new Error("Redis down"));

            const res = await request(app).get("/cache-status/err-code");

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Internal server error");
        });
    });
});
