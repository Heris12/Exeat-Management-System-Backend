const express = require("express");
const router = express.Router();
const { getAllExeats, createExeat, getExeatById, downloadExeatSlip, downloadExeatSlipByToken, updateExeatStatus, deleteExeat } = require("../controllers/exeatController");
const { protect, requireAdmin, requireStudent } = require("../middleware/auth");

router.get("/slip/download", downloadExeatSlipByToken);
router.use(protect);
router.get("/", getAllExeats);
router.post("/", requireStudent, createExeat);
router.get("/:id/slip", requireStudent, downloadExeatSlip);
router.get("/:id", getExeatById);
router.put("/:id/status", requireAdmin, updateExeatStatus);
router.delete("/:id", requireAdmin, deleteExeat);

module.exports = router;