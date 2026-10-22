const express = require("express");
const { register, login, logout, getMe, getUsers } = require("../controllers/authController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.get("/users", protect, requireAdmin, getUsers);

module.exports = router;
