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
        if (!req.user.hostel) {
            return res.status(403).json({ message: "Your account does not have a hostel assigned. Contact the main administrator." });
        }
        if (!/^Hall [1-8]$/.test(req.user.hostel)) {
            return res.status(400).json({ message: "Your account does not have a valid hostel hall assigned. Contact the main administrator." });
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
            hostel: req.user.hostel,
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

        const exeat = await Exeat.findById(req.params.id)
            .populate("student", "fullName matriculationNumber department")
            .populate("reviewedBy", "fullName");
        if (!exeat || !exeat.student) {
            return res.status(404).json({ message: "Exeat not found" });
        }
        if (String(exeat.student._id) !== String(req.user._id)) {
            return res.status(403).json({ message: "You are not allowed to download this exeat slip" });
        }
        if (exeat.status !== "approved") {
            return res.status(409).json({ message: "An exeat slip is available only after approval" });
        }

        const PDFDocument = require("pdfkit");
        const document = new PDFDocument({ size: "A4", margin: 56 });
        const filename = `exeat-slip-${exeat._id}.pdf`;
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store"
        });
        document.on("error", (error) => {
            console.error("Could not generate exeat slip:", error);
            if (res.headersSent) {
                res.destroy();
            } else {
                res.status(500).json({ message: "An error occurred while generating the exeat slip" });
            }
        });
        document.pipe(res);

        const formattedDate = (date) => new Date(date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "UTC"
        });
        const writeField = (label, value) => {
            document.font("Helvetica-Bold").fillColor("#1f2937").text(`${label}: `, { continued: true });
            document.font("Helvetica").fillColor("#374151").text(String(value || "—"));
            document.moveDown(0.7);
        };

        document.fillColor("#0057b8").font("Helvetica-Bold").fontSize(22).text("APPROVED EXEAT SLIP", {
            align: "center"
        });
        document.moveDown(0.5);
        document.fillColor("#4b5563").font("Helvetica").fontSize(10).text("Edo State University", {
            align: "center"
        });
        document.moveDown(2);
        document.fontSize(12);
        writeField("Student", exeat.student.fullName);
        writeField("Matriculation number", exeat.student.matriculationNumber);
        writeField("Department", exeat.student.department);
        writeField("Exeat type", exeat.exeatType);
        writeField("Destination", exeat.destination);
        writeField("Hostel", exeat.hostel);
        writeField("Departure date", formattedDate(exeat.departureDate));
        writeField("Return date", formattedDate(exeat.returnDate));
        writeField("Reason", exeat.reason);
        writeField("Status", "Approved");
        writeField("Approved on", exeat.reviewedAt ? formattedDate(exeat.reviewedAt) : "—");
        writeField("Approved by", exeat.reviewedBy?.fullName);
        if (exeat.adminComment) {
            writeField("Administrator comment", exeat.adminComment);
        }
        document.moveDown(2);
        document.fontSize(9).fillColor("#6b7280").text(
            "Please present this approved slip to the appropriate university personnel when required.",
            { align: "center" }
        );
        document.end();
    } catch (error) {
        console.error("Could not download exeat slip:", error);
        if (res.headersSent) {
            res.destroy();
            return;
        }
        return res.status(500).json({ message: "An error occurred while generating the exeat slip" });
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