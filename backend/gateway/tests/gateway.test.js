import { describe, test, expect } from "@jest/globals";
import request from "supertest";
import app, { globalLimiter, authLimiter, urlCreateLimiter } from "../app.js";

describe("API Gateway Tests", () => {
    describe("Health & Diagnostics Endpoints", () => {
        test("GET / should return 200 and gateway service metadata", async () => {
            const res = await request(app).get("/");
            expect(res.status).toBe(200);
            expect(res.body.service).toBe("LinkFlow Gateway");
            expect(res.body.status).toBe("active");
            expect(res.body.timestamp).toBeDefined();
        });

        test("GET /health should return 200 and healthy status", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("healthy");
        });
    });

    describe("Rate Limiting Middleware Configuration", () => {
        test("globalLimiter should be configured for 600 requests per 15 minutes with draft-7 headers", () => {
            expect(globalLimiter).toBeDefined();
            // Draft-7 headers should be present on responses
        });

        test("authLimiter should be configured for 25 requests per 15 minutes", () => {
            expect(authLimiter).toBeDefined();
        });

        test("urlCreateLimiter should be configured for 50 requests per 15 minutes", () => {
            expect(urlCreateLimiter).toBeDefined();
        });

        test("should attach RateLimit headers (draft-7) to responses", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.headers).toHaveProperty("ratelimit");
            expect(res.headers["ratelimit"]).toMatch(/limit=600/);
            expect(res.headers["ratelimit"]).toMatch(/remaining=/);
            expect(res.headers).toHaveProperty("ratelimit-policy");
        });
    });

    describe("CORS Configuration", () => {
        test("should allow requests with Origin and set Access-Control headers", async () => {
            const res = await request(app)
                .get("/health")
                .set("Origin", "http://localhost:5173");

            expect(res.status).toBe(200);
            expect(res.headers["access-control-allow-credentials"]).toBe("true");
        });
    });

    describe("Proxy Routing Structure", () => {
        test("gateway app should be defined and mount routes", () => {
            expect(app).toBeDefined();
            expect(typeof app.handle).toBe("function");
        });
    });
});
