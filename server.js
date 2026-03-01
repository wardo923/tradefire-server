// server.js
const express = require("express");

const app = express();

// Railway/Cloud uses PORT env var. MUST use this.
const PORT = process.env.PORT || 8080;

// Parse JSON bodies
app.use(express.json({ limit: "2mb" }));

// Basic home route (so "/" does NOT show Cannot GET /)
app.get("/", (req, res) => {
  res.status(200).send("TradeFire server running ✅");
});

// Health check route (so "/health" works)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Example webhook endpoint (TradingView / alerts can POST here)
app.post("/webhook", (req, res) => {
  console.log("Webhook received:", req.body);
  res.status(200).json({ received: true });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});