import { Router } from "express";
import { handleRedirect, getCacheStatus } from "../controllers/redirect.controller.js";

const router = Router();

// Cache inspection & diagnostic endpoint
router.get("/cache-status/:shortCode", getCacheStatus);

// Short URL redirection
router.get("/:shortCode", handleRedirect);

export default router;
