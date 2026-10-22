const jwt = require("jsonwebtoken");
const User = require("../models/user");

function getCookieToken(cookieHeader) {
    if (!cookieHeader) return "";

    const tokenCookie = cookieHeader
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith("authToken="));
    if (!tokenCookie) return "";

    try {
        return decodeURIComponent(tokenCookie.slice("authToken=".length));
    } catch {
        return "";
    }
}

async function protect(req, res, next) {
    const authorization = req.headers.authorization || "";
    const bearerToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : "";
    const token = bearerToken || getCookieToken(req.headers.cookie);
    if (!token) {
        return res.status(401).json({ message: "Please log in to continue" });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
            return res.status(500).json({ message: "Server authentication is not configured" });
        }
        const payload = jwt.verify(token, secret);
        const user = await User.findById(payload.sub);
        if (!user) {
            return res.status(401).json({ message: "Your account is no longer available" });
        }
        req.user = user;
        return next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(401).json({ message: "Your session has expired. Please log in again" });
        }
        return next(error);
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Administrator access is required" });
    }
    return next();
}

function requireStudent(req, res, next) {
    if (!req.user || req.user.role !== "student") {
        return res.status(403).json({ message: "Student access is required" });
    }
    return next();
}

module.exports = { protect, requireAdmin, requireStudent };
