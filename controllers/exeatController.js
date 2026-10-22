const mongoose = require("mongoose");
const Exeat = require("../models/Exeat");

// Get all exeats
exports.getAllExeats = async (req, res) => {
    try {
        const query = req.user.role === "admin" ? {} : { student: req.user._id };
        const exeats = await Exeat.find(query)
            .populate("student", "fullName email matriculationNumber department")
            .populate("reviewedBy", "fullName email");
        res.status(200).json(exeats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllExeat = exports.getAllExeats;

// Create a new exeat request
exports.createExeat = async (req, res) => {
    try {
        const { exeatType, destination, departureDate, returnDate, reason } = req.body;
        if (!exeatType || !destination || !departureDate || !returnDate || !reason) {
            return res.status(400).json({ message: "All fields are required" });
        }
        const departure = new Date(departureDate);
        const returnD = new Date(returnDate);
        if (Number.isNaN(departure.getTime()) || Number.isNaN(returnD.getTime())) {
            return res.status(400).json({ message: "Invalid date format" });
        }
        if (departure >= returnD) {
            return res.status(400).json({ message: "Return date must be after departure date" });
        }
        const exeat = await Exeat.create({
            student: req.user._id,
            exeatType,
            destination: destination.trim(),
            departureDate: departure,
            returnDate: returnD,
            reason: reason.trim()
        });
        return res.status(201).json({ message: "Exeat request submitted successfully", exeat });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: error.message });
        return res.status(500).json({ message: "An error occurred while submitting the exeat request" });
    }
};

// Get exeat by ID
exports.getExeatById = async (req, res) => {
    try {
        const exeat = await Exeat.findById(req.params.id)
            .populate("student", "fullName email matriculationNumber department")
            .populate("reviewedBy", "fullName email");
        if (!exeat) {
            return res.status(404).json({ message: "Exeat not found" });
        }
        if (req.user.role !== "admin" && String(exeat.student._id) !== String(req.user._id)) {
            return res.status(403).json({ message: "You are not allowed to view this exeat request" });
        }
        res.status(200).json(exeat);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update exeat status (approve/reject)
exports.updateExeatStatus = async (req, res) => {
    try {
        const { status, adminComment } = req.body;
        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status value" });
        }
        const exeat = await Exeat.findById(req.params.id);
        if (!exeat) {
            return res.status(404).json({ message: "Exeat not found" });
        }
        if (exeat.status !== "pending") {
            return res.status(409).json({ message: "This exeat request has already been reviewed" });
        }
        exeat.status = status;
        exeat.adminComment = adminComment ? adminComment.trim() : "";
        exeat.reviewedBy = req.user._id;
        exeat.reviewedAt = new Date();
        await exeat.save();
        return res.status(200).json({ message: `Exeat request ${status} successfully`, exeat });
    } catch (error) {
        return res.status(500).json({ message: "An error occurred while updating the exeat request" });
    }
};

// Delete a specific exeat request (only if it's pending)
exports.deleteExeat = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid request ID." });

        const exeat = await Exeat.findOne({ _id: req.params.id, student: req.user._id });
        if (!exeat) {
            return res.status(404).json({ message: "Request not found" });
        }
        if (exeat.status !== "pending") {
            return res.status(400).json({ message: "Only pending exeat requests can be deleted" });
        }
        await exeat.deleteOne();
        return res.status(200).json({ message: "Exeat request deleted successfully" });
    } catch (error) {
        return res.status(500).json({ message: "An error occurred while deleting the exeat request" });
    }
};