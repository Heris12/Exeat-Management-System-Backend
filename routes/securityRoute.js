const express = require("express");
const {
    getApprovedExeats,
    confirmDeparture,
    confirmReturn
} = require("../controllers/securityController");
const { protect, requireSecurity } = require("../middleware/auth");

const router = express.Router();

router.use(protect, requireSecurity);
router.get("/exeats", getApprovedExeats);
router.patch("/exeats/:id/departure", confirmDeparture);
router.patch("/exeats/:id/return", confirmReturn);

module.exports = router;
