const express = require("express");
const {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    createExeat,
    getExeats,
    getExeatById,
    updateExeat,
    deleteExeat,
    deleteAllExeats,
    stats,
    students,
    requests,
    updateRequest
} = require("../controllers/adminController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(protect, requireAdmin);

router.route("/users").post(createUser).get(getUsers);
router.route("/users/:id").get(getUserById).put(updateUser).patch(updateUser).delete(deleteUser);

router.get("/stats", stats);
router.get("/students", students);
router.get("/requests", requests);
router.patch("/requests/:id", updateRequest);

router.route("/exeats").post(createExeat).get(getExeats).delete(deleteAllExeats);
router.route("/exeats/:id").get(getExeatById).put(updateExeat).patch(updateExeat).delete(deleteExeat);

module.exports = router;