const jwt = require("jsonwebtoken");
const User = require("../models/user");

function createToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("JWT_SECRET must be configured with at least 32 characters");
    }
    return jwt.sign({ sub: user._id.toString() }, secret, { expiresIn: "1h" });
}

function publicUser(user) {
    return {
        id: user._id,
        fullName: user.fullName,
        matricNumber: user.matriculationNumber,
        department: user.department,
        email: user.email,
        hostel: user.hostel,
        role: user.role,
        createdAt: user.createdAt
    };
}

function setAuthCookie(res, token) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `authToken=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${secure}`
    );
}

exports.logout = (req, res) => {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `authToken=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
    );
    return res.status(200).json({ message: "Logged out successfully" });
};

// Login an existing user
exports.login = async (req, res) => {
    try {
        const { identifier, email, password } = req.body ?? {};
        const loginIdentifier = typeof identifier === "string"
            ? identifier.trim()
            : typeof email === "string"
                ? email.trim()
                : "";
        if (
            typeof loginIdentifier !== "string" ||
            typeof password !== "string" ||
            !loginIdentifier ||
            !password
        ) {
            return res.status(400).json({ message: "Staff email or student matric number and password are required" });
        }

        const isEmail = /^\S+@\S+\.\S+$/.test(loginIdentifier);
        const query = isEmail
            ? { role: { $in: ["admin", "portal", "warden", "security"] }, email: loginIdentifier.toLowerCase() }
            : {
                role: "student",
                matriculationNumber: new RegExp(
                    `^${loginIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                    "i"
                )
            };
        const user = await User.findOne(query).select("+password");
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (user.role === "warden") {
            await User.updateOne(
                { _id: user._id, role: "warden" },
                { $set: { role: "portal" } }
            );
            user.role = "portal";
        }
        const token = createToken(user);
        setAuthCookie(res, token);
        return res.status(200).json({ token, user: publicUser(user) });
    } catch (error) {
        console.error("Login failed:", error.message);
        return res.status(500).json({ message: "Could not log in" });
    }
};

// List registered students for administrators
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: "student" }).sort({ createdAt: -1 });
        return res.status(200).json(users.map(publicUser));
    } catch (error) {
        console.error("Could not load users:", error.message);
        return res.status(500).json({ message: "Unable to fetch users" });
    }
};

// Get the currently logged-in user
exports.getMe = (req, res) => {
    return res.status(200).json({
        success: true,
        user: publicUser(req.user)
    });
};
