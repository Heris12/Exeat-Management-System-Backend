const mongoose = require("mongoose");
const exeatSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", 
        required: true
    },
    exeatType: {
        type: String,
        enum: ["day", "weekend", "long"],
        required: [true, "Exeat type is required"],
    },
    destination: {
        type: String,
        required: [true, "Destination is required"],
        trim: true,
    },
    hostel: {
        type: String,
        enum: ["Hall 1", "Hall 2", "Hall 3", "Hall 4", "Hall 5", "Hall 6", "Hall 7", "Hall 8"],
        required: [true, "Student hostel is required"],
    },
    departureDate: {
        type: Date,
        required: [true, "Departure date is required"],
    },
    departureTime: {
        type: String,
        default: "08:00",
        match: /^([01]\d|2[0-3]):[0-5]\d$/
    },
    returnDate: {
        type: Date,
        required: [true, "Return date is required"],
    },
    returnTime: {
        type: String,
        default: "18:00",
        match: /^([01]\d|2[0-3]):[0-5]\d$/
    },
    reason: {
        type: String,
        required: [true, "Reason is required"],
        trim: true,
    },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
    },
    adminComment: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    departureConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    departureConfirmedAt: {
        type: Date,
        default: null
    },
    returnConfirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    returnConfirmedAt: {
        type: Date,
        default: null
    },
    exeatNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    verificationTokenHash: {
        type: String,
        unique: true,
        sparse: true,
        select: false
    },
    slipDownloadTokenHash: {
        type: String,
        unique: true,
        sparse: true,
        select: false
    },
    slipGeneratedAt: Date,
    slipVersion: {
        type: Number,
        default: 0
    },
    slipApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    slipRevokedAt: Date,
    slipPdf: {
        type: Buffer,
        select: false
    },
    slipEmailSentAt: Date,
    slipEmailError: {
        type: String,
        select: false
    },

}, {timestamps: true});

exeatSchema.index({ student: 1, createdAt: -1 });
exeatSchema.index({ student: 1, status: 1, slipGeneratedAt: -1 });
module.exports = mongoose.model("Exeat", exeatSchema);