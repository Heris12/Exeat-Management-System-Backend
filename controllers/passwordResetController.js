const crypto = require("crypto");
const emailjs = require("@emailjs/nodejs");
const User = require("../models/user");

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_REQUEST_MESSAGE = "If an account exists for that email, a password reset link will be sent.";

exports.forgotPassword = async (req, res) => {
    const email = typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
    }

    const serviceId = process.env.EMAILJS_SERVICE_ID || process.env.SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID || process.env.TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY || process.env.PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY || process.env.PRIVATE_KEY;
    const { CLIENT_URL } = process.env;
    const clientUrl = CLIENT_URL?.split(",")[0]?.trim();
    if (!serviceId || !templateId || !publicKey || !privateKey || !clientUrl) {
        console.error("Password reset email is not configured. Check EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, and CLIENT_URL.");
        return res.status(503).json({ message: "Password reset email is temporarily unavailable. Please try again later." });
    }

    let resetUrl;
    try {
        const clientOrigin = new URL(clientUrl);
        if (!["http:", "https:"].includes(clientOrigin.protocol)) {
            throw new Error("CLIENT_URL must use HTTP or HTTPS");
        }
        resetUrl = new URL("/reset-password.html", clientOrigin);
    } catch (error) {
        console.error("Password reset email has an invalid CLIENT_URL:", error.message);
        return res.status(503).json({ message: "Password reset email is temporarily unavailable. Please try again later." });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({ message: RESET_REQUEST_MESSAGE });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save();

        resetUrl.searchParams.set("token", token);
        try {
            await emailjs.send(serviceId, templateId, {
                to_email: user.email,
                email: user.email,
                user_name: user.fullName || "Student",
                to_name: user.fullName || "Student",
                name: user.fullName,
                reset_link: resetUrl.toString(),
                expires_in_minutes: RESET_TOKEN_TTL_MS / 60000
            }, {
                publicKey,
                privateKey
            });
        } catch (error) {
            console.error("Could not send password reset email:", {
                status: error?.status,
                message: error?.message,
                responseText: error?.text
            });
            try {
                await User.updateOne(
                    { _id: user._id, passwordResetToken: hashedToken },
                    { $unset: { passwordResetToken: "", passwordResetExpires: "" } }
                );
            } catch (cleanupError) {
                console.error("Could not invalidate an unsent password reset token:", cleanupError.message);
            }
            return res.status(200).json({ message: RESET_REQUEST_MESSAGE });
        }

        return res.status(200).json({ message: RESET_REQUEST_MESSAGE });
    } catch (error) {
        console.error("Password reset request failed:", error.message);
        return res.status(500).json({ message: "Could not process the password reset request" });
    }
};

exports.resetPassword = async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || !token || typeof password !== "string") {
        return res.status(400).json({ message: "A valid reset token and new password are required" });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        }).select("+password +passwordResetToken +passwordResetExpires");
        if (!user) {
            return res.status(400).json({ message: "This password reset link is invalid or has expired" });
        }

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        return res.status(200).json({ message: "Your password has been updated. Please log in." });
    } catch (error) {
        console.error("Password reset failed:", error.message);
        return res.status(500).json({ message: "Could not reset the password" });
    }
};
