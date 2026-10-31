const express = require("express");
const { getHostelData, reviewHostelRequest } = require("../controllers/wardenController");
const { protect, requireWarden } = require("../middleware/auth");

const router = express.Router();

router.use(protect, requireWarden);
router.get("/hostel", getHostelData);
router.patch("/requests/:id", reviewHostelRequest);

module.exports = router;
