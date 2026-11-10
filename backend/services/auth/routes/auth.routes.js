import { Router } from "express";
import {
    register,
    login,
    refreshToken,
    logout,
    getMe,
    changePassword
} from "../controllers/auth.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import {
    validate,
    registerSchema,
    loginSchema,
    changePasswordSchema
} from "../middleware/validate.middleware.js";

const router = Router();

// Public routes
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

// Protected routes
router.get("/me", authenticateUser, getMe);
router.post("/change-password", authenticateUser, validate(changePasswordSchema), changePassword);

export default router;
