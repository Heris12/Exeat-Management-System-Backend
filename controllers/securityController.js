const mongoose = require("mongoose");
const crypto = require("crypto");
const Exeat = require("../models/Exeat");
const { getSlipStatus } = require("../services/exeatSlipService");

const studentFields = "fullName email matriculationNumber department hostel";

exports.verifyExeatPass = async (req, res) => {
    const token = req.query.token;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({ message: "A valid verification code is required" });
    }

    try {
        const verificationTokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const exeat = await Exeat.findOne({ verificationTokenHash })
            .select("+verificationTokenHash")
            .populate("student", "fullName matriculationNumber");
        if (!exeat || !exeat.student) {
            return res.status(404).json({ message: "This permission slip could not be verified" });
        }

        const status = getSlipStatus(exeat);
        return res.status(200).json({
            valid: status === "valid",
            status,
            exeatNumber: exeat.exeatNumber,
            student: {
                fullName: exeat.student.fullName,
                matriculationNumber: exeat.student.matriculationNumber
            },
            departureDate: exeat.departureDate,
            returnDate: exeat.returnDate
        });
    } catch (error) {
        console.error("Could not verify exeat permission slip:", error.message);
        return res.status(500).json({ message: "Unable to verify this permission slip" });
    }
};

exports.getApprovedExeats = async (req, res) => {
    try {
        const exeats = await Exeat.find({ status: "approved" })
            .sort({ departureDate: 1 })
            .populate("student", studentFields)
            .populate("departureConfirmedBy", "fullName email")
            .populate("returnConfirmedBy", "fullName email");
        return res.status(200).json({ exeats });
    } catch (error) {
        console.error("Could not load approved exeats for security:", error.message);
        return res.status(500).json({ message: "Unable to load approved exeat requests" });
    }
};

exports.confirmDeparture = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid request ID" });
    }

    try {
        const exeat = await Exeat.findOneAndUpdate(
            {
                _id: req.params.id,
                status: "approved",
                departureConfirmedAt: null
            },
            {
                $set: {
                    departureConfirmedAt: new Date(),
                    departureConfirmedBy: req.user._id
                }
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!exeat) {
            const existingExeat = await Exeat.findById(req.params.id);
            if (!existingExeat) {
                return res.status(404).json({ message: "Exeat request not found" });
            }
            if (existingExeat.status !== "approved") {
                return res.status(409).json({ message: "Only approved exeat requests can be confirmed" });
            }
            return res.status(409).json({
                message: existingExeat.departureConfirmedAt
                    ? "Departure has already been confirmed"
                    : "Departure could not be confirmed"
            });
        }

        await exeat.populate("student", studentFields);
        await exeat.populate("departureConfirmedBy", "fullName email");
        return res.status(200).json({
            message: "Student departure confirmed successfully",
            exeat
        });
    } catch (error) {
        console.error("Could not confirm student departure:", error.message);
        return res.status(500).json({ message: "Unable to confirm student departure" });
    }
};

exports.confirmReturn = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid request ID" });
    }

    try {
        const exeat = await Exeat.findOneAndUpdate(
            {
                _id: req.params.id,
                status: "approved",
                departureConfirmedAt: { $ne: null },
                returnConfirmedAt: null
            },
            {
                $set: {
                    returnConfirmedAt: new Date(),
                    returnConfirmedBy: req.user._id
                }
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!exeat) {
            const existingExeat = await Exeat.findById(req.params.id);
            if (!existingExeat) {
                return res.status(404).json({ message: "Exeat request not found" });
            }
            if (existingExeat.status !== "approved") {
                return res.status(409).json({ message: "Only approved exeat requests can be confirmed" });
            }
            if (!existingExeat.departureConfirmedAt) {
                return res.status(409).json({ message: "Confirm the student's departure before confirming their return" });
            }
            return res.status(409).json({ message: "Student return has already been confirmed" });
        }

        await exeat.populate("student", studentFields);
        await exeat.populate("returnConfirmedBy", "fullName email");
        return res.status(200).json({
            message: "Student return confirmed successfully",
            exeat
        });
    } catch (error) {
        console.error("Could not confirm student return:", error.message);
        return res.status(500).json({ message: "Unable to confirm student return" });
    }
};
