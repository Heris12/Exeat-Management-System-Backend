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

async function authenticate(req, res, next, onUnauthorized) {
    const reject = (status, message) => {
        if (onUnauthorized) {
            return onUnauthorized(status, message);
        }
        return res.status(status).json({ message });
    };

    const authorization = req.headers.authorization || "";
    const bearerToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : "";
    const token = bearerToken || getCookieToken(req.headers.cookie);
    if (!token) {
        return reject(401, "Please log in to continue");
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
            return res.status(500).json({ message: "Server authentication is not configured" });
        }
        const payload = jwt.verify(token, secret);
        const user = await User.findById(payload.sub);
        if (!user) {
            return reject(401, "Your account is no longer available");
        }
        req.user = user;
        return next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return reject(401, "Your session has expired. Please log in again");
        }
        return next(error);
    }
}

function protect(req, res, next) {
    return authenticate(req, res, next);
}

function protectAdminPage(req, res, next) {
    const redirectToLogin = () => res.redirect(302, "/client/index.html?error=admin-access");
    return authenticate(req, res, () => {
        if (req.user.role !== "admin") {
            return redirectToLogin();
        }
        return next();
    }, redirectToLogin);
}

function protectWardenPage(req, res, next) {
    const redirectToLogin = () => res.redirect(302, "/client/index.html?error=admin-access");
    return authenticate(req, res, () => {
        if (req.user.role !== "portal") {
            return redirectToLogin();
        }
        return next();
    }, redirectToLogin);
}

function protectSecurityPage(req, res, next) {
    const redirectToLogin = () => res.redirect(302, "/client/index.html?error=admin-access");
    return authenticate(req, res, () => {
        if (req.user.role !== "security") {
            return redirectToLogin();
        }
        return next();
    }, redirectToLogin);
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Administrator access is required" });
    }
    return next();
}

function requireWarden(req, res, next) {
    if (!req.user || req.user.role !== "portal" || !req.user.hostel) {
        return res.status(403).json({ message: "Hostel warden access is required" });
    }
    return next();
}

function requireSecurity(req, res, next) {
    if (!req.user || req.user.role !== "security") {
        return res.status(403).json({ message: "School security access is required" });
    }
    return next();
}

function requireStudent(req, res, next) {
    if (!req.user || req.user.role !== "student") {
        return res.status(403).json({ message: "Student access is required" });
    }
    return next();
}

module.exports = {
    protect,
    protectAdminPage,
    protectWardenPage,
    protectSecurityPage,
    requireAdmin,
    requireWarden,
    requireSecurity,
    requireStudent
};
