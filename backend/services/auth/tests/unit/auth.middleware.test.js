import { jest } from "@jest/globals";
import { authenticateUser } from "../../middleware/auth.middleware.js";
import { generateTokens } from "../../utils/token.utils.js";

describe("Auth Middleware (authenticateUser)", () => {
    const mockUser = {
        id: "user-uuid-12345",
        email: "user@example.com",
        role: "user"
    };

    test("should extract token from Bearer Authorization header, set req.user, and call next()", () => {
        const { accessToken } = generateTokens(mockUser);
        const req = {
            headers: {
                authorization: `Bearer ${accessToken}`
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        authenticateUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeDefined();
        expect(req.user.id).toBe(mockUser.id);
        expect(req.user.email).toBe(mockUser.email);
        expect(res.status).not.toHaveBeenCalled();
    });

    test("should fallback to req.cookies.accessToken if Bearer header is missing", () => {
        const { accessToken } = generateTokens(mockUser);
        const req = {
            headers: {},
            cookies: {
                accessToken
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        authenticateUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user.id).toBe(mockUser.id);
    });

    test("should return 401 when no token is provided in header or cookies", () => {
        const req = { headers: {}, cookies: {} };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        authenticateUser(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Unauthorized: No token provided"
            })
        );
    });

    test("should return 401 when token is invalid or expired", () => {
        const req = {
            headers: {
                authorization: "Bearer invalid.token.value"
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        authenticateUser(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Unauthorized: Invalid or expired token"
            })
        );
    });
});
