import { jest, describe, test, expect, beforeEach, beforeAll } from "@jest/globals";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const mockSql = jest.fn();

jest.unstable_mockModule("../../config/db.js", () => ({
    sql: mockSql,
    default: mockSql,
    connectDB: jest.fn(),
    closeDB: jest.fn(),
    initTables: jest.fn()
}));

const { default: app } = await import("../../app.js");
const { generateTokens } = await import("../../utils/token.utils.js");

describe("Auth Service API Tests", () => {
    let hashedPassword;
    const testPassword = "securePassword123";

    beforeAll(async () => {
        hashedPassword = await bcrypt.hash(testPassword, 10);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("GET /health", () => {
        test("should return 200 with status healthy", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ status: "healthy" });
        });

        test("GET / should return service info", async () => {
            const res = await request(app).get("/");
            expect(res.status).toBe(200);
            expect(res.body.service).toBe("LinkFlow Auth Service");
            expect(res.body.status).toBe("active");
        });

        test("should return 404 for unknown routes", async () => {
            const res = await request(app).get("/non-existent-endpoint");
            expect(res.status).toBe(404);
            expect(res.body.message).toMatch(/not found/i);
        });
    });

    describe("POST /auth/register", () => {
        const registerPayload = {
            name: "Alice Tester",
            email: "alice@example.com",
            password: "password123"
        };

        test("should register a new user successfully", async () => {
            // 1. Mock existing user check -> returns none
            mockSql.mockResolvedValueOnce([]);

            // 2. Mock INSERT user -> returns created user
            const createdUser = {
                id: "user-uuid-1",
                name: "Alice Tester",
                email: "alice@example.com",
                role: "user",
                created_at: new Date().toISOString()
            };
            mockSql.mockResolvedValueOnce([createdUser]);

            // 3. Mock INSERT refresh token
            mockSql.mockResolvedValueOnce([{ id: "token-uuid-1" }]);

            const res = await request(app)
                .post("/auth/register")
                .send(registerPayload);

            expect(res.status).toBe(201);
            expect(res.body.message).toBe("User registered successfully");
            expect(res.body.user).toEqual(createdUser);
            expect(res.body).toHaveProperty("accessToken");
            expect(res.body).toHaveProperty("refreshToken");

            // Verify refreshToken cookie was set
            const cookies = res.headers["set-cookie"];
            expect(cookies).toBeDefined();
            expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
        });

        test("should return 409 if user already exists", async () => {
            mockSql.mockResolvedValueOnce([{ id: "existing-user-uuid" }]);

            const res = await request(app)
                .post("/auth/register")
                .send(registerPayload);

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/already exists/i);
        });

        test("should return 400 when input validation fails (short password)", async () => {
            const res = await request(app)
                .post("/auth/register")
                .send({
                    name: "Alice",
                    email: "alice@example.com",
                    password: "123"
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("Validation failed");
            expect(res.body.errors).toBeDefined();
        });

        test("should return 500 when database query throws an error", async () => {
            mockSql.mockRejectedValueOnce(new Error("Database connection lost"));

            const res = await request(app)
                .post("/auth/register")
                .send(registerPayload);

            expect(res.status).toBe(500);
            expect(res.body.message).toBe("Internal server error");
        });
    });

    describe("POST /auth/login", () => {
        const loginPayload = {
            email: "alice@example.com",
            password: testPassword
        };

        test("should login successfully with correct credentials", async () => {
            const mockDbUser = {
                id: "user-uuid-1",
                name: "Alice Tester",
                email: "alice@example.com",
                password: hashedPassword,
                role: "user",
                created_at: new Date().toISOString()
            };

            // 1. SELECT user
            mockSql.mockResolvedValueOnce([mockDbUser]);
            // 2. INSERT refresh_tokens
            mockSql.mockResolvedValueOnce([{ id: "rt-1" }]);

            const res = await request(app)
                .post("/auth/login")
                .send(loginPayload);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Login successful");
            expect(res.body.user.email).toBe("alice@example.com");
            expect(res.body.user).not.toHaveProperty("password");
            expect(res.body).toHaveProperty("accessToken");
            expect(res.body).toHaveProperty("refreshToken");

            const cookies = res.headers["set-cookie"];
            expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
        });

        test("should return 401 when email is not found", async () => {
            mockSql.mockResolvedValueOnce([]); // No user

            const res = await request(app)
                .post("/auth/login")
                .send(loginPayload);

            expect(res.status).toBe(401);
            expect(res.body.message).toBe("Invalid email or password");
        });

        test("should return 401 when password does not match", async () => {
            const mockDbUser = {
                id: "user-uuid-1",
                email: "alice@example.com",
                password: hashedPassword
            };
            mockSql.mockResolvedValueOnce([mockDbUser]);

            const res = await request(app)
                .post("/auth/login")
                .send({
                    email: "alice@example.com",
                    password: "wrongPassword"
                });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe("Invalid email or password");
        });
    });

    describe("POST /auth/refresh", () => {
        test("should rotate refresh token and issue new token pair", async () => {
            const user = { id: "user-uuid-1", email: "alice@example.com", role: "user" };
            const { refreshToken } = generateTokens(user);

            // 1. SELECT token from DB
            mockSql.mockResolvedValueOnce([{
                id: "rt-id-1",
                user_id: user.id,
                expires_at: new Date(Date.now() + 100000).toISOString()
            }]);

            // 2. SELECT user
            mockSql.mockResolvedValueOnce([user]);

            // 3. DELETE old token
            mockSql.mockResolvedValueOnce([]);

            // 4. INSERT new token
            mockSql.mockResolvedValueOnce([{ id: "rt-id-2" }]);

            const res = await request(app)
                .post("/auth/refresh")
                .send({ refreshToken });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("accessToken");
            expect(res.body).toHaveProperty("refreshToken");
            expect(res.body.refreshToken).not.toBe(refreshToken);
        });

        test("should accept refresh token from HTTP-only cookie", async () => {
            const user = { id: "user-uuid-1", email: "alice@example.com", role: "user" };
            const { refreshToken } = generateTokens(user);

            mockSql.mockResolvedValueOnce([{
                id: "rt-id-1",
                user_id: user.id,
                expires_at: new Date(Date.now() + 100000).toISOString()
            }]);
            mockSql.mockResolvedValueOnce([user]);
            mockSql.mockResolvedValueOnce([]);
            mockSql.mockResolvedValueOnce([{ id: "rt-id-2" }]);

            const res = await request(app)
                .post("/auth/refresh")
                .set("Cookie", [`refreshToken=${refreshToken}`]);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("accessToken");
        });

        test("should return 401 when refresh token is missing", async () => {
            const res = await request(app).post("/auth/refresh").send({});
            expect(res.status).toBe(401);
            expect(res.body.message).toBe("Refresh token is required");
        });

        test("should return 401 for an invalid or tampered refresh token", async () => {
            const res = await request(app)
                .post("/auth/refresh")
                .send({ refreshToken: "invalid.jwt.token" });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe("Invalid or expired refresh token");
        });

        test("should return 401 when token record is not in database (revoked)", async () => {
            const user = { id: "user-uuid-1", email: "alice@example.com" };
            const { refreshToken } = generateTokens(user);

            mockSql.mockResolvedValueOnce([]); // Token not in DB

            const res = await request(app)
                .post("/auth/refresh")
                .send({ refreshToken });

            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/revoked or expired/i);
        });

        test("should return 401 if user belonging to token no longer exists", async () => {
            const user = { id: "user-uuid-1", email: "alice@example.com" };
            const { refreshToken } = generateTokens(user);

            mockSql.mockResolvedValueOnce([{
                id: "rt-id-1",
                user_id: user.id,
                expires_at: new Date(Date.now() + 100000).toISOString()
            }]);
            mockSql.mockResolvedValueOnce([]); // User not in DB

            const res = await request(app)
                .post("/auth/refresh")
                .send({ refreshToken });

            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/no longer exists/i);
        });
    });

    describe("POST /auth/logout", () => {
        test("should invalidate refresh token and clear cookie", async () => {
            mockSql.mockResolvedValueOnce([]); // DELETE token

            const res = await request(app)
                .post("/auth/logout")
                .send({ refreshToken: "some-token" });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Logged out successfully");

            // Verify cookie clearance header
            const cookies = res.headers["set-cookie"];
            expect(cookies).toBeDefined();
            expect(cookies.some((c) => c.includes("refreshToken=;"))).toBe(true);
        });

        test("should succeed even if no token is provided (clears cookie)", async () => {
            const res = await request(app).post("/auth/logout");
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Logged out successfully");
        });
    });

    describe("GET /auth/me", () => {
        test("should return profile for authenticated user", async () => {
            const user = { id: "user-uuid-1", email: "alice@example.com", role: "user" };
            const { accessToken } = generateTokens(user);

            const userProfile = {
                id: user.id,
                name: "Alice Tester",
                email: user.email,
                role: user.role,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            mockSql.mockResolvedValueOnce([userProfile]);

            const res = await request(app)
                .get("/auth/me")
                .set("Authorization", `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.user).toEqual(userProfile);
        });

        test("should return 401 when authorization header is missing", async () => {
            const res = await request(app).get("/auth/me");
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/Unauthorized/i);
        });

        test("should return 404 if authenticated user was deleted from database", async () => {
            const user = { id: "deleted-user-uuid", email: "deleted@example.com" };
            const { accessToken } = generateTokens(user);

            mockSql.mockResolvedValueOnce([]); // No user row

            const res = await request(app)
                .get("/auth/me")
                .set("Authorization", `Bearer ${accessToken}`);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe("User not found");
        });
    });

    describe("POST /auth/change-password", () => {
        test("should change password successfully and revoke existing refresh tokens", async () => {
            const user = {
                id: "user-uuid-1",
                email: "alice@example.com",
                password: hashedPassword,
                role: "user"
            };
            const { accessToken } = generateTokens(user);

            // 1. SELECT user
            mockSql.mockResolvedValueOnce([user]);
            // 2. UPDATE user password
            mockSql.mockResolvedValueOnce([]);
            // 3. DELETE all refresh tokens for user
            mockSql.mockResolvedValueOnce([]);
            // 4. INSERT new refresh token
            mockSql.mockResolvedValueOnce([{ id: "rt-new" }]);

            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                    oldPassword: testPassword,
                    newPassword: "brandNewPassword123"
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Password changed successfully");
            expect(res.body).toHaveProperty("accessToken");
            expect(res.body).toHaveProperty("refreshToken");
        });

        test("should return 400 when old password is incorrect", async () => {
            const user = {
                id: "user-uuid-1",
                email: "alice@example.com",
                password: hashedPassword
            };
            const { accessToken } = generateTokens(user);

            mockSql.mockResolvedValueOnce([user]);

            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                    oldPassword: "incorrectOldPassword",
                    newPassword: "brandNewPassword123"
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe("Incorrect current password");
        });

        test("should return 404 when user attempting to change password does not exist", async () => {
            const user = { id: "nonexistent-user", email: "none@example.com" };
            const { accessToken } = generateTokens(user);

            mockSql.mockResolvedValueOnce([]); // No user

            const res = await request(app)
                .post("/auth/change-password")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                    oldPassword: testPassword,
                    newPassword: "brandNewPassword123"
                });

            expect(res.status).toBe(404);
            expect(res.body.message).toBe("User not found");
        });
    });
});
