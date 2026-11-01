const mongoose = require("mongoose");
const crypto = require("crypto");
const Exeat = require("../models/Exeat");
const { getSlipStatus, issueApprovedSlip, SLIP_VERSION } = require("../services/exeatSlipService");

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Get all exeats
exports.getAllExeats = async (req, res) => {
    try {
        const query = req.user.role === "admin" ? {} : { student: req.user._id };
        const exeats = await Exeat.find(query)
            .populate("student", "fullName email matriculationNumber department")
            .populate("reviewedBy", "fullName email");
        res.status(200).json(exeats.map((exeat) => ({
            ...exeat.toObject(),
            ...(exeat.exeatNumber ? { slipStatus: getSlipStatus(exeat) } : {})
        })));
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
        if (!req.user.hostel) {
            return res.status(403).json({ message: "Your account does not have a hostel assigned. Contact the main administrator." });
        }
        if (!/^Hall [1-8]$/.test(req.user.hostel)) {
            return res.status(400).json({ message: "Your account does not have a valid hostel hall assigned. Contact the main administrator." });
        }
        const departure = new Date(departureDate);
        const returnD = new Date(returnDate);
        const departureTime = req.body.departureTime || "08:00";
        const returnTime = req.body.returnTime || "18:00";
        if (Number.isNaN(departure.getTime()) || Number.isNaN(returnD.getTime())) {
            return res.status(400).json({ message: "Invalid date format" });
        }
        if (!timePattern.test(departureTime) || !timePattern.test(returnTime)) {
            return res.status(400).json({ message: "Departure and return times must use HH:MM format" });
        }
        if (departure >= returnD) {
            return res.status(400).json({ message: "Return date must be after departure date" });
        }
        const exeat = await Exeat.create({
            student: req.user._id,
            exeatType,
            destination: destination.trim(),
            hostel: req.user.hostel,
            departureDate: departure,
            departureTime,
            returnDate: returnD,
            returnTime,
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
        if (!exeat || !exeat.student) {
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

exports.downloadExeatSlip = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid request ID." });
        }

        const exeat = await Exeat.findOne({
            _id: req.params.id,
            student: req.user._id
        }).select("+slipPdf");
        if (!exeat || !exeat.student) {
            return res.status(404).json({ message: "Exeat not found" });
        }
        if (exeat.status !== "approved" || exeat.slipRevokedAt) {
            return res.status(409).json({ message: "This exeat permission slip is not currently valid" });
        }
        if (!exeat.slipPdf?.length || exeat.slipVersion !== SLIP_VERSION) {
            await issueApprovedSlip(exeat);
            await exeat.populate("student", "fullName email");
            const generatedSlip = await Exeat.findOne({
                _id: exeat._id,
                student: req.user._id,
                status: "approved",
                slipRevokedAt: { $exists: false }
            }).select("+slipPdf");
            if (!generatedSlip?.exeatNumber || !generatedSlip.slipPdf?.length) {
                return res.status(503).json({
                    message: "The permission slip could not be generated. Please try again or contact the administrator."
                });
            }
            return sendSlipPdf(res, generatedSlip, req.query.inline === "true");
        }
        return sendSlipPdf(res, exeat, req.query.inline === "true");
    } catch (error) {
        console.error("Could not download exeat slip:", error);
        return res.status(503).json({
            message: "The permission slip could not be generated. Please try again or contact the administrator."
        });
    }
};

exports.downloadExeatSlipByToken = async (req, res) => {
    const token = req.query.token;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({ message: "A valid download link is required" });
    }

    try {
        const slipDownloadTokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const exeat = await Exeat.findOne({
            slipDownloadTokenHash,
            status: "approved",
            slipRevokedAt: null
        }).select("+slipPdf");
        if (!exeat?.slipPdf?.length || !exeat.exeatNumber) {
            return res.status(404).json({ message: "This exeat download link is invalid or no longer available" });
        }

        return sendSlipPdf(res, exeat, false);
    } catch (error) {
        console.error("Could not download exeat slip from email link:", error);
        return res.status(500).json({ message: "Unable to download this exeat slip right now" });
    }
};

function sendSlipPdf(res, exeat, inline) {
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${exeat.exeatNumber}.pdf"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        });
        return res.send(exeat.slipPdf);
}

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
            if (status === "approved" && exeat.status === "approved") {
                const permissionSlip = await issueApprovedSlip(exeat);
                return res.status(200).json({
                    message: permissionSlip.emailSent
                        ? "This exeat was already approved and its permission slip is available"
                        : "This exeat was already approved; email delivery is still unavailable",
                    permissionSlip
                });
            }
            return res.status(409).json({ message: "This exeat request has already been reviewed" });
        }
        exeat.status = status;
        exeat.adminComment = adminComment ? adminComment.trim() : "";
        exeat.reviewedBy = req.user._id;
        exeat.reviewedAt = new Date();
        await exeat.save();
        if (status === "approved") {
            const permissionSlip = await issueApprovedSlip(exeat);
            return res.status(200).json({
                message: permissionSlip.emailSent
                    ? "Exeat request approved and permission slip emailed successfully"
                    : "Exeat request approved and permission slip generated, but email delivery failed",
                permissionSlip
            });
        }
        return res.status(200).json({ message: `Exeat request ${status} successfully`, exeat });
    } catch (error) {
        console.error("Could not update exeat request:", error.message);
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