import { jest } from "@jest/globals";
import {
    validate,
    registerSchema,
    loginSchema,
    changePasswordSchema
} from "../../middleware/validate.middleware.js";

describe("Auth Validation Middleware & Schemas", () => {
    describe("registerSchema", () => {
        test("should validate valid registration input", () => {
            const input = {
                name: "John Doe",
                email: "John.Doe@Example.COM",
                password: "strongPassword123"
            };

            const parsed = registerSchema.parse(input);
            expect(parsed.name).toBe("John Doe");
            expect(parsed.email).toBe("john.doe@example.com"); // lowercased
            expect(parsed.password).toBe("strongPassword123");
        });

        test("should reject short name (< 2 characters)", () => {
            expect(() => registerSchema.parse({
                name: "J",
                email: "valid@example.com",
                password: "password123"
            })).toThrow();
        });

        test("should reject invalid email format", () => {
            expect(() => registerSchema.parse({
                name: "John Doe",
                email: "not-an-email",
                password: "password123"
            })).toThrow();
        });

        test("should reject short password (< 6 characters)", () => {
            expect(() => registerSchema.parse({
                name: "John Doe",
                email: "valid@example.com",
                password: "123"
            })).toThrow();
        });
    });

    describe("loginSchema", () => {
        test("should validate valid login input", () => {
            const parsed = loginSchema.parse({
                email: "USER@EXAMPLE.COM",
                password: "password123"
            });
            expect(parsed.email).toBe("user@example.com");
            expect(parsed.password).toBe("password123");
        });

        test("should reject missing password", () => {
            expect(() => loginSchema.parse({
                email: "user@example.com",
                password: ""
            })).toThrow();
        });
    });

    describe("changePasswordSchema", () => {
        test("should validate change password input", () => {
            const parsed = changePasswordSchema.parse({
                oldPassword: "oldSecretPassword",
                newPassword: "newSecretPassword123"
            });
            expect(parsed.oldPassword).toBe("oldSecretPassword");
            expect(parsed.newPassword).toBe("newSecretPassword123");
        });

        test("should reject new password shorter than 6 characters", () => {
            expect(() => changePasswordSchema.parse({
                oldPassword: "oldSecretPassword",
                newPassword: "short"
            })).toThrow();
        });
    });

    describe("validate() middleware execution", () => {
        test("should call next() and attach sanitized body on valid input", () => {
            const middleware = validate(loginSchema);
            const req = { body: { email: " TEST@EXAMPLE.COM ", password: "secret" } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();

            middleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(req.body.email).toBe("test@example.com");
            expect(res.status).not.toHaveBeenCalled();
        });

        test("should return 400 with formatted error list on validation error", () => {
            const middleware = validate(loginSchema);
            const req = { body: { email: "invalid-email", password: "" } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: "Validation failed",
                    errors: expect.any(Array)
                })
            );
        });
    });
});
