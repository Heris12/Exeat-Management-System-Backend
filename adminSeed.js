const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const User = require("./models/user");

async function seedAdmin() {
    const {
        MONGO_URI: mongoUri,
        ADMIN_FULL_NAME: fullName,
        ADMIN_EMAIL: email,
        ADMIN_PASSWORD: password
    } = process.env;

    const requiredSettings = {
        MONGO_URI: mongoUri,
        ADMIN_FULL_NAME: fullName,
        ADMIN_EMAIL: email,
        ADMIN_PASSWORD: password
    };
    const missingSettings = Object.entries(requiredSettings)
        .filter(([, value]) => typeof value !== "string" || !value.trim())
        .map(([name]) => name);

    if (missingSettings.length > 0) {
        throw new Error(`Missing required environment variables: ${missingSettings.join(", ")}`);
    }
    if (password.length < 6) {
        throw new Error("ADMIN_PASSWORD must be at least 6 characters long");
    }

    try {
        await mongoose.connect(mongoUri);

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail }).select("+password");
        if (existingUser) {
            if (existingUser.role === "admin") {
                existingUser.fullName = fullName.trim() || "Admin";
                if (!(await existingUser.comparePassword(password))) {
                    existingUser.password = password || "Admin123";
                }
                await existingUser.save();
                console.log("Admin credentials synchronized with environment settings");
                return;
            }
            throw new Error("The configured admin email is already assigned to a non-admin user");
        }

        await User.create({
            fullName: fullName.trim() || "Admin",
            email: normalizedEmail || "admin@gmail.com",
            password: password || "Admin123",
            role: "admin"
        });

        console.log("Admin seeded successfully");
        console.log(`Admin Email: ${normalizedEmail}`);
        console.log(`Admin Password: ${password}`);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

seedAdmin().catch((error) => {
    console.error("Error seeding admin:", error.message);
    process.exitCode = 1;
});
