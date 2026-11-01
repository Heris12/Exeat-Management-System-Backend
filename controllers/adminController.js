const mongoose = require("mongoose");
const User = require("../models/user");
const Exeat = require("../models/Exeat");
const { issueApprovedSlip } = require("../services/exeatSlipService");

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const faculties = [
    "Faculty of Science",
    "Faculty of Arts",
    "Faculty of Engineering",
    "Faculty of Law"
];

function publicUser(user) {
    return {
        id: user._id,
        fullName: user.fullName,
        matriculationNumber: user.matriculationNumber,
        department: user.department,
        faculty: user.faculty,
        level: user.level,
        phoneNumber: user.phoneNumber,
        email: user.email,
        hostel: user.hostel,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function isObjectBody(body) {
    return body !== null && typeof body === "object" && !Array.isArray(body);
}

function sendError(res, error, action, role) {
    if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
        const messages = {
            email: "An account with this email already exists",
            matriculationNumber: "This matriculation number is already registered",
            fullName: "An account with this full name already exists"
        };
        if (role === "portal" && field === "matriculationNumber") {
            return res.status(409).json({
                message: "A hostel warden portal account already exists"
            });
        }
        return res.status(409).json({
            message: messages[field] || "A record with these details already exists"
        });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
        return res.status(400).json({ message: error.message });
    }

    console.error(`${action}:`, error);
    return res.status(500).json({ message: `Unable to ${action}` });
}

function getValidId(req, res) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        res.status(400).json({ message: "Invalid ID" });
        return null;
    }
    return id;
}

async function populateExeat(exeat) {
    await exeat.populate("student", "fullName email matriculationNumber department hostel");
    await exeat.populate("reviewedBy", "fullName email");
    return exeat;
}

exports.createUser = async (req, res) => {
    let role;
    try {
        const body = req.body;
        if (!isObjectBody(body)) {
            return res.status(400).json({ message: "A user object is required" });
        }

        role = body.role || "student";
        if (!["student", "portal", "admin", "security"].includes(role)) {
            return res.status(400).json({ message: "Invalid role value" });
        }

        const matriculationNumber = body.matriculationNumber ?? body.matricNumber;
        const requiredFields = [body.fullName, body.email, body.password];
        if (role === "student") {
            requiredFields.push(matriculationNumber, body.department, body.faculty, body.hostel);
        }
        if (role === "portal") requiredFields.push(body.hostel);
        if (!requiredFields.every((value) => typeof value === "string" && value.trim())) {
            return res.status(400).json({
                message: role === "admin"
                    ? "Full name, email, and password are required"
                    : role === "portal"
                        ? "Full name, email, password, and hostel are required"
                        : role === "security"
                            ? "Full name, email, and password are required"
                            : "Full name, matriculation number, department, faculty, email, password, and hostel are required"
            });
        }
        if (role === "student" && !faculties.includes(body.faculty.trim())) {
            return res.status(400).json({ message: "Select a valid faculty" });
        }
        if (["student", "portal"].includes(role) && !/^Hall [1-8]$/.test(body.hostel)) {
            return res.status(400).json({ message: "Select a valid hostel hall" });
        }

        const user = await User.create({
            fullName: body.fullName.trim(),
            email: body.email.trim().toLowerCase(),
            password: body.password,
            role,
            ...(matriculationNumber ? { matriculationNumber: matriculationNumber.trim() } : {}),
            ...(body.department ? { department: body.department.trim() } : {}),
            ...(body.faculty ? { faculty: body.faculty.trim() } : {}),
            ...(body.level ? { level: body.level.trim() } : {}),
            ...(body.phoneNumber ? { phoneNumber: body.phoneNumber.trim() } : {}),
            ...(body.hostel ? { hostel: body.hostel } : {})
        });
        return res.status(201).json({
            message: "User created successfully",
            user: publicUser(user)
        });
    } catch (error) {
        return sendError(res, error, "create user", role);
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: "student" }).sort({ createdAt: -1 });
        return res.status(200).json({ users: users.map(publicUser) });
    } catch (error) {
        return sendError(res, error, "fetch users");
    }
};

exports.getUserById = async (req, res) => {
    const id = getValidId(req, res);
    if (!id) return;

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ user: publicUser(user) });
    } catch (error) {
        return sendError(res, error, "fetch user");
    }
};

exports.updateUser = async (req, res) => {
    const id = getValidId(req, res);
    if (!id) return;

    try {
        const body = req.body;
        if (!isObjectBody(body)) {
            return res.status(400).json({ message: "A user object is required" });
        }

        const updates = {};
        for (const field of ["fullName", "department", "faculty", "level", "phoneNumber", "email", "password", "role", "hostel"]) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                updates[field] = body[field];
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, "matriculationNumber") ||
            Object.prototype.hasOwnProperty.call(body, "matricNumber")) {
            updates.matriculationNumber = body.matriculationNumber ?? body.matricNumber;
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No supported user fields were provided" });
        }
        if (updates.role !== undefined && !["student", "portal", "admin", "security"].includes(updates.role)) {
            return res.status(400).json({ message: "Invalid role value" });
        }
        if (updates.hostel !== undefined && updates.hostel !== "" && !/^Hall [1-8]$/.test(updates.hostel)) {
            return res.status(400).json({ message: "Select a valid hostel hall" });
        }
        if (
            updates.faculty !== undefined &&
            (typeof updates.faculty !== "string" || !faculties.includes(updates.faculty.trim()))
        ) {
            return res.status(400).json({ message: "Select a valid faculty" });
        }
        if (typeof updates.email === "string") {
            updates.email = updates.email.trim().toLowerCase();
        }
        if (typeof updates.fullName === "string") updates.fullName = updates.fullName.trim();
        if (typeof updates.matriculationNumber === "string") {
            updates.matriculationNumber = updates.matriculationNumber.trim();
        }
        if (typeof updates.department === "string") updates.department = updates.department.trim();
        if (typeof updates.faculty === "string") updates.faculty = updates.faculty.trim();
        if (typeof updates.level === "string") updates.level = updates.level.trim();
        if (typeof updates.phoneNumber === "string") updates.phoneNumber = updates.phoneNumber.trim();

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const resultingRole = updates.role || user.role;
        if (resultingRole === "portal" && !(updates.hostel || user.hostel)) {
            return res.status(400).json({ message: "Assign a hostel hall to the warden" });
        }
        if (
            resultingRole === "student" &&
            (updates.hostel !== undefined || updates.role === "student") &&
            !/^Hall [1-8]$/.test(updates.hostel || user.hostel || "")
        ) {
            return res.status(400).json({ message: "Assign a valid hostel hall to the student" });
        }
        if (["admin", "security"].includes(resultingRole)) {
            updates.hostel = undefined;
        }
        Object.assign(user, updates);
        await user.save();
        return res.status(200).json({
            message: "User updated successfully",
            user: publicUser(user)
        });
    } catch (error) {
        return sendError(res, error, "update user");
    }
};

exports.deleteUser = async (req, res) => {
    const id = getValidId(req, res);
    if (!id) return;

    try {
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        return sendError(res, error, "delete user");
    }
};

exports.createExeat = async (req, res) => {
    try {
        const body = req.body;
        if (!isObjectBody(body)) {
            return res.status(400).json({ message: "An exeat object is required" });
        }
        if (!body.student || !mongoose.isValidObjectId(body.student)) {
            return res.status(400).json({ message: "A valid student ID is required" });
        }
        const student = await User.findById(body.student);
        if (!student) {
            return res.status(404).json({ message: "Student not found" });
        }
        if (body.status !== undefined && !["pending", "approved", "rejected"].includes(body.status)) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        const departureDate = new Date(body.departureDate);
        const returnDate = new Date(body.returnDate);
        const departureTime = body.departureTime || "08:00";
        const returnTime = body.returnTime || "18:00";
        if (Number.isNaN(departureDate.getTime()) || Number.isNaN(returnDate.getTime())) {
            return res.status(400).json({ message: "Valid departure and return dates are required" });
        }
        if (!timePattern.test(departureTime) || !timePattern.test(returnTime)) {
            return res.status(400).json({ message: "Departure and return times must use HH:MM format" });
        }
        if (departureDate >= returnDate) {
            return res.status(400).json({ message: "Return date must be after departure date" });
        }

        const status = body.status || "pending";
        const exeat = await Exeat.create({
            student: student._id,
            exeatType: body.exeatType,
            destination: body.destination,
            hostel: body.hostel,
            departureDate,
            departureTime,
            returnDate,
            returnTime,
            reason: body.reason,
            status,
            adminComment: body.adminComment,
            ...(status !== "pending"
                ? { reviewedBy: req.user?._id, reviewedAt: new Date() }
                : {})
        });
        const permissionSlip = status === "approved"
            ? await issueApprovedSlip(exeat)
            : null;
        await populateExeat(exeat);
        return res.status(201).json({
            message: permissionSlip && !permissionSlip.emailSent
                ? "Exeat created and permission slip generated, but email delivery failed."
                : "Exeat created successfully",
            ...(permissionSlip ? { permissionSlip } : {}),
            exeat
        });
    } catch (error) {
        return sendError(res, error, "create exeat");
    }
};

exports.getExeats = async (req, res) => {
    try {
        const exeats = await Exeat.find()
            .sort({ createdAt: -1 })
            .populate("student", "fullName email matriculationNumber department hostel")
            .populate("reviewedBy", "fullName email");
        return res.status(200).json({ exeats });
    } catch (error) {
        return sendError(res, error, "fetch exeats");
    }
};

exports.getExeatById = async (req, res) => {
    const id = getValidId(req, res);
    if (!id) return;

    try {
        const exeat = await Exeat.findById(id);
        if (!exeat) {
            return res.status(404).json({ message: "Exeat not found" });
        }
        await populateExeat(exeat);
        return res.status(200).json({ exeat });
    } catch (error) {
        return sendError(res, error, "fetch exeat");
    }
};

exports.updateExeat = async (req, res) => {
    const id = getValidId(req, res);
    if (!id) return;

    try {
        const body = req.body;
        if (!isObjectBody(body)) {
            return res.status(400).json({ message: "An exeat object is required" });
        }

        const exeat = await Exeat.findById(id);
        if (!exeat) {
            return res.status(404).json({ message: "Exeat not found" });
        }

        if (exeat.status !== "pending") {
            if (body.status === "approved" && exeat.status === "approved") {
                const permissionSlip = await issueApprovedSlip(exeat);
                return res.status(200).json({
                    message: permissionSlip.emailSent
                        ? "This exeat was already approved and its permission slip is available."
                        : "This exeat was already approved; email delivery is still unavailable.",
                    permissionSlip
                });
            }
            return res.status(409).json({ message: "This exeat request has already been reviewed" });
        }

        const fields = [
            "exeatType",
            "destination",
            "hostel",
            "departureDate",
            "departureTime",
            "returnDate",
            "returnTime",
            "reason",
            "status",
            "adminComment"
        ];
        const suppliedFields = fields.filter((field) =>
            Object.prototype.hasOwnProperty.call(body, field)
        );
        if (Object.prototype.hasOwnProperty.call(body, "student")) {
            if (!mongoose.isValidObjectId(body.student)) {
                return res.status(400).json({ message: "A valid student ID is required" });
            }
            const student = await User.findById(body.student);
            if (!student) {
                return res.status(404).json({ message: "Student not found" });
            }
            exeat.student = student._id;
            suppliedFields.push("student");
        }
        if (suppliedFields.length === 0) {
            return res.status(400).json({ message: "No supported exeat fields were provided" });
        }
        if (body.status !== undefined && !["pending", "approved", "rejected"].includes(body.status)) {
            return res.status(400).json({ message: "Invalid status value" });
        }
        if (
            (body.departureTime !== undefined && !timePattern.test(body.departureTime)) ||
            (body.returnTime !== undefined && !timePattern.test(body.returnTime))
        ) {
            return res.status(400).json({ message: "Departure and return times must use HH:MM format" });
        }

        for (const field of fields) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                exeat[field] = body[field];
            }
        }
        const departureDate = new Date(exeat.departureDate);
        const returnDate = new Date(exeat.returnDate);
        if (Number.isNaN(departureDate.getTime()) || Number.isNaN(returnDate.getTime())) {
            return res.status(400).json({ message: "Valid departure and return dates are required" });
        }
        if (departureDate >= returnDate) {
            return res.status(400).json({ message: "Return date must be after departure date" });
        }
        if (Object.prototype.hasOwnProperty.call(body, "status")) {
            exeat.reviewedBy = body.status === "pending" ? null : req.user?._id;
            exeat.reviewedAt = body.status === "pending" ? null : new Date();
            if (body.status !== "approved") {
                exeat.departureConfirmedBy = null;
                exeat.departureConfirmedAt = null;
                exeat.returnConfirmedBy = null;
                exeat.returnConfirmedAt = null;
                if (exeat.exeatNumber) {
                    exeat.slipRevokedAt = new Date();
                }
            }
        }

        await exeat.save();
        let slipResult = null;
        if (exeat.status === "approved" && body.status === "approved") {
            slipResult = await issueApprovedSlip(exeat);
        }
        await populateExeat(exeat);
        return res.status(200).json({
            message: slipResult && !slipResult.emailSent
                ? "Exeat approved and permission slip generated, but the email could not be sent."
                : "Exeat updated successfully",
            ...(slipResult ? { permissionSlip: slipResult } : {}),
            exeat
        });
    } catch (error) {
        return sendError(res, error, "update exeat");
    }
};

exports.deleteExeat = async (req, res) => {
    const id = getValidId(req, res);
    if (!id) return;

    try {
        const exeat = await Exeat.findByIdAndDelete(id);
        if (!exeat) {
            return res.status(404).json({ message: "Exeat not found" });
        }
        return res.status(200).json({ message: "Exeat deleted successfully" });
    } catch (error) {
        return sendError(res, error, "delete exeat");
    }
};

exports.deleteAllExeats = async (req, res) => {
    try {
        const result = await Exeat.deleteMany({});
        return res.status(200).json({
            message: "All exeat requests deleted successfully",
            deletedCount: result.deletedCount
        });
    } catch (error) {
        return sendError(res, error, "delete all exeat requests");
    }
};

exports.stats = async (req, res) => {
    try {
        const [students, wardens, security, totalRequests, pending, approved, rejected] = await Promise.all([
            User.countDocuments({ role: "student" }),
            User.countDocuments({ role: "portal" }),
            User.countDocuments({ role: "security" }),
            Exeat.countDocuments(),
            Exeat.countDocuments({ status: "pending" }),
            Exeat.countDocuments({ status: "approved" }),
            Exeat.countDocuments({ status: "rejected" })
        ]);

        return res.status(200).json({
            stats: { students, wardens, security, totalRequests, pending, approved, rejected }
        });
    } catch (error) {
        return sendError(res, error, "fetch admin statistics");
    }
};

exports.getAllUsers = exports.getUsers;
exports.getAllExeats = exports.getExeats;
exports.students = exports.getUsers;
exports.requests = exports.getExeats;
exports.updateRequest = exports.updateExeat;
