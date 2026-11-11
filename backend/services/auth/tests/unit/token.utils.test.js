import {
    generateTokens,
    verifyAccessToken,
    verifyRefreshToken,
    COOKIE_OPTIONS
} from "../../utils/token.utils.js";
import jwt from "jsonwebtoken";

describe("Auth Token Utilities", () => {
    const mockUser = {
        id: "a3b1c2d4-1111-2222-3333-444455556666",
        email: "testuser@example.com",
        role: "user"
    };

    describe("generateTokens()", () => {
        test("should generate both accessToken and refreshToken with proper payload", () => {
            const tokens = generateTokens(mockUser);

            expect(tokens).toHaveProperty("accessToken");
            expect(tokens).toHaveProperty("refreshToken");
            expect(typeof tokens.accessToken).toBe("string");
            expect(typeof tokens.refreshToken).toBe("string");

            // Verify payload contained inside token
            const decodedAccess = jwt.decode(tokens.accessToken);
            expect(decodedAccess.id).toBe(mockUser.id);
            expect(decodedAccess.email).toBe(mockUser.email);
            expect(decodedAccess.role).toBe(mockUser.role);
            expect(decodedAccess).toHaveProperty("jti");

            const decodedRefresh = jwt.decode(tokens.refreshToken);
            expect(decodedRefresh.id).toBe(mockUser.id);
            expect(decodedRefresh.email).toBe(mockUser.email);
            expect(decodedRefresh).toHaveProperty("jti");
        });

        test("should default role to 'user' if not provided in user object", () => {
            const userWithoutRole = { id: "user-123", email: "norole@example.com" };
            const { accessToken } = generateTokens(userWithoutRole);
            const decoded = jwt.decode(accessToken);
            expect(decoded.role).toBe("user");
        });

        test("should generate unique jti for consecutive calls in the same millisecond", () => {
            const tokenA = generateTokens(mockUser);
            const tokenB = generateTokens(mockUser);

            const decodedA = jwt.decode(tokenA.accessToken);
            const decodedB = jwt.decode(tokenB.accessToken);

            expect(decodedA.jti).not.toBe(decodedB.jti);
        });
    });

    describe("verifyAccessToken()", () => {
        test("should successfully verify a valid access token", () => {
            const { accessToken } = generateTokens(mockUser);
            const result = verifyAccessToken(accessToken);

            expect(result.valid).toBe(true);
            expect(result.payload.id).toBe(mockUser.id);
            expect(result.payload.email).toBe(mockUser.email);
        });

        test("should return valid: false for an expired access token", () => {
            const expiredToken = jwt.sign(
                { id: mockUser.id },
                process.env.JWT_ACCESS_SECRET || "linkflow_access_secret_key_2026",
                { expiresIn: "0s" }
            );

            const result = verifyAccessToken(expiredToken);
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/jwt expired/i);
        });

        test("should return valid: false for a token signed with the wrong secret", () => {
            const wrongSecretToken = jwt.sign(
                { id: mockUser.id },
                "wrong_secret_key_12345",
                { expiresIn: "15m" }
            );

            const result = verifyAccessToken(wrongSecretToken);
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/invalid signature/i);
        });

        test("should return valid: false for malformed token string", () => {
            const result = verifyAccessToken("not.a.valid.jwt");
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe("verifyRefreshToken()", () => {
        test("should successfully verify a valid refresh token", () => {
            const { refreshToken } = generateTokens(mockUser);
            const result = verifyRefreshToken(refreshToken);

            expect(result.valid).toBe(true);
            expect(result.payload.id).toBe(mockUser.id);
        });

        test("should return valid: false if an access token is passed to verifyRefreshToken", () => {
            // Because access and refresh tokens use distinct secrets
            const { accessToken } = generateTokens(mockUser);
            const result = verifyRefreshToken(accessToken);

            expect(result.valid).toBe(false);
        });
    });

    describe("COOKIE_OPTIONS", () => {
        test("should enforce secure httpOnly settings", () => {
            expect(COOKIE_OPTIONS.httpOnly).toBe(true);
            expect(COOKIE_OPTIONS.path).toBe("/");
            expect(COOKIE_OPTIONS.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
        });
    });
});
