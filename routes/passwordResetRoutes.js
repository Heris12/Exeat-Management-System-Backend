const express = require("express");
const { rateLimit } = require("express-rate-limit");
const {
    forgotPassword,
    resetPassword
} = require("../controllers/passwordResetController");

const router = express.Router();
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many password reset requests. Please try again later."
    }
});

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
