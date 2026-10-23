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

// Register a new user
exports.register = async (req, res) => {
    try {
        const {
            fullName,
            matricNumber,
            matriculationNumber,
            department,
            email,
            password
        } = req.body ?? {};
        const studentNumber = matricNumber ?? matriculationNumber;
        if (![fullName, studentNumber, department, email, password].every(
            (value) => typeof value === "string" && value.trim()
        )) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user = await User.create({
            fullName: fullName.trim(),
            matriculationNumber: studentNumber.trim(),
            department: department.trim(),
            email: email.trim().toLowerCase(),
            password
        });
        return res.status(201).json({
            message: "Account created successfully",
            user: publicUser(user)
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
            const messages = {
                email: "An account with this email already exists",
                matriculationNumber: "This matriculation number is already registered",
                fullName: "An account with this full name already exists"
            };
            const message = messages[field] || "An account with these details already exists";
            return res.status(409).json({ message });
        }
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        console.error("Registration failed:", error.message);
        return res.status(500).json({ message: "Could not create the account" });
    }
};

// Login an existing user
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body ?? {};
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: "Invalid email or password" });
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
