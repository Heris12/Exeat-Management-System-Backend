const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, "Fullname is required"],
        unique: true,
        trim: true,
    },
    matriculationNumber: {
        type: String,
        required: function () {
            return this.role === "student";
        },
        unique: true,
        sparse: true,
        trim: true,
    },
    department: {
        type: String,
        required: function () {
            return this.role === "student";
        },
        trim: true,
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, "Please use a valid email address"],
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters long"],
        select: false, // Exclude password from query results by default
    },
    passwordResetToken: {
        type: String,
        select: false,
    },
    passwordResetExpires: {
        type: Date,
        select: false,
    },
    resetPasswordToken: {
        type: String,
        default: null,
        select: false,
    },
    resetPasswordExpires: {
        type: Date,
        default: null,
        select: false,
    },
    hostel: {
        type: String,
        enum: ["Hall 1", "Hall 2", "Hall 3", "Hall 4", "Hall 5", "Hall 6", "Hall 7", "Hall 8"],
        required: function () {
            return this.role === "portal";
        },
    },
    role: {
        type: String,
        enum: ["student", "portal", "admin", "security"],
        default: "student",
    },
}, {timestamps: true});

// Pre-save hook to hash the password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
       return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);