const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/database");
const { protectAdminPage } = require("./middleware/auth");

const app = express();
app.use(express.json());

const allowOrigin = [
    "http://localhost:3000",
    process.env.CLIENT_URL
]

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowOrigin.indexOf(origin) === -1 && !origin.endsWith(".vercel.app")) {
            return callback(new Error("Not allowed by CORS"));
        }
        return callback(null, true);
    },
    credentials: true
}
))

app.get("/", (req, res) => {
  res.json({ message: "API is running..." });
});

const clientPath = path.resolve(__dirname, "../client");
const adminPagePath = path.join(clientPath, "admin.html");
const adminCreateUserPagePath = path.join(clientPath, "admin-create-user.html");

app.get("/client/admin.html", protectAdminPage, (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
  return res.sendFile(adminPagePath);
});

app.get("/client/admin-create-user.html", protectAdminPage, (req, res) => {
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
