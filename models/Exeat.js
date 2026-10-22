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
    departureDate: {
        type: Date,
        required: [true, "Departure date is required"],
    },
    returnDate: {
        type: Date,
        required: [true, "Return date is required"],
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

}, {timestamps: true});

exeatSchema.index({ student: 1, createdAt: -1 });
module.exports = mongoose.model("Exeat", exeatSchema);