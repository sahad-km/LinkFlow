import { Router } from "express";
import {
    createUrl,
    getUrlDetails,
    getMyUrls,
    deleteUrl
} from "../controllers/url.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";
import { validate, createUrlSchema } from "../middleware/validate.middleware.js";

const router = Router();

// Create new shortened URL (supports anonymous or authenticated users)
router.post("/create", optionalAuth, validate(createUrlSchema), createUrl);

// Get all URLs belonging to the authenticated user
router.get("/my-urls", requireAuth, getMyUrls);

// Get details for a specific short code
router.get("/:shortCode", getUrlDetails);

// Delete a short URL
router.delete("/:shortCode", optionalAuth, deleteUrl);

export default router;
