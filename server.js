// server.js
// TradeFire Webhook Server (Railway-ready)

const express = require("express");

const app = express();

// Railway / Heroku style PORT
const PORT = process.env.PORT || 8080;

// Parse JSON bodies (TradingView sends JSON)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- ROUTES ---

// Root (so opening the domain in Safari shows something)
app.get("/", (req, res) => {
  res.status(200).send("TradeFire Server Running");
});

// Health check (useful for Railway + sanity checks)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// TradingView webhook endpoint
app.post("/webhook", (req, res) => {
  // Log the incoming alert (shows in Railway logs)
  console.log("---- TradingView Webhook Received ----");
  console.log("Time:", new Date().toISOString());
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  // Reply fast so TradingView is happy
  res.status(200).json({ received: true });
});

// Optional: show a friendly message if someone visits /webhook in browser
app.get("/webhook", (req, res) => {
  res
    .status(200)
    .send("Webhook endpoint is live. Send POST requests here from TradingView.");
});

// Catch-all (helps avoid 'Cannot GET /something' confusion)
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
    hint: "Try GET / or GET /health. TradingView should POST to /webhook.",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`TradeFire server listening on port ${PORT}`);
});