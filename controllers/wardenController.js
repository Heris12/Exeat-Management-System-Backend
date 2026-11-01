const mongoose = require("mongoose");
const Exeat = require("../models/Exeat");
const User = require("../models/user");
const { issueApprovedSlip } = require("../services/exeatSlipService");

function publicStudent(student) {
    return {
        id: student._id,
        fullName: student.fullName,
        matriculationNumber: student.matriculationNumber,
        department: student.department,
        hostel: student.hostel
    };
}

exports.getHostelData = async (req, res) => {
    try {
        const requestFilter = { hostel: req.user.hostel };
        const [studentIds, requests, pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
            Exeat.distinct("student", requestFilter),
            Exeat.find(requestFilter)
                .sort({ createdAt: -1 })
                .populate("student", "fullName matriculationNumber department hostel")
                .populate("reviewedBy", "fullName"),
            Exeat.countDocuments({ ...requestFilter, status: "pending" }),
            Exeat.countDocuments({ ...requestFilter, status: "approved" }),
            Exeat.countDocuments({ ...requestFilter, status: "rejected" })
        ]);
        const students = await User.find({
            role: "student",
            $or: [
                { hostel: req.user.hostel },
                { _id: { $in: studentIds } }
            ]
        }).sort({ fullName: 1 });

        return res.status(200).json({
            hostel: req.user.hostel,
            stats: {
                students: students.length,
                requests: requests.length,
                pendingRequests,
                approvedRequests,
                rejectedRequests
            },
            students: students.map((student) => ({
                ...publicStudent(student),
                hostel: student.hostel || req.user.hostel
            })),
            requests
        });
    } catch (error) {
        console.error("Could not load warden hostel portal:", error.message);
        return res.status(500).json({ message: "Unable to load hostel portal data" });
    }
};

exports.reviewHostelRequest = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid request ID" });
    }
    const { status } = req.body ?? {};
    if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be approved or rejected" });
    }

    try {
        const exeat = await Exeat.findOne({
            _id: req.params.id,
            hostel: req.user.hostel
        });
        if (!exeat) {
            return res.status(404).json({ message: "Request not found in your assigned hostel" });
        }
        if (exeat.status !== "pending") {
            return res.status(409).json({ message: "This exeat request has already been reviewed" });
        }

        exeat.status = status;
        exeat.adminComment = "";
        exeat.reviewedBy = req.user._id;
        exeat.reviewedAt = new Date();
        await exeat.save();
        await exeat.populate("student", "fullName matriculationNumber department hostel");
        const permissionSlip = status === "approved"
            ? await issueApprovedSlip(exeat)
            : null;

        return res.status(200).json({
            message: permissionSlip && !permissionSlip.emailSent
                ? "Exeat request approved and permission slip generated, but email delivery failed."
                : `Exeat request ${status} successfully`,
            ...(permissionSlip ? { permissionSlip } : {}),
            exeat
        });
    } catch (error) {
        console.error("Could not review hostel exeat request:", error.message);
        return res.status(500).json({ message: "Unable to review exeat request" });
    }
};
