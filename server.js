const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const dotenv = require("dotenv");
const connectDB = require("./config/database");
const {
  protectAdminPage,
  protectWardenPage,
  protectSecurityPage
} = require("./middleware/auth");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const clientPath = path.resolve(__dirname, "../client");
const adminPagePath = path.join(clientPath, "admin.html");
const adminCreateUserPagePath = path.join(clientPath, "admin-create-user.html");
const wardenPagePath = path.join(clientPath, "warden.html");
const securityPagePath = path.join(clientPath, "security.html");
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("CLIENT_URL must contain valid HTTP or HTTPS URLs");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.origin === "null") {
      throw new Error("CLIENT_URL must contain valid HTTP or HTTPS URLs");
    }
    return url.origin;
  });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    try {
      const url = new URL(origin);
      return callback(
        null,
        ["http:", "https:"].includes(url.protocol) &&
          ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      );
    } catch {
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ message: "API is running..." });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

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

app.get("/client/warden.html", protectWardenPage, (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
  return res.sendFile(wardenPagePath);
});

app.get("/client/security.html", protectSecurityPage, (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  });
  return res.sendFile(securityPagePath);
});

app.use("/client", express.static(clientPath, { index: false }));

app.use("/api/exeats", require("./routes/exeatRoute"));
app.use("/api/auth", require("./routes/authRoute"));
app.use("/api/auth", require("./routes/passwordResetRoutes"));
app.use("/api/admin", require("./routes/adminRoute"));
app.use("/api/warden", require("./routes/wardenRoute"));
app.use("/api/security", require("./routes/securityRoute"));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "API route not found" });
  }
  return res.status(404).json({ message: "Not found" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body must be 1 MB or smaller" });
  }
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ message: "Request body must contain valid JSON" });
  }

  console.error("Unhandled server error:", error);
  return res.status(500).json({ message: "An unexpected server error occurred" });
});

async function startServer() {
  try {
    await connectDB();
    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
    server.on("error", (error) => {
      console.error("Could not start the HTTP server:", error.message);
      process.exitCode = 1;
    });
    return server;
  } catch (error) {
    console.error("Could not start the server:", error.message);
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
