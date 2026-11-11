import { describe, test, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import request from "supertest";
import app from "../../app.js";
import { sql, connectDB, closeDB } from "../../config/db.js";

describe("Auth Service Integration Tests (Real PostgreSQL)", () => {
    const testEmail = "testuser@integration-test.com";
    const testPassword = "OriginalPassword123";

    beforeAll(async () => {
        await connectDB();
    });

    afterAll(async () => {
        // Clean up any remaining test users
        await sql`DELETE FROM users WHERE email LIKE '%@integration-test.com'`;
        await closeDB();
    });

    afterEach(async () => {
        await sql`DELETE FROM users WHERE email LIKE '%@integration-test.com'`;
    });

    test("should register a user, hash password, and persist refresh token in PostgreSQL", async () => {
        const res = await request(app)
            .post("/auth/register")
            .send({
                name: "Integration User",
                email: testEmail,
                password: testPassword
            });

        expect(res.status).toBe(201);
        expect(res.body.success !== false).toBe(true);

        const { user, accessToken, refreshToken } = res.body;
        expect(user).toBeDefined();
        expect(user.email).toBe(testEmail);

        // 1. Verify User Record in PostgreSQL
        const [dbUser] = await sql`
            SELECT id, name, email, password, role FROM users WHERE id = ${user.id}
        `;
        expect(dbUser).toBeDefined();
        expect(dbUser.email).toBe(testEmail);
        expect(dbUser.password).not.toBe(testPassword);
        expect(dbUser.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash signature

        // 2. Verify Refresh Token Record in PostgreSQL
        const [dbToken] = await sql`
            SELECT * FROM refresh_tokens WHERE token = ${refreshToken}
        `;
        expect(dbToken).toBeDefined();
        expect(dbToken.user_id).toBe(user.id);
        expect(new Date(dbToken.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    test("should login, verify password from PostgreSQL, and return valid tokens", async () => {
        // First register
        await request(app)
            .post("/auth/register")
            .send({
                name: "Integration User",
                email: testEmail,
                password: testPassword
            });

        // Now login
        const res = await request(app)
            .post("/auth/login")
            .send({
                email: testEmail,
                password: testPassword
            });

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe(testEmail);
        expect(res.body).toHaveProperty("accessToken");
        expect(res.body).toHaveProperty("refreshToken");
    });

    test("should retrieve authenticated user profile via GET /auth/me", async () => {
        const registerRes = await request(app)
            .post("/auth/register")
            .send({
                name: "Profile User",
                email: testEmail,
                password: testPassword
            });

        const { accessToken } = registerRes.body;

        const profileRes = await request(app)
            .get("/auth/me")
            .set("Authorization", `Bearer ${accessToken}`);

        expect(profileRes.status).toBe(200);
        expect(profileRes.body.user).toBeDefined();
        expect(profileRes.body.user.email).toBe(testEmail);
        expect(profileRes.body.user.name).toBe("Profile User");
        expect(profileRes.body.user).not.toHaveProperty("password");
    });

    test("should perform atomic refresh token rotation in PostgreSQL", async () => {
        const registerRes = await request(app)
            .post("/auth/register")
            .send({
                name: "Rotation User",
                email: testEmail,
                password: testPassword
            });

        const { refreshToken: oldRefreshToken, user } = registerRes.body;

        // Verify initial token exists in DB
        const [initialTokenRow] = await sql`
            SELECT id FROM refresh_tokens WHERE token = ${oldRefreshToken}
        `;
        expect(initialTokenRow).toBeDefined();

        // Perform rotation
        const refreshRes = await request(app)
            .post("/auth/refresh")
            .send({ refreshToken: oldRefreshToken });

        expect(refreshRes.status).toBe(200);
        const { refreshToken: newRefreshToken } = refreshRes.body;
        expect(newRefreshToken).not.toBe(oldRefreshToken);

        // Verify OLD token was deleted from DB
        const [oldTokenCheck] = await sql`
            SELECT id FROM refresh_tokens WHERE token = ${oldRefreshToken}
        `;
        expect(oldTokenCheck).toBeUndefined();

        // Verify NEW token was inserted into DB
        const [newTokenCheck] = await sql`
            SELECT id, user_id FROM refresh_tokens WHERE token = ${newRefreshToken}
        `;
        expect(newTokenCheck).toBeDefined();
        expect(newTokenCheck.user_id).toBe(user.id);

        // Attempting to reuse the revoked old token must be rejected
        const reuseRes = await request(app)
            .post("/auth/refresh")
            .send({ refreshToken: oldRefreshToken });

        expect(reuseRes.status).toBe(401);
        expect(reuseRes.body.message).toMatch(/revoked or expired/i);
    });

    test("should change password, revoke all refresh tokens, and accept only new credentials", async () => {
        const registerRes = await request(app)
            .post("/auth/register")
            .send({
                name: "Password Changer",
                email: testEmail,
                password: testPassword
            });

        const { accessToken, refreshToken: oldRefreshToken } = registerRes.body;
        const newPassword = "NewStrongPassword456";

        const changeRes = await request(app)
            .post("/auth/change-password")
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                oldPassword: testPassword,
                newPassword: newPassword
            });

        expect(changeRes.status).toBe(200);
        expect(changeRes.body.message).toBe("Password changed successfully");

        // Old refresh token must be invalidated
        const [revokedToken] = await sql`
            SELECT id FROM refresh_tokens WHERE token = ${oldRefreshToken}
        `;
        expect(revokedToken).toBeUndefined();

        // Login with old password must fail
        const failLogin = await request(app)
            .post("/auth/login")
            .send({ email: testEmail, password: testPassword });
        expect(failLogin.status).toBe(401);

        // Login with new password must succeed
        const successLogin = await request(app)
            .post("/auth/login")
            .send({ email: testEmail, password: newPassword });
        expect(successLogin.status).toBe(200);
    });

    test("should logout and delete refresh token from PostgreSQL", async () => {
        const registerRes = await request(app)
            .post("/auth/register")
            .send({
                name: "Logout User",
                email: testEmail,
                password: testPassword
            });

        const { refreshToken } = registerRes.body;

        const logoutRes = await request(app)
            .post("/auth/logout")
            .send({ refreshToken });

        expect(logoutRes.status).toBe(200);

        // Token should be gone from PostgreSQL
        const [tokenRow] = await sql`
            SELECT id FROM refresh_tokens WHERE token = ${refreshToken}
        `;
        expect(tokenRow).toBeUndefined();
    });

    test("should reject duplicate email registration via PostgreSQL unique constraint", async () => {
        await request(app)
            .post("/auth/register")
            .send({
                name: "First User",
                email: testEmail,
                password: testPassword
            });

        const duplicateRes = await request(app)
            .post("/auth/register")
            .send({
                name: "Second User",
                email: testEmail,
                password: "anotherPassword123"
            });

        expect(duplicateRes.status).toBe(409);
        expect(duplicateRes.body.message).toMatch(/already exists/i);
    });

    test("should cascade delete refresh tokens when user is deleted from PostgreSQL", async () => {
        const registerRes = await request(app)
            .post("/auth/register")
            .send({
                name: "Cascade User",
                email: testEmail,
                password: testPassword
            });

        const { user, refreshToken } = registerRes.body;

        // Delete parent user record directly in SQL
        await sql`DELETE FROM users WHERE id = ${user.id}`;

        // Verify child refresh_tokens row was deleted via ON DELETE CASCADE
        const [tokenRow] = await sql`
            SELECT id FROM refresh_tokens WHERE token = ${refreshToken}
        `;
        expect(tokenRow).toBeUndefined();
    });
});
