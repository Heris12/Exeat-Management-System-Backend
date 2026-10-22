const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/database");
const { protect, requireAdmin } = require("./middleware/auth");

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.json({ message: "API is running..." });
});

const clientPath = path.resolve(__dirname, "../client");
const adminPagePath = path.join(clientPath, "html", "admin.html");
const adminCreateUserPagePath = path.join(clientPath, "html", "admin-create-user.html");

app.get("/client/html/admin.html", protect, requireAdmin, (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
  return res.sendFile(adminPagePath);
});

app.get("/client/html/admin-create-user.html", protect, requireAdmin, (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
  return res.sendFile(adminCreateUserPagePath);
});

app.use("/client", express.static(clientPath, { index: false }));

app.use("/api/exeats", require("./routes/exeatRoute"));
app.use("/api/auth", require("./routes/authRoute"));
app.use("/api/admin", require("./routes/adminRoute"));

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Could not start the server:", error.message);
    process.exitCode = 1;
  });
