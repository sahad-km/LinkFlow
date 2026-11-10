import { z } from "zod";

export const registerSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name cannot exceed 100 characters"),
    email: z.string().trim().email("Please provide a valid email address").toLowerCase(),
    password: z.string().min(6, "Password must be at least 6 characters").max(100, "Password cannot exceed 100 characters")
});

export const loginSchema = z.object({
    email: z.string().trim().email("Please provide a valid email address").toLowerCase(),
    password: z.string().min(1, "Password is required")
});

export const changePasswordSchema = z.object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters").max(100, "Password cannot exceed 100 characters")
});

export const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body);
        next();
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                message: "Validation failed",
                errors: err.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message
                }))
            });
        }
        next(err);
    }
};
