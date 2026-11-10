import { z } from "zod";

export const createUrlSchema = z.object({
    longUrl: z.string().trim().url("Please provide a valid URL (including http:// or https://)").max(2048, "URL exceeds maximum length of 2048 characters"),
    customCode: z.string().trim().min(3, "Custom alias must be at least 3 characters").max(30, "Custom alias cannot exceed 30 characters").regex(/^[a-zA-Z0-9_-]+$/, "Custom alias can only contain letters, numbers, hyphens, and underscores").optional(),
    title: z.string().trim().max(255, "Title cannot exceed 255 characters").optional()
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
