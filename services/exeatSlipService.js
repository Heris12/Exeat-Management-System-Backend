const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const emailjs = require("@emailjs/nodejs");
const Exeat = require("../models/Exeat");

const PAGE_MARGIN = 42;
const SLIP_VERSION = 6;

function formatDate(value) {
    if (!value) return "Not provided";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(new Date(value));
}

function getSlipStatus(exeat, now = new Date()) {
    if (exeat.slipRevokedAt) return "revoked";
    if (exeat.status !== "approved") return "not-approved";

    const departureDate = new Date(exeat.departureDate).toISOString().slice(0, 10);
    const returnDate = new Date(exeat.returnDate).toISOString().slice(0, 10);
    const start = new Date(`${departureDate}T00:00:00+01:00`);
    const end = new Date(`${returnDate}T23:59:59.999+01:00`);
    if (now < start) return "not-yet-valid";
    if (now > end) return "expired";
    return "valid";
}

function verificationUrl(token) {
    const configuredUrl = process.env.EXEAT_VERIFICATION_URL;
    const clientUrl = process.env.CLIENT_URL?.split(",")[0]?.trim();
    const base = configuredUrl || (clientUrl
        ? new URL("verify-exeat.html", `${clientUrl.replace(/\/+$/, "")}/`).toString()
        : "");
    if (!base) {
        throw new Error("EXEAT_VERIFICATION_URL or CLIENT_URL must be configured");
    }

    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("The exeat verification URL must use HTTP or HTTPS");
    }
    url.searchParams.set("token", token);
    return url.toString();
}

function slipDownloadUrl(token) {
    const configuredUrl = process.env.EXEAT_DOWNLOAD_URL;
    if (!configuredUrl) {
        throw new Error("EXEAT_DOWNLOAD_URL must be configured for permission-slip email links");
    }

    const url = new URL(configuredUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("The exeat download URL must use HTTP or HTTPS");
    }
    url.searchParams.set("token", token);
    return url.toString();
}

function addSection(document, title, y) {
    const width = document.page.width - PAGE_MARGIN * 2;
    document.roundedRect(PAGE_MARGIN, y, width, 22, 5)
        .fill("#e7f2eb");
    document.fillColor("#183c32").font("Helvetica-Bold").fontSize(9)
        .text(title.toUpperCase(), PAGE_MARGIN + 10, y + 6, { width: width - 20 });
    return y + 31;
}

function addField(document, label, value, x, y, width, height = 32) {
    document.fillColor("#64748b").font("Helvetica-Bold").fontSize(7)
        .text(label.toUpperCase(), x, y, { width, lineBreak: false });
    document.fillColor("#172b25").font("Helvetica").fontSize(9)
        .text(String(value || "Not provided"), x, y + 11, {
            width,
            height: height - 11,
            ellipsis: true
        });
}

async function createPdf(exeat, token) {
    const student = exeat.student;
    const reviewer = exeat.reviewedBy;
    const approverName = reviewer?.role === "portal"
        ? reviewer.fullName
        : reviewer?.role === "admin"
            ? "Admin"
            : reviewer?.fullName;
    const width = 595.28;
    const height = 841.89;
    const document = new PDFDocument({
        size: "A4",
        margin: PAGE_MARGIN,
        info: {
            Title: "Student Exeat Permission Form",
            Author: "Edo State University, Uzairue",
            Subject: `Official exeat pass ${exeat.exeatNumber}`
        }
    });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    const pdfPromise = new Promise((resolve, reject) => {
        document.on("end", () => resolve(Buffer.concat(chunks)));
        document.on("error", reject);
    });

    document.roundedRect(24, 24, width - 48, height - 48, 12)
        .lineWidth(1.5).strokeColor("#245c49").stroke();

    const logoPath = path.resolve(__dirname, "../../client/eui logo.png");
    if (fs.existsSync(logoPath)) {
        document.image(logoPath, PAGE_MARGIN + 4, 38, { fit: [54, 54] });
    }
    document.fillColor("#183c32").font("Helvetica-Bold").fontSize(14)
        .text("EDO STATE UNIVERSITY, UZAIRUE", 112, 42, {
            width: width - PAGE_MARGIN - 130,
            align: "center"
        });
    document.fillColor("#475569").font("Helvetica").fontSize(9)
        .text("STUDENT EXEAT PERMISSION FORM", 112, 62, {
            width: width - PAGE_MARGIN - 130,
            align: "center"
        });
    document.fillColor("#102b25").font("Helvetica-Bold").fontSize(16)
        .text("OFFICIAL EXEAT PASS", PAGE_MARGIN, 105, {
            width: width - PAGE_MARGIN * 2,
            align: "center"
        });

    document.roundedRect(width - PAGE_MARGIN - 112, 133, 112, 23, 11)
        .fill("#dcfce7");
    document.fillColor("#166534").font("Helvetica-Bold").fontSize(9)
        .text("APPROVED", width - PAGE_MARGIN - 112, 140, {
            width: 112,
            align: "center"
        });
    document.fillColor("#475569").font("Helvetica-Bold").fontSize(9)
        .text(`EXEAT NO.  ${exeat.exeatNumber}`, PAGE_MARGIN, 140, {
            width: width - PAGE_MARGIN * 2 - 124
        });

    let y = addSection(document, "Student information", 171);
    const contentWidth = width - PAGE_MARGIN * 2;
    const third = contentWidth / 3;
    [
        ["Full name", student.fullName],
        ["Matriculation number", student.matriculationNumber],
        ["Department", student.department],
        ["Faculty", student.faculty],
        ["Level", exeat.level || student.level],
        ["Hostel", exeat.hostel || student.hostel],
        ["Phone number", exeat.phoneNumber || student.phoneNumber],
        ["Email", student.email]
    ].forEach(([label, value], index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        addField(document, label, value, PAGE_MARGIN + column * third, y + row * 37, third - 10);
    });
    y += 3 * 37 + 4;

    y = addSection(document, "Exeat information", y);
    const half = contentWidth / 2;
    [
        ["Reason for leaving", exeat.reason],
        ["Destination", exeat.destination],
        ["Departure date", formatDate(exeat.departureDate)],
        ["Expected return date", formatDate(exeat.returnDate)]
    ].forEach(([label, value], index) => {
        const row = Math.floor(index / 2);
        const column = index % 2;
        addField(document, label, value, PAGE_MARGIN + column * half, y + row * 38, half - 12);
    });
    y += 2 * 38 + 4;

    y = addSection(document, "Approval information", y);
    addField(document, "Approved by", approverName, PAGE_MARGIN, y, half - 12);
    addField(document, "Approval date", formatDate(exeat.reviewedAt), PAGE_MARGIN + half, y, half - 12);
    addField(document, "Approval status", "Approved", PAGE_MARGIN, y + 38, half - 12);
    addField(document, "Validity", "Approved departure and return dates only", PAGE_MARGIN + half, y + 38, half - 12);

    y += 84;
    const verificationCode = exeat.exeatNumber;
    const qr = await QRCode.toBuffer(verificationUrl(token), {
        type: "png",
        errorCorrectionLevel: "H",
        margin: 1,
        width: 180
    });
    document.image(qr, PAGE_MARGIN, y, { fit: [82, 82] });
    document.fillColor("#183c32").font("Helvetica-Bold").fontSize(9)
        .text("SECURITY VERIFICATION", PAGE_MARGIN + 96, y + 2, { width: 300 });
    document.fillColor("#334155").font("Helvetica").fontSize(8)
        .text(`Verification code: ${verificationCode}`, PAGE_MARGIN + 96, y + 19, { width: 300 });
    document.text("Security officers: scan this QR code while signed in to the Security Portal, then confirm the live verification result before allowing departure.", PAGE_MARGIN + 96, y + 34, {
        width: contentWidth - 100,
        height: 35,
        lineGap: 2
    });
    document.fillColor("#b42318").font("Helvetica-Bold").fontSize(8)
        .text("WARNING: This pass is valid only for the approved departure and return dates. A revoked, expired, or not-yet-valid pass must not be accepted.", PAGE_MARGIN + 96, y + 72, {
            width: contentWidth - 100,
            height: 28,
            lineGap: 2
        });

    const signatureY = Math.max(y + 120, height - 105);
    const signatureWidth = (contentWidth - 32) / 3;
    ["Student signature", "Authorised officer signature", "Security officer signature"].forEach((label, index) => {
        const x = PAGE_MARGIN + index * (signatureWidth + 16);
        document.moveTo(x, signatureY).lineTo(x + signatureWidth, signatureY)
            .lineWidth(0.7).strokeColor("#64748b").stroke();
        document.fillColor("#475569").font("Helvetica").fontSize(7)
            .text(label, x, signatureY + 7, { width: signatureWidth, align: "center" });
    });

    document.fillColor("#64748b").font("Helvetica").fontSize(7)
        .text("Edo State University, Uzairue  |  Official electronic permission slip", PAGE_MARGIN, height - 64, {
            width: contentWidth,
            align: "center",
            height: 10
        });
    document.end();
    return pdfPromise;
}

async function sendSlipEmail(exeat, downloadUrl) {
    const serviceId = process.env.EMAILJS_SERVICE_ID || process.env.SERVICE_ID;
    const templateId = process.env.EMAILJS_EXEAT_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY || process.env.PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY || process.env.PRIVATE_KEY;
    const missingConfiguration = [
        !serviceId && "EMAILJS_SERVICE_ID (or SERVICE_ID)",
        !templateId && "EMAILJS_EXEAT_TEMPLATE_ID (or EMAILJS_TEMPLATE_ID)",
        !publicKey && "EMAILJS_PUBLIC_KEY (or PUBLIC_KEY)",
        !privateKey && "EMAILJS_PRIVATE_KEY (or PRIVATE_KEY)"
    ].filter(Boolean);
    if (missingConfiguration.length > 0) {
        throw new Error(`EmailJS is not configured: missing ${missingConfiguration.join(", ")}`);
    }
    if (!exeat.student?.email) {
        throw new Error("The student account has no registered email address");
    }

    await emailjs.send(serviceId, templateId, {
        to_email: exeat.student.email,
        email: exeat.student.email,
        user_name: exeat.student.fullName || "Student",
        to_name: exeat.student.fullName || "Student",
        exeat_number: exeat.exeatNumber,
        download_link: downloadUrl,
        download_button_text: "DOWNLOAD MY EXEAT SLIP"
    }, { publicKey, privateKey });
}

async function retrySlipEmail(exeat) {
    try {
        const downloadToken = crypto.randomBytes(32).toString("hex");
        const slipDownloadTokenHash = crypto.createHash("sha256").update(downloadToken).digest("hex");
        const result = await Exeat.updateOne(
            { _id: exeat._id, exeatNumber: exeat.exeatNumber, status: "approved", slipRevokedAt: null },
            { $set: { slipDownloadTokenHash } }
        );
        if (result.matchedCount !== 1) {
            throw new Error("The approved permission slip is no longer available");
        }
        await sendSlipEmail(exeat, slipDownloadUrl(downloadToken));
        await Exeat.updateOne(
            { _id: exeat._id, exeatNumber: exeat.exeatNumber },
            { $set: { slipEmailSentAt: new Date() }, $unset: { slipEmailError: "" } }
        );
        return true;
    } catch (error) {
        console.error("Could not email approved exeat slip:", error.message);
        await Exeat.updateOne(
            { _id: exeat._id, exeatNumber: exeat.exeatNumber },
            { $set: { slipEmailError: error.message.slice(0, 250) } }
        );
        return false;
    }
}

async function issueApprovedSlip(exeat) {
    await exeat.populate("student", "fullName email matriculationNumber department faculty level phoneNumber hostel");
    await exeat.populate("reviewedBy", "fullName email role");

    const storedSlip = await Exeat.findById(exeat._id)
        .select("+slipPdf +verificationTokenHash +slipDownloadTokenHash");
    const hasPreviousSlip = Boolean(exeat.exeatNumber);
    const hasCompleteSlip = Boolean(
        storedSlip?.exeatNumber &&
        storedSlip.slipGeneratedAt &&
        storedSlip.verificationTokenHash &&
        storedSlip.slipDownloadTokenHash &&
        storedSlip.slipVersion === SLIP_VERSION &&
        storedSlip.slipPdf?.length
    );
    if (hasCompleteSlip && !storedSlip.slipRevokedAt) {
        const emailSent = exeat.slipEmailSentAt
            ? true
            : await retrySlipEmail(exeat);
        return { exeatNumber: exeat.exeatNumber, emailSent, alreadyGenerated: true };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const downloadToken = crypto.randomBytes(32).toString("hex");
    const slipDownloadTokenHash = crypto.createHash("sha256").update(downloadToken).digest("hex");
    const exeatNumber = hasPreviousSlip
        ? exeat.exeatNumber
        : `ESU-${new Date().getFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const slipGeneratedAt = new Date();
    const pdf = await createPdf(exeat, token);

    let saved;
    try {
        saved = await Exeat.findOneAndUpdate(
            hasPreviousSlip
                ? {
                    _id: exeat._id,
                    status: "approved",
                    exeatNumber,
                    $or: [
                        { slipRevokedAt: { $exists: true } },
                        { slipPdf: { $exists: false } },
                        { slipPdf: null },
                        { verificationTokenHash: { $exists: false } },
                        { verificationTokenHash: null },
                        { slipDownloadTokenHash: { $exists: false } },
                        { slipDownloadTokenHash: null },
                        { slipGeneratedAt: { $exists: false } },
                        { slipGeneratedAt: null },
                        { slipVersion: { $ne: SLIP_VERSION } }
                    ]
                }
                : { _id: exeat._id, status: "approved", exeatNumber: { $exists: false } },
            {
                $set: {
                    exeatNumber,
                    verificationTokenHash,
                    slipDownloadTokenHash,
                    slipGeneratedAt,
                    slipVersion: SLIP_VERSION,
                    slipApprovedBy: exeat.reviewedBy?._id || exeat.reviewedBy,
                    slipPdf: pdf
                },
                $unset: { slipRevokedAt: "", slipEmailSentAt: "", slipEmailError: "" }
            },
            { returnDocument: "after", runValidators: true }
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
    }

    if (!saved) {
        const existing = await Exeat.findById(exeat._id).select("+slipPdf");
        if (!existing?.exeatNumber || !existing.slipGeneratedAt || !existing.slipPdf?.length) {
            throw new Error("Could not save the approved exeat slip");
        }
        return { exeatNumber: existing.exeatNumber, emailSent: Boolean(existing.slipEmailSentAt), alreadyGenerated: true };
    }

    try {
        await sendSlipEmail(exeat, slipDownloadUrl(downloadToken));
        await Exeat.updateOne(
            { _id: exeat._id, exeatNumber },
            { $set: { slipEmailSentAt: new Date() }, $unset: { slipEmailError: "" } }
        );
        return { exeatNumber, emailSent: true, alreadyGenerated: false };
    } catch (error) {
        console.error("Could not email approved exeat slip:", error.message);
        await Exeat.updateOne(
            { _id: exeat._id, exeatNumber },
            { $set: { slipEmailError: error.message.slice(0, 250) } }
        );
        return { exeatNumber, emailSent: false, alreadyGenerated: false };
    }
}

module.exports = {
    createPdf,
    issueApprovedSlip,
    getSlipStatus,
    SLIP_VERSION
};
