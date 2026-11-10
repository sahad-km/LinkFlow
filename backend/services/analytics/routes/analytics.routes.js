import { Router } from "express";
import { getUrlAnalytics, getGlobalSummary } from "../controllers/analytics.controller.js";

const router = Router();

// Global metrics summary
router.get("/summary", getGlobalSummary);

// Granular URL analytics by shortCode
router.get("/:shortCode", getUrlAnalytics);

export default router;
